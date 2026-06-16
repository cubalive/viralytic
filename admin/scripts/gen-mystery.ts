// Video de FRASE MISTERIOSA sincronizada al beat (cortes al bajo). Salida 9:16.
// Uso: tsx scripts/gen-mystery.ts [mood]   (default retencion-tiktok)
import path from 'node:path';
import fsp from 'node:fs/promises';
import { detectBeats } from '../src/beat/detect';
import { getMoodTrack } from '../src/audio/soundbank';
import { geminiImage } from '../src/ai/gemini-image';
import { geminiJson } from '../src/ai/gemini';
import { ff, probeDuration } from '../src/lib/ffmpeg';
import { uploadPublic } from '../src/lib/storage';
import { ensureDir } from '../src/lib/files';
import { config, OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';

const mood = process.argv[2] || 'retencion-tiktok';
const dir = path.join(OUTPUT_DIR, 'mystery', mood);
await ensureDir(dir);
const esc = (s: string) => s.replace(/\\/g, '/').replace(/:/g, '\\:');

// 1) Música del banco
log.step('1/5 Música');
const music = await getMoodTrack(mood, path.join(dir, 'music.mp3'));
const dur = await probeDuration(music);

// 2) Detectar golpes de bajo
log.step('2/5 Detectando golpes de bajo');
const all = await detectBeats(music, { minGap: 0.3 });
const beats = all.filter((b) => b >= 0.2 && b < Math.min(dur, 28));
const N = Math.min(beats.length, 22);
const use = beats.slice(0, N);
log.ok(`${use.length} golpes usados (de ${all.length}) — mucha sincronización`);

// 3) Frase de DESPERTAR (positiva, desnuda la sociedad y empodera)
log.step('3/5 Frase de despertar');
const SCHEMA = { type: 'object', properties: { fragmentos: { type: 'array', items: { type: 'string' } }, frase: { type: 'string' } }, required: ['fragmentos', 'frase'] };
const sys =
  'Eres un maestro de mensajes virales de DESPERTAR y consciencia (de los que paran el scroll y hacen reflexionar). ' +
  'Creas una frase CORTA en español que: (1) engancha con intriga; (2) DESNUDA una verdad incómoda de la sociedad ' +
  '(la rutina, dormir despierto, seguir sin pensar, vivir para otros); (3) TERMINA con un giro de DESPERTAR ' +
  'PODEROSO y POSITIVO — sobre encontrarte contigo, tu energía, tu progreso, no volver atrás nunca. ' +
  'El final empodera, da esperanza y deja pensando. La divides en fragmentos muy cortos (1-4 palabras), uno por ' +
  'golpe de música, con ritmo creciente. Tono profundo, despierto, inspirador (no infantil, NO nihilista). Devuelve SOLO JSON.';
const { fragmentos } = await geminiJson<{ fragmentos: string[]; frase: string }>(
  `Crea un mensaje de despertar en EXACTAMENTE ${N} fragmentos cortos (1-4 palabras), que enganche, desnude una verdad de la sociedad y termine con un despertar poderoso y positivo. {fragmentos:[...], frase:"..."}`,
  SCHEMA, sys);

// 4) Imágenes REALISTAS y variadas (ciudades, lugares hermosos, naturaleza), 9:16
log.step('4/5 Imágenes realistas variadas');
const THEMES = [
  'a breathtaking modern city skyline at golden hour',
  'a person standing on a mountain cliff facing a vast glowing sunrise',
  'a stunning ocean horizon at dawn with dramatic light',
  'a serene forest with sun rays piercing through the trees',
  'a futuristic city at night with glowing lights and rain reflections',
  'a lone figure walking toward a bright horizon on an empty road',
  'majestic snowy mountains under the northern lights',
  'a calm lake mirroring a vivid colorful sunset sky',
];
const imgs: string[] = [];
for (let i = 0; i < THEMES.length; i++) {
  const p = path.join(dir, `bg_${i}.png`);
  try {
    const fs = await import('node:fs');
    if (fs.existsSync(p) && fs.statSync(p).size > 10000) { imgs.push(p); log.ok(`bg_${i} reusada`); continue; }
    await geminiImage(
      `${THEMES[i]}, ultra realistic cinematic photography, vertical 9:16, dramatic light, inspiring and awakening mood, ` +
        `highly detailed, no text, masterpiece`,
      p, { aspectRatio: '9:16' });
    imgs.push(p);
  } catch (e) {
    log.warn(`bg_${i} falló (${(e as Error).message.slice(0, 40)}) — sigo con las que tengo`);
  }
}
if (!imgs.length) throw new Error('sin imágenes');
const NIMG = imgs.length;

// 5) Montaje: cada golpe → imagen + fragmento (corte al beat)
log.step('5/5 Montaje sincronizado');
const clips: string[] = [];
for (let i = 0; i < use.length; i++) {
  const segDur = Math.max(0.25, (i + 1 < use.length ? use[i + 1] : use[i] + 0.7) - use[i]);
  const img = imgs[i % NIMG];
  const out = path.join(dir, `seg_${String(i).padStart(2, '0')}.mp4`);
  const txtFile = out + '.txt';
  await fsp.writeFile(txtFile, fragmentos[i] || '', 'utf8');
  const frames = Math.max(1, Math.round(segDur * 30));
  const vf =
    `scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304,` +
    `zoompan=z='min(zoom+0.0020,1.25)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,` +
    `drawtext=fontfile='${esc(config.fonts.latin)}':textfile='${esc(txtFile)}':fontcolor=white:fontsize=96:` +
    `borderw=7:bordercolor=black@0.85:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=14`;
  await ff(['-loop', '1', '-i', img, '-t', segDur.toFixed(2), '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
  await fsp.unlink(txtFile).catch(() => {});
  clips.push(out);
}

// concat + música alineada al primer golpe
const listFile = path.join(dir, 'list.txt');
await fsp.writeFile(listFile, clips.map((c) => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
const silent = path.join(dir, 'video.mp4');
await ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);
const vlen = await probeDuration(silent);
const final = path.join(dir, 'mystery_9x16.mp4');
await ff(['-i', silent, '-ss', use[0].toFixed(2), '-i', music, '-map', '0:v', '-map', '1:a', '-t', vlen.toFixed(2),
  '-c:v', 'copy', '-c:a', 'aac', '-af', 'afade=t=out:st=' + Math.max(0, vlen - 0.8).toFixed(2) + ':d=0.8', final]);

const url = await uploadPublic(final, `kids-studio/mystery/mystery_${mood}.mp4`, 'video/mp4');
console.log('\nFRASE:', fragmentos.join(' · '));
console.log('LINK:', url);

// Motor del canal de MATERNIDAD (faceless): MEZCLA fotos animadas con zoom + clips de video del
// banco (≤8s), texto sincronizado al bajo, 9:16 nativo. Reusa el banco de Veo para no gastar de más.
// Uso: tsx scripts/gen-mom-batch.ts [N] [lang]   (lang: es|en, default es)
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { detectBeats } from '../src/beat/detect';
import { getMoodTrack } from '../src/audio/soundbank';
import { geminiImage } from '../src/ai/gemini-image';
import { geminiJson } from '../src/ai/gemini';
import { ff, probeDuration } from '../src/lib/ffmpeg';
import { uploadPublic } from '../src/lib/storage';
import { ensureDir } from '../src/lib/files';
import { pickClips, loadBank } from '../src/bank/videobank';
import { config, OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';

const THEME = 'mom';
const N_TARGET = Number(process.argv[2] || 20);
const LANG = (process.argv[3] || 'es').toLowerCase();
const baseDir = path.join(OUTPUT_DIR, LANG === 'es' ? 'mom' : `mom-${LANG}`);
const storagePrefix = LANG === 'es' ? 'kids-studio/mom' : `kids-studio/mom-${LANG}`;
const poolDir = path.join(OUTPUT_DIR, 'mom', '_pool');
await ensureDir(poolDir);
const esc = (s: string) => s.replace(/\\/g, '/').replace(/:/g, '\\:');
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);

const TOPICS_BY_LANG: Record<string, string[]> = {
  es: [
    'El cansancio que nadie ve', 'La culpa de mamá', 'Perderte a ti misma al ser mamá', 'Las noches sin dormir',
    'El amor que lo cambia todo', 'La presión de ser la mamá perfecta', 'El tiempo para ti ya no existe',
    'La soledad de la maternidad', 'Tu cuerpo después del bebé', 'Compararte con otras mamás',
    'El primer día lejos de tu bebé', 'La fuerza que no sabías que tenías', 'Los pequeños momentos que lo valen todo',
    'Cuando todo es demasiado', 'La mujer que también eres', 'El miedo a equivocarte',
    'Criar sin manual', 'El sacrificio invisible', 'Pedir ayuda no es fracasar', 'Eres más fuerte de lo que crees',
  ],
  en: [
    'The exhaustion no one sees', 'A mother’s guilt', 'Losing yourself in motherhood', 'The sleepless nights',
    'The love that changes everything', 'The pressure to be the perfect mom', 'There is no time for you anymore',
    'The loneliness of motherhood', 'Your body after the baby', 'Comparing yourself to other moms',
    'The first day away from your baby', 'The strength you didn’t know you had', 'The little moments that make it worth it',
    'When it all becomes too much', 'The woman you still are', 'The fear of getting it wrong',
    'Raising them with no manual', 'The invisible sacrifice', 'Asking for help is not failing', 'You are stronger than you think',
  ],
};
const TOPICS = TOPICS_BY_LANG[LANG] || TOPICS_BY_LANG.es;

const SYS: Record<string, string> = {
  es:
    'Eres una voz cálida y poderosa que le habla al corazón de las MAMÁS (contenido faceless viral que para el scroll). ' +
    'Creas una frase CORTA en español que: (1) engancha con un momento real y crudo de la maternidad; ' +
    '(2) NOMBRA el reto o el sentimiento que casi nadie dice en voz alta (cansancio, culpa, soledad, perderte); ' +
    '(3) TERMINA con un giro de FUERZA, AMOR y VALIDACIÓN — que la mamá se sienta vista, acompañada y poderosa. ' +
    'El final reconforta y empodera (un nudo en la garganta del bueno). Fragmentos muy cortos (1-4 palabras), uno por golpe, ritmo creciente. ' +
    'Tono íntimo, real, emotivo (no cursi, NO genérico). Devuelve SOLO JSON.',
  en:
    'You are a warm, powerful voice speaking to the heart of MOMS (scroll-stopping faceless content). ' +
    'You craft a SHORT phrase in English that: (1) hooks with a raw, real motherhood moment; ' +
    '(2) NAMES the challenge or feeling almost no one says out loud (exhaustion, guilt, loneliness, losing yourself); ' +
    '(3) ENDS with a turn of STRENGTH, LOVE and VALIDATION — so the mom feels seen, accompanied and powerful. ' +
    'The ending comforts and empowers (a good lump in the throat). Very short fragments (1-4 words), one per beat, rising rhythm. ' +
    'Intimate, real, emotional tone (not cheesy, NOT generic). Return ONLY JSON.',
};
const sys = SYS[LANG] || SYS.es;

// Pool de fotos faceless de maternidad (reusable)
const PHOTO_THEMES = [
  'a mother holding her newborn baby seen from behind by a soft window light',
  'close-up of mother and baby hands together, tender, warm light',
  'a tired mother sitting on the floor of a sunlit nursery, faceless, candid',
  'a mother silhouette with a baby against a bright window at sunrise',
  'tiny baby shoes and a coffee mug on a kitchen table, morning light',
  'a mother pushing a stroller in a park at golden hour, seen from behind',
  'a pregnant belly cradled by hands near a window, soft warm tones',
  'a cozy nursery with soft toys and warm light, no people',
  'a mother reading a bedtime story to a child, over the shoulder, dim warm light',
  'a mother hands folding tiny baby clothes, candid home scene',
  'a child reaching up to a mother, low angle, backlit, faceless',
  'a quiet moment, a mother with a cup of tea by a rainy window, silhouette',
];

log.step(`Pool de fotos (faceless maternidad)`);
const photos: string[] = [];
for (let i = 0; i < PHOTO_THEMES.length; i++) {
  const p = path.join(poolDir, `photo_${String(i).padStart(2, '0')}.png`);
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > 10000) { photos.push(p); continue; }
    await geminiImage(`${PHOTO_THEMES[i]}, vertical 9:16, ultra realistic cinematic photography, emotional warm mood, highly detailed, no text`, p, { aspectRatio: '9:16' });
    photos.push(p);
    log.ok(`foto ${i}`);
  } catch (e) { log.warn(`foto ${i} falló (${(e as Error).message.slice(0, 40)})`); }
}
if (!photos.length) throw new Error('sin fotos');
const bankN = loadBank(THEME).length;
log.ok(`pool: ${photos.length} fotos | banco: ${bankN} clips de video`);

const SCHEMA = { type: 'object', properties: { fragmentos: { type: 'array', items: { type: 'string' } }, frase: { type: 'string' } }, required: ['fragmentos', 'frase'] };

async function renderOne(topic: string, idx: number, mood: string): Promise<string> {
  const slug = slugify(topic);
  const dir = path.join(baseDir, slug);
  await ensureDir(dir);
  const final = path.join(dir, 'video.mp4');
  if (fs.existsSync(final) && fs.statSync(final).size > 10000) { log.ok(`${topic} ya existe`); return final; }

  const music = await getMoodTrack(mood, path.join(dir, 'music.mp3'));
  const dur = await probeDuration(music);
  const all = await detectBeats(music, { minGap: 0.3 });
  const beats = all.filter((b) => b >= 0.2 && b < Math.min(dur, 28));
  const N = Math.min(beats.length, 22);
  const use = beats.slice(0, N);

  const userPrompt = LANG === 'en'
    ? `Theme: "${topic}". Create a motherhood message in EXACTLY ${N} short fragments (1-4 words), that hooks with a raw real moment, names the hidden struggle and ends with strength, love and validation. {fragmentos:[...], frase:"..."}`
    : `Tema: "${topic}". Crea un mensaje de maternidad en EXACTAMENTE ${N} fragmentos cortos (1-4 palabras), que enganche con un momento real y crudo, nombre el reto oculto y termine con fuerza, amor y validación. {fragmentos:[...], frase:"..."}`;
  const { fragmentos, frase } = await geminiJson<{ fragmentos: string[]; frase: string }>(userPrompt, SCHEMA, sys);
  await fsp.writeFile(path.join(dir, 'frase.json'), JSON.stringify({ topic, mood, frase, fragmentos }, null, 2), 'utf8');

  // Clips del banco para este video (ciclados con offset → variedad entre videos)
  const nClips = Math.max(1, Math.ceil(use.length / 2));
  const clips = pickClips(THEME, { n: nClips, offset: idx * 2 });
  const photoOffset = (idx * 3) % photos.length;

  const segs: string[] = [];
  let pi = 0, ci = 0;
  for (let i = 0; i < use.length; i++) {
    const segDur = Math.max(0.25, (i + 1 < use.length ? use[i + 1] : use[i] + 0.7) - use[i]);
    const out = path.join(dir, `seg_${String(i).padStart(2, '0')}.mp4`);
    const txtFile = out + '.txt';
    await fsp.writeFile(txtFile, fragmentos[i] || '', 'utf8');
    const draw = `drawtext=fontfile='${esc(config.fonts.latin)}':textfile='${esc(txtFile)}':fontcolor=white:fontsize=92:borderw=7:bordercolor=black@0.85:x=(w-text_w)/2:y=h-text_h-260:line_spacing=14`;
    const useClip = clips.length > 0 && i % 2 === 1; // mezcla: pares=foto (zoom), impares=clip de video

    if (useClip) {
      const clip = clips[ci % clips.length].file; ci++;
      const vf = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,${draw}`;
      await ff(['-i', clip, '-t', segDur.toFixed(2), '-an', '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
    } else {
      const img = photos[(photoOffset + pi) % photos.length]; pi++;
      const frames = Math.max(1, Math.round(segDur * 30));
      const vf =
        `scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304,` +
        `zoompan=z='min(zoom+0.0020,1.25)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,${draw}`;
      await ff(['-loop', '1', '-i', img, '-t', segDur.toFixed(2), '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
    }
    await fsp.unlink(txtFile).catch(() => {});
    segs.push(out);
  }

  const listFile = path.join(dir, 'list.txt');
  await fsp.writeFile(listFile, segs.map((c) => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const silent = path.join(dir, 'silent.mp4');
  await ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);
  const vlen = await probeDuration(silent);
  await ff(['-i', silent, '-ss', use[0].toFixed(2), '-i', music, '-map', '0:v', '-map', '1:a', '-t', vlen.toFixed(2),
    '-c:v', 'copy', '-c:a', 'aac', '-af', 'afade=t=out:st=' + Math.max(0, vlen - 0.8).toFixed(2) + ':d=0.8', final]);

  for (const c of segs) await fsp.unlink(c).catch(() => {});
  await fsp.unlink(silent).catch(() => {});
  await uploadPublic(final, `${storagePrefix}/${slug}.mp4`, 'video/mp4');
  return final;
}

const MOODS = ['emotivo', 'esperanzador', 'nostalgia', 'calmado', 'ensueno', 'arrullo'];
let made = 0;
const total = Math.min(N_TARGET, TOPICS.length);
for (let i = 0; i < total; i++) {
  const mood = MOODS[i % MOODS.length];
  try { await renderOne(TOPICS[i], i, mood); made++; log.ok(`(${made}/${total}) ${TOPICS[i]} [${mood}]`); }
  catch (e) { log.err(`${TOPICS[i]}: ${(e as Error).message.slice(0, 90)}`); }
}
console.log(`\n✅ Maternidad (${LANG}): ${made}/${total} videos (mezcla foto+video) generados y subidos a ${storagePrefix}/`);

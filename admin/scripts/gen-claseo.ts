// ClaseoShow — canal de EMPODERAMIENTO FEMENINO (faceless, 9:16, ES, voz de mujer).
// Estilo NARRATIVO (no staccato): la voz de amiga lee un mensaje (mezcla situación real + solución
// + empoderamiento), los captions siguen la voz, sobre imágenes emotivas faceless + música suave.
// Reusa: narrate (ElevenLabs), geminiImage (gpt-image), banco Veo opcional, render 9:16 probado.
// Uso: tsx scripts/gen-claseo.ts [N=1]
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { getMoodTrack } from '../src/audio/soundbank';
import { geminiImage } from '../src/ai/gemini-image';
import { geminiJson } from '../src/ai/gemini';
import { ff, probeDuration } from '../src/lib/ffmpeg';
import { narrate } from '../src/faceless/voice';
import { ensureDir } from '../src/lib/files';
import { config, OUTPUT_DIR, ROOT } from '../src/config';
import { log } from '../src/lib/log';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const exec = promisify(execFile);

const N = Number(process.argv[2] || 1);
const LANG = 'es';
const VOICE_ID = process.env.CLASEO_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL'; // Sarah — voz femenina cálida
const MOOD = process.env.CLASEO_MOOD ?? 'esperanzador';
const baseDir = path.join(OUTPUT_DIR, 'claseo');
const poolDir = path.join(baseDir, '_pool');
await ensureDir(poolDir);
const esc = (s: string) => s.replace(/\\/g, '/').replace(/:/g, '\\:');
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);

// Imágenes emotivas FACELESS (siluetas / espaldas / detalle) — reutilizables, esquivan filtro de rostros.
const THEMES = [
  'silhouette of a woman looking out a rainy window, soft melancholic light, cinematic, vertical 9:16',
  "close-up of a woman's hands gently cradling her pregnant belly by a bright window, warm soft light, faceless",
  'a mother holding her baby close, warm backlit silhouette, tender light, faceless, intimate',
  'a woman walking forward on an empty road toward a glowing sunrise, seen from behind, hopeful, cinematic',
  'close-up of a hand softly wiping away a tear, gentle light, emotional, cinematic',
  'a small green plant growing next to a lit candle on a windowsill, soft morning light, hope, cinematic',
  "a woman's hands writing in a journal at a cozy table, warm lamp light, intimate, faceless",
  'an open door letting warm golden light flood a dark room, new beginning, cinematic, vertical',
  'a woman standing strong on a hilltop at sunrise, seen from behind, arms relaxed, empowering, cinematic',
  'soft golden morning light through sheer curtains in a peaceful bedroom, calm healing mood, cinematic',
];

// 1) POOL de imágenes (una vez, reusable). Resiliente a cuota.
log.step(`Pool de imágenes emotivas (objetivo ${THEMES.length})`);
for (let i = 0; i < THEMES.length; i++) {
  const p = path.join(poolDir, `img_${String(i).padStart(2, '0')}.png`);
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > 10000) continue;
    await geminiImage(`${THEMES[i]}, ultra realistic cinematic photography, vertical 9:16, soft warm emotional light, hopeful, highly detailed, no text, no watermark`, p, { aspectRatio: '9:16' });
    log.ok(`pool img_${i}`);
  } catch (e) { log.warn(`img_${i}: ${(e as Error).message.slice(0, 40)}`); }
}
const pool = fs.readdirSync(poolDir).filter((f) => /\.png$/.test(f)).map((f) => path.join(poolDir, f)).filter((p) => fs.statSync(p).size > 10000);
if (pool.length < 3) throw new Error(`pool insuficiente (${pool.length})`);
log.ok(`pool: ${pool.length} imágenes`);

// Banco de temas: 5 temas generales × subtemas (data/claseo/themes.json). Rota sin repetir.
const themes = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'claseo', 'themes.json'), 'utf8')).themes) as { title: string; subtopics: string[] }[];
const ALL_ITEMS = themes.flatMap((t) => t.subtopics.map((s) => ({ theme: t.title, sub: s })));

const SCHEMA = { type: 'object', properties: { titulo: { type: 'string' }, chunks: { type: 'array', items: { type: 'string' } }, hashtags: { type: 'array', items: { type: 'string' } } }, required: ['titulo', 'chunks', 'hashtags'] };
const SYS =
  "Eres la directora de contenido de 'ClaseoShow', canal en ESPAÑOL de videos verticales para MUJERES en situaciones duras. " +
  "TONO: cercano, de amiga que te habla de tú (2da persona), cálido pero firme, español neutro latino, real y humano. " +
  "NUNCA lástima, NUNCA miedo, NUNCA promesas falsas, NUNCA culpas a la mujer. Estructura MIX: gancho que nombra el dolor → validación (te entiendo, no estás sola, no fue tu culpa) → UNA verdad que libera + UN paso concreto → cierre de empoderamiento breve ('sí se puede / vas a renacer'). " +
  "Es APOYO, no reemplaza ayuda profesional. Devuelve SOLO JSON.";

async function renderOne(item: { theme: string; sub: string }, idx: number): Promise<void> {
  const userPrompt =
    `Tema: ${item.theme}. Enfoque del video: "${item.sub}". Háblale a la mujer que vive esto. ` +
    `Escribe el guion como "chunks": 8-12 líneas CORTAS (máx 6 palabras c/u) que, leídas seguidas, forman el mensaje hablado completo (90-120 palabras) en tono de amiga, estructura mix (gancho→validación→solución→empoderamiento). ` +
    `Cada línea es además un subtítulo en pantalla. Da también "titulo" (<=70 chars, gancho emocional) y "hashtags" (4-6, minúscula).`;
  const { titulo, chunks, hashtags } = await geminiJson<{ titulo: string; chunks: string[]; hashtags: string[] }>(userPrompt, SCHEMA, SYS);
  const slug = slugify(titulo) || `claseo-${idx}`;
  const dir = path.join(baseDir, slug); await ensureDir(dir);
  const final = path.join(dir, 'video.mp4');
  await fsp.writeFile(path.join(dir, 'guion.json'), JSON.stringify({ titulo, theme: item.theme, sub: item.sub, chunks, hashtags }, null, 2), 'utf8');
  log.step(`"${titulo}" — ${chunks.length} líneas`);

  // Voz de mujer (Sarah). narra los chunks y devuelve el tiempo de cada uno.
  const nr = await narrate(chunks, dir, LANG, VOICE_ID);
  const seek = nr.times[0] ?? 0;
  const times = nr.times.map((t) => Math.max(0, t - seek));
  const voiceDur = Math.max(1, nr.voiceDur - seek);

  // Música suave de fondo.
  let music: string | null = null;
  try { music = await getMoodTrack(MOOD, path.join(dir, 'music.mp3'), idx); } catch (e) { log.warn(`música: ${(e as Error).message.slice(0, 50)}`); }

  // Segmentos: cada chunk = una imagen con Ken Burns lento + el subtítulo, hasta el siguiente chunk.
  const off = (idx * 2) % pool.length;
  const clips: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const segDur = Math.max(0.6, (i + 1 < times.length ? times[i + 1] : voiceDur) - times[i]);
    const img = pool[(off + i) % pool.length];
    const out = path.join(dir, `seg_${String(i).padStart(2, '0')}.mp4`);
    const txt = out + '.txt'; await fsp.writeFile(txt, chunks[i] || '', 'utf8');
    const frames = Math.max(1, Math.round(segDur * 30));
    const z = i % 2 === 0 ? `min(1.0+0.004*on,1.14)` : `max(1.15-0.004*on,1.02)`;
    const draw = `drawtext=fontfile='${esc(config.fonts.latin)}':textfile='${esc(txt)}':fontcolor=white:fontsize=70:borderw=7:bordercolor=black@0.9:shadowcolor=black@0.5:shadowx=0:shadowy=3:x=(w-text_w)/2:y=h*0.72:line_spacing=10:alpha='if(lt(t,0.2),t/0.2,1)'`;
    const vf = `scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304,zoompan=z='${z}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,${draw}`;
    await ff(['-loop', '1', '-i', img, '-t', segDur.toFixed(2), '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
    await fsp.unlink(txt).catch(() => {});
    clips.push(out);
  }
  const listFile = path.join(dir, 'list.txt');
  await fsp.writeFile(listFile, clips.map((c) => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const silent = path.join(dir, 'silent.mp4');
  await ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);
  const vlen = await probeDuration(silent);
  const fadeSt = Math.max(0, vlen - 0.8).toFixed(2);
  if (music) {
    await ff(['-i', silent, '-ss', seek.toFixed(2), '-i', nr.voicePath, '-i', music, '-map', '0:v',
      '-filter_complex', `[2:a]volume=0.14,apad[bg];[1:a][bg]amix=inputs=2:duration=first:dropout_transition=2[mx];[mx]afade=t=out:st=${fadeSt}:d=0.8[ao]`,
      '-map', '[ao]', '-t', vlen.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', final]);
  } else {
    await ff(['-i', silent, '-ss', seek.toFixed(2), '-i', nr.voicePath, '-map', '0:v', '-map', '1:a', '-t', vlen.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', final]);
  }
  for (const c of clips) await fsp.unlink(c).catch(() => {});
  await fsp.unlink(silent).catch(() => {}); await fsp.unlink(listFile).catch(() => {});
  log.ok(`✅ ${final}`);

  // Metadata SEO 2026 (ChatGPT, perfil ClaseoShow): título | gancho | marca, descripción rica, tags ~500c, hashtags minúscula.
  try {
    await fsp.writeFile(path.join(dir, 'title.txt'), titulo, 'utf8');
    await fsp.writeFile(path.join(dir, 'topic.txt'), `${titulo}. ${chunks.join(' ')}`, 'utf8');
    const { stdout } = await exec('python', ['py/seo_meta.py', 'claseo', dir, '--topic'], { cwd: ROOT, maxBuffer: 1 << 24 });
    log.ok('metadata SEO: ' + stdout.trim().split('\n').slice(-1)[0].slice(0, 80));
  } catch (e) { log.warn(`metadata SEO: ${(e as Error).message.slice(0, 70)}`); }
}

// Rota por el banco sin repetir (_used.json). Si se acaban, recicla.
const usedFile = path.join(baseDir, '_used.json');
let used: string[] = [];
try { used = JSON.parse(fs.readFileSync(usedFile, 'utf8')); } catch { used = []; }
let queue = ALL_ITEMS.filter((it) => !used.includes(it.sub));
if (queue.length < N) queue = queue.concat(ALL_ITEMS);
queue = queue.slice(0, N);
let made = 0;
for (let i = 0; i < queue.length; i++) {
  try {
    await renderOne(queue[i], i); made++;
    if (!used.includes(queue[i].sub)) used.push(queue[i].sub);
    await fsp.writeFile(usedFile, JSON.stringify(used, null, 2), 'utf8');
  } catch (e) { log.err(`video ${i}: ${(e as Error).message.slice(0, 110)}`); }
}
console.log(`\n✅ ClaseoShow: ${made}/${queue.length} videos generados · ${used.length}/${ALL_ITEMS.length} subtemas usados`);

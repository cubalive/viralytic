// Fe en la Vida Real — canal CRISTIANO (faceless, 9:16, ES, voz de HOMBRE profundo con autoridad).
// La Biblia aplicada a la vida real: cada mensaje responde una pregunta humana con profundidad,
// puente bíblico y aplicación práctica. Voz propia, NUNCA copia de pastores/predicadores.
// Estructura: gancho → problema humano → puente bíblico → aplicación → cierre poderoso → CTA.
// Uso: tsx scripts/gen-fe.ts [N=1]
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
const VOICE_ID = process.env.FE_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB'; // Adam — hombre profundo, autoridad
const MOOD = process.env.FE_MOOD ?? 'esperanzador';
const baseDir = path.join(OUTPUT_DIR, 'fe');
const poolDir = path.join(baseDir, '_pool');
await ensureDir(poolDir);
const esc = (s: string) => s.replace(/\\/g, '/').replace(/:/g, '\\:');
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);
// Envuelve el subtítulo en máx 2 líneas balanceadas para que NUNCA se salga de la pantalla.
const wrap2 = (s: string) => {
  const w = (s || '').trim().split(/\s+/).filter(Boolean);
  if (w.length <= 3) return w.join(' ');
  const mid = Math.ceil(w.length / 2);
  return w.slice(0, mid).join(' ') + '\n' + w.slice(mid).join(' ');
};

// Visuales CINEMATOGRÁFICOS espirituales (negro/dorado/azul oscuro/luz cálida). Premium, NO cruces con rayos.
const THEMES = [
  'an open Bible on a wooden table with warm golden light falling on the pages, dark background, cinematic, shallow depth of field, vertical 9:16',
  'a lone person walking on an empty road toward a glowing sunrise, seen from behind, silhouette, hopeful, cinematic, vertical',
  'rain sliding down a dark window at night with soft city lights blurred behind, melancholic, cinematic, vertical',
  'two hands gently clasped in prayer in soft warm light against a dark background, intimate, cinematic, vertical',
  'majestic mountains at golden sunrise with soft mist in the valley, vast, hopeful, cinematic, vertical',
  'a single lit candle glowing in a dark quiet room, warm flame, peaceful, cinematic, vertical',
  'a quiet empty church interior with a beam of golden light through a window, reverent, cinematic, vertical',
  'a desert path at dawn with long shadows and warm light, journey, perseverance, cinematic, vertical',
  'calm sea at sunrise with gentle waves and warm golden horizon, peace, hope, cinematic, vertical',
  'a wooden desk with an open Bible, a cup of coffee and warm morning light, intimate study, cinematic, vertical',
  'silhouette of a person standing strong on a hilltop at sunrise, arms relaxed, purpose, cinematic, vertical',
  'soft golden light breaking through dark storm clouds, hope after the storm, cinematic, vertical',
];

// 1) POOL de imágenes (una vez, reusable). Resiliente a cuota.
log.step(`Pool de imágenes cinematográficas (objetivo ${THEMES.length})`);
for (let i = 0; i < THEMES.length; i++) {
  const p = path.join(poolDir, `img_${String(i).padStart(2, '0')}.png`);
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > 10000) continue;
    await geminiImage(`${THEMES[i]}, ultra realistic cinematic photography, vertical 9:16, dark elegant tones with warm golden light, deep blue shadows, spiritual, premium, highly detailed, no text, no watermark, no crosses with exaggerated rays`, p, { aspectRatio: '9:16' });
    log.ok(`pool img_${i}`);
  } catch (e) { log.warn(`img_${i}: ${(e as Error).message.slice(0, 40)}`); }
}
const pool = fs.readdirSync(poolDir).filter((f) => /\.png$/.test(f)).map((f) => path.join(poolDir, f)).filter((p) => fs.statSync(p).size > 10000);
if (pool.length < 3) throw new Error(`pool insuficiente (${pool.length})`);
log.ok(`pool: ${pool.length} imágenes`);

// Banco de temas: 5 pilares × subtemas (data/fe/themes.json). Rota sin repetir.
const themes = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fe', 'themes.json'), 'utf8')).themes) as { title: string; subtopics: string[] }[];
const ALL_ITEMS = themes.flatMap((t) => t.subtopics.map((s) => ({ theme: t.title, sub: s })));

const SCHEMA = { type: 'object', properties: { titulo: { type: 'string' }, chunks: { type: 'array', items: { type: 'string' } }, hashtags: { type: 'array', items: { type: 'string' } }, versiculo: { type: 'string' } }, required: ['titulo', 'chunks', 'hashtags'] };
const SYS =
  "Eres guionista cristiano de 'Fe en la Vida Real', canal en ESPAÑOL que explica la Biblia para la vida real de forma moderna, inteligente, emocional y práctica. " +
  "VOZ PROPIA: inspirada en la Escritura, narración emocional, sabiduría práctica y ritmo motivacional moderno; NUNCA imites el estilo exacto de ningún pastor, predicador o figura pública. " +
  "ADN: bíblico (parte de una verdad espiritual) + humano (dolor, lucha, cansancio, miedo) + inteligente (razona, no grita frases vacías) + motivador (levanta y empuja a actuar) + actual (trabajo, familia, ansiedad, disciplina, decisiones). " +
  "EVITA: frases religiosas genéricas, manipulación, evangelio de la prosperidad, gritos, condenación, 'comenta amén para ser bendecido', peleas doctrinales, promesas exageradas y clichés vacíos. " +
  "Estructura: 1) gancho fuerte en los primeros 3 segundos, 2) problema humano real, 3) puente bíblico (historia, personaje o principio), 4) aplicación práctica a la vida de hoy, 5) cierre poderoso y memorable, 6) llamado breve a reflexionar/orar/compartir. " +
  "Español neutro latino, frases cortas y fuertes, ritmo cinematográfico. Devuelve SOLO JSON.";

async function renderOne(item: { theme: string; sub: string }, idx: number): Promise<void> {
  const userPrompt =
    `Pilar: ${item.theme}. Tema del video: "${item.sub}". ` +
    `Escribe el guion como "chunks": 9-14 líneas CORTAS (máx 7 palabras c/u) que, leídas seguidas, forman el mensaje hablado completo (110-150 palabras) con la estructura del canal (gancho→problema→puente bíblico→aplicación→cierre→CTA breve). ` +
    `Cada línea es además un subtítulo en pantalla. Da también "titulo" (<=70 chars, frase fuerte y clara), "versiculo" (opcional, referencia bíblica si encaja) y "hashtags" (4-6, minúscula, tipo #fe #biblia #proposito).`;
  const { titulo, chunks, hashtags } = await geminiJson<{ titulo: string; chunks: string[]; hashtags: string[]; versiculo?: string }>(userPrompt, SCHEMA, SYS);
  const slug = slugify(titulo) || `fe-${idx}`;
  const dir = path.join(baseDir, slug); await ensureDir(dir);
  const final = path.join(dir, 'video.mp4');
  await fsp.writeFile(path.join(dir, 'guion.json'), JSON.stringify({ titulo, theme: item.theme, sub: item.sub, chunks, hashtags }, null, 2), 'utf8');
  log.step(`"${titulo}" — ${chunks.length} líneas`);

  // Voz de HOMBRE profundo (Adam). Narra los chunks y devuelve el tiempo de cada uno.
  const nr = await narrate(chunks, dir, LANG, VOICE_ID);
  const seek = nr.times[0] ?? 0;
  const times = nr.times.map((t) => Math.max(0, t - seek));
  const voiceDur = Math.max(1, nr.voiceDur - seek);

  // Música cinematográfica suave de fondo (esperanzadora, no triste).
  let music: string | null = null;
  try { music = await getMoodTrack(MOOD, path.join(dir, 'music.mp3'), idx); } catch (e) { log.warn(`música: ${(e as Error).message.slice(0, 50)}`); }

  // Segmentos: cada chunk = una imagen con Ken Burns lento + el subtítulo (blanco), hasta el siguiente chunk.
  const off = (idx * 2) % pool.length;
  const clips: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const segDur = Math.max(0.6, (i + 1 < times.length ? times[i + 1] : voiceDur) - times[i]);
    const img = pool[(off + i) % pool.length];
    const out = path.join(dir, `seg_${String(i).padStart(2, '0')}.mp4`);
    const txt = out + '.txt'; await fsp.writeFile(txt, wrap2(chunks[i] || ''), 'utf8');
    const frames = Math.max(1, Math.round(segDur * 30));
    const z = i % 2 === 0 ? `min(1.0+0.004*on,1.14)` : `max(1.15-0.004*on,1.02)`;
    const draw = `drawtext=fontfile='${esc(config.fonts.latin)}':textfile='${esc(txt)}':fontcolor=white:fontsize=58:borderw=6:bordercolor=black@0.9:shadowcolor=black@0.5:shadowx=0:shadowy=3:x=(w-text_w)/2:y=h*0.70:line_spacing=12:alpha='if(lt(t,0.2),t/0.2,1)'`;
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
      '-filter_complex', `[2:a]volume=0.12,apad[bg];[1:a][bg]amix=inputs=2:duration=first:dropout_transition=2[mx];[mx]afade=t=out:st=${fadeSt}:d=0.8[ao]`,
      '-map', '[ao]', '-t', vlen.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', final]);
  } else {
    await ff(['-i', silent, '-ss', seek.toFixed(2), '-i', nr.voicePath, '-map', '0:v', '-map', '1:a', '-t', vlen.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', final]);
  }
  for (const c of clips) await fsp.unlink(c).catch(() => {});
  await fsp.unlink(silent).catch(() => {}); await fsp.unlink(listFile).catch(() => {});
  log.ok(`✅ ${final}`);

  // Metadata SEO 2026 (ChatGPT, perfil 'fe'): título | gancho | marca, descripción rica, tags ~500c.
  try {
    await fsp.writeFile(path.join(dir, 'title.txt'), titulo, 'utf8');
    await fsp.writeFile(path.join(dir, 'topic.txt'), `${titulo}. ${chunks.join(' ')}`, 'utf8');
    const { stdout } = await exec('python', ['py/seo_meta.py', 'fe', dir, '--topic'], { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 1 << 24 });
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
console.log(`\n✅ Fe en la Vida Real: ${made}/${queue.length} videos generados · ${used.length}/${ALL_ITEMS.length} subtemas usados`);

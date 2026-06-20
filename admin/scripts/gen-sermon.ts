// Fe Vida Real — SERMONES 16:9 (voz natural Yovanny, tipo pastor en radio).
// Parte de una CITA BÍBLICA y desarrolla un tema (envidia, perdón, ansiedad…) como un predicador:
// cita → contexto → desarrollo → aplicación a la vida real → cierre/oración. Fotos con zoom (Ken Burns),
// captions, música de fondo suave (toque radial). De cada sermón SACA reels 9:16 de los mejores momentos.
// Uso: tsx scripts/gen-sermon.ts [N=1]
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
const cfgS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fe', 'sermones.json'), 'utf8'));
const VOICE_ID = process.env.FE_SERMON_VOICE ?? cfgS.voiceId ?? 'uc1bP8ode9kpUoLa3zdR'; // Yovanny
const MOOD = process.env.SERMON_MOOD ?? 'esperanzador';
const baseDir = path.join(OUTPUT_DIR, 'fe');           // mismo canal Fe
const poolDir = path.join(baseDir, '_pool16');
await ensureDir(poolDir);
const esc = (s: string) => s.replace(/\\/g, '/').replace(/:/g, '\\:');
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44);
const wrap2 = (s: string) => { const w = (s || '').trim().split(/\s+/).filter(Boolean); if (w.length <= 4) return w.join(' '); const m = Math.ceil(w.length / 2); return w.slice(0, m).join(' ') + '\n' + w.slice(m).join(' '); };

// Pool 16:9 cinematográfico espiritual (negro/dorado/azul, luz cálida).
const THEMES = [
  'an open Bible on a wooden table with warm golden light, dark background, cinematic, 16:9',
  'a lone figure walking toward a glowing sunrise over a vast landscape, silhouette, hopeful, cinematic, 16:9',
  'rain on a dark window at night with soft warm light behind, melancholic, cinematic, 16:9',
  'two hands clasped in prayer in warm light against dark background, intimate, cinematic, 16:9',
  'majestic mountains at golden sunrise with mist, vast and reverent, cinematic, 16:9',
  'a single candle glowing in a quiet dark room, peaceful, cinematic, 16:9',
  'empty old church interior with a beam of golden light through a window, reverent, cinematic, 16:9',
  'a desert road at dawn with long shadows, journey and perseverance, cinematic, 16:9',
  'calm sea at sunrise with warm golden horizon, peace and hope, cinematic, 16:9',
  'storm clouds breaking with golden light pouring through, hope after the storm, cinematic, 16:9',
  'a narrow path through a forest with warm light at the end, cinematic, 16:9',
  'starry night sky over silent hills, vast and contemplative, cinematic, 16:9',
];
log.step(`Pool 16:9 (objetivo ${THEMES.length})`);
for (let i = 0; i < THEMES.length; i++) {
  const p = path.join(poolDir, `img_${String(i).padStart(2, '0')}.png`);
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > 10000) continue;
    await geminiImage(`${THEMES[i]}, ultra realistic cinematic photography, 16:9 horizontal, dark elegant tones with warm golden light, deep blue shadows, spiritual, premium, no text, no watermark, no crosses with exaggerated rays`, p, { aspectRatio: '16:9' });
    log.ok(`pool ${i}`);
  } catch (e) { log.warn(`img ${i}: ${(e as Error).message.slice(0, 40)}`); }
}
const pool = fs.readdirSync(poolDir).filter(f => /\.png$/.test(f)).map(f => path.join(poolDir, f)).filter(p => fs.statSync(p).size > 10000);
if (pool.length < 3) throw new Error(`pool insuficiente (${pool.length})`);
log.ok(`pool 16:9: ${pool.length}`);

const temas: string[] = cfgS.temas;
const SCHEMA = { type: 'object', properties: {
  titulo: { type: 'string' }, cita_ref: { type: 'string' }, cita_texto: { type: 'string' },
  chunks: { type: 'array', items: { type: 'string' } },
  reels: { type: 'array', items: { type: 'object', properties: { titulo: { type: 'string' }, ini: { type: 'number' }, fin: { type: 'number' } }, required: ['titulo', 'ini', 'fin'] } },
  hashtags: { type: 'array', items: { type: 'string' } },
}, required: ['titulo', 'cita_ref', 'cita_texto', 'chunks', 'reels', 'hashtags'] };

const SYS =
  "Eres un PREDICADOR cristiano que graba un sermón en español para 'Fe Vida Real' (estilo pastor en radio: cercano, profundo, con autoridad pero humano). " +
  "Hablas en 2da persona, con calidez y firmeza, español neutro latino, ritmo de predicación (frases que respiran). " +
  "ESTRUCTURA del sermón: 1) abres leyendo/citando un VERSÍCULO real de la Biblia (cita_ref + cita_texto), 2) explicas el contexto y qué significa, 3) desarrollas el TEMA con ejemplos de la vida real de hoy (trabajo, familia, redes, heridas), 4) aplicación práctica (qué hacer esta semana), 5) cierre que confronta y levanta + una breve oración. " +
  "Habla de la Biblia y de cómo ser mejores personas. NO inventes versículos (usa reales y bien citados). NO evangelio de prosperidad, NO manipular, NO 'comenta amén', NO gritar. Voz propia, no imites a ningún pastor real. Devuelve SOLO JSON.";

async function renderOne(tema: string, idx: number): Promise<void> {
  const userPrompt =
    `Tema del sermón: "${tema}". Escribe un sermón COMPLETO de 5 a 7 minutos hablados (650-950 palabras). ` +
    `Devuelve "chunks": 45-75 líneas CORTAS (máx 9 palabras c/u) que, leídas seguidas, forman el sermón hablado completo con la estructura indicada (empieza por la cita bíblica). Cada línea es además un subtítulo. ` +
    `"cita_ref" (ej. "Proverbios 14:30") y "cita_texto" (el versículo). "titulo" (<=70 chars, fuerte y claro). ` +
    `"reels": 3 momentos potentes para Shorts, cada uno {titulo: frase-gancho corta para pantalla, ini: índice de línea inicial, fin: índice de línea final} (rangos de 6-12 líneas, los más impactantes). ` +
    `"hashtags": 4-6 en minúscula (#fe #biblia #${slugify(tema).split('-')[1] || 'proposito'}).`;
  const r = await geminiJson<{ titulo: string; cita_ref: string; cita_texto: string; chunks: string[]; reels: { titulo: string; ini: number; fin: number }[]; hashtags: string[] }>(userPrompt, SCHEMA, SYS);
  const { titulo, chunks, reels, hashtags } = r;
  const slug = slugify(titulo) || `sermon-${idx}`;
  const dir = path.join(baseDir, slug); await ensureDir(dir);
  await fsp.writeFile(path.join(dir, 'guion.json'), JSON.stringify({ ...r, tema, kind: 'sermon' }, null, 2), 'utf8');
  log.step(`SERMÓN "${titulo}" — ${chunks.length} líneas · ${reels.length} reels`);

  // Voz Yovanny (barítono). Narra los chunks.
  const nr = await narrate(chunks, dir, LANG, VOICE_ID);
  const seek = nr.times[0] ?? 0;
  const times = nr.times.map(t => Math.max(0, t - seek));
  const voiceDur = Math.max(1, nr.voiceDur - seek);
  let music: string | null = null;
  try { music = await getMoodTrack(MOOD, path.join(dir, 'music.mp3'), idx); } catch (e) { log.warn(`música: ${(e as Error).message.slice(0, 40)}`); }

  // === SERMÓN 16:9 ===
  const off = (idx * 3) % pool.length;
  const clips: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const segDur = Math.max(0.6, (i + 1 < times.length ? times[i + 1] : voiceDur) - times[i]);
    const img = pool[(off + Math.floor(i / 2)) % pool.length]; // cambia de foto cada 2 líneas
    const out = path.join(dir, `s_${String(i).padStart(3, '0')}.mp4`);
    const txt = out + '.txt'; await fsp.writeFile(txt, wrap2(chunks[i] || ''), 'utf8');
    const frames = Math.max(1, Math.round(segDur * 30));
    const z = i % 2 === 0 ? `min(1.0+0.0025*on,1.10)` : `max(1.10-0.0025*on,1.0)`;
    const draw = `drawtext=fontfile='${esc(config.fonts.latin)}':textfile='${esc(txt)}':fontcolor=white:fontsize=52:borderw=6:bordercolor=black@0.9:shadowcolor=black@0.5:shadowx=0:shadowy=3:x=(w-text_w)/2:y=h*0.80:line_spacing=8:alpha='if(lt(t,0.25),t/0.25,1)'`;
    const vf = `scale=2304:1296:force_original_aspect_ratio=increase,crop=2304:1296,zoompan=z='${z}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,${draw}`;
    await ff(['-loop', '1', '-i', img, '-t', segDur.toFixed(2), '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
    await fsp.unlink(txt).catch(() => {});
    clips.push(out);
  }
  const listFile = path.join(dir, 'list.txt');
  await fsp.writeFile(listFile, clips.map(c => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const silent = path.join(dir, 'silent.mp4');
  await ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);
  const vlen = await probeDuration(silent);
  const fadeSt = Math.max(0, vlen - 1.0).toFixed(2);
  const final = path.join(dir, 'video.mp4');
  if (music) {
    await ff(['-i', silent, '-ss', seek.toFixed(2), '-i', nr.voicePath, '-i', music, '-map', '0:v',
      '-filter_complex', `[2:a]volume=0.10,apad[bg];[1:a][bg]amix=inputs=2:duration=first:dropout_transition=2[mx];[mx]afade=t=out:st=${fadeSt}:d=1.0[ao]`,
      '-map', '[ao]', '-t', vlen.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', final]);
  } else {
    await ff(['-i', silent, '-ss', seek.toFixed(2), '-i', nr.voicePath, '-map', '0:v', '-map', '1:a', '-t', vlen.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', final]);
  }
  for (const c of clips) await fsp.unlink(c).catch(() => {});
  await fsp.unlink(silent).catch(() => {}); await fsp.unlink(listFile).catch(() => {});
  log.ok(`✅ sermón 16:9: ${final}`);

  // === REELS 9:16 (mejores momentos) ===
  const reelsDir = path.join(dir, 'reels'); await ensureDir(reelsDir);
  for (let ri = 0; ri < reels.length; ri++) {
    const rl = reels[ri];
    const ini = Math.max(0, Math.min(rl.ini | 0, chunks.length - 1));
    const fin = Math.max(ini, Math.min(rl.fin | 0, chunks.length - 1));
    const aStart = seek + times[ini];
    const aEnd = seek + (fin + 1 < times.length ? times[fin + 1] : voiceDur);
    const rdur = Math.max(3, aEnd - aStart);
    // intro negro 1.5s con el gancho
    const introTxt = path.join(reelsDir, `r${ri}_intro.txt`); await fsp.writeFile(introTxt, wrap2(rl.titulo || titulo), 'utf8');
    const introClip = path.join(reelsDir, `r${ri}_intro.mp4`);
    const drawI = `drawtext=fontfile='${esc(config.fonts.latin)}':textfile='${esc(introTxt)}':fontcolor=white:fontsize=72:borderw=2:bordercolor=white:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=14`;
    await ff(['-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:r=30', '-t', '1.6', '-vf', `lutyuv=y=0,${drawI}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', introClip]);
    // cuerpo: foto 9:16 con zoom + captions de las líneas del rango
    const segs: string[] = [introClip];
    for (let i = ini; i <= fin; i++) {
      const segDur = Math.max(0.6, (i + 1 < times.length ? times[i + 1] : voiceDur) - times[i]);
      const img = pool[(off + i) % pool.length];
      const out = path.join(reelsDir, `r${ri}_${String(i).padStart(3, '0')}.mp4`);
      const txt = out + '.txt'; await fsp.writeFile(txt, wrap2(chunks[i] || ''), 'utf8');
      const frames = Math.max(1, Math.round(segDur * 30));
      const z = i % 2 === 0 ? `min(1.0+0.004*on,1.14)` : `max(1.15-0.004*on,1.02)`;
      const draw = `drawtext=fontfile='${esc(config.fonts.latin)}':textfile='${esc(txt)}':fontcolor=white:fontsize=58:borderw=6:bordercolor=black@0.9:shadowcolor=black@0.5:shadowx=0:shadowy=3:x=(w-text_w)/2:y=h*0.70:line_spacing=12`;
      const vf = `scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304,zoompan=z='${z}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,${draw}`;
      await ff(['-loop', '1', '-i', img, '-t', segDur.toFixed(2), '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
      await fsp.unlink(txt).catch(() => {});
      segs.push(out);
    }
    const rlist = path.join(reelsDir, `r${ri}_list.txt`);
    await fsp.writeFile(rlist, segs.map(c => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    const rsilent = path.join(reelsDir, `r${ri}_silent.mp4`);
    await ff(['-f', 'concat', '-safe', '0', '-i', rlist, '-c', 'copy', rsilent]);
    const rvlen = await probeDuration(rsilent);
    const reelOut = path.join(dir, `reel_${ri + 1}.mp4`);
    // audio: 1.6s de silencio (intro) + slice de la voz; + música suave
    const af = `[1:a]atrim=${aStart.toFixed(2)}:${aEnd.toFixed(2)},asetpts=PTS-STARTPTS,adelay=1600|1600[v];` +
      (music ? `[2:a]volume=0.10,atrim=0:${rvlen.toFixed(2)},apad[bg];[v][bg]amix=inputs=2:duration=first[ao]` : `[v]anull[ao]`);
    const inputs = music ? ['-i', rsilent, '-i', nr.voicePath, '-i', music] : ['-i', rsilent, '-i', nr.voicePath];
    await ff([...inputs, '-filter_complex', af, '-map', '0:v', '-map', '[ao]', '-t', rvlen.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', reelOut]);
    for (const s of segs) await fsp.unlink(s).catch(() => {});
    await fsp.unlink(rsilent).catch(() => {}); await fsp.unlink(rlist).catch(() => {}); await fsp.unlink(introTxt).catch(() => {});
    log.ok(`  🎬 reel ${ri + 1}: ${reelOut}`);
  }
  await fsp.rm(reelsDir, { recursive: true, force: true }).catch(() => {});

  // Metadata SEO (perfil fe)
  try {
    await fsp.writeFile(path.join(dir, 'title.txt'), titulo, 'utf8');
    await fsp.writeFile(path.join(dir, 'topic.txt'), `${titulo}. ${r.cita_ref}: ${r.cita_texto}. ${chunks.join(' ')}`, 'utf8');
    const { stdout } = await exec('python', ['py/seo_meta.py', 'fe', dir, '--topic'], { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 1 << 24 });
    log.ok('SEO: ' + stdout.trim().split('\n').slice(-1)[0].slice(0, 70));
  } catch (e) { log.warn(`SEO: ${(e as Error).message.slice(0, 60)}`); }
}

const usedFile = path.join(baseDir, '_sermon_used.json');
let used: string[] = [];
try { used = JSON.parse(fs.readFileSync(usedFile, 'utf8')); } catch { used = []; }
let queue = temas.filter(t => !used.includes(t));
if (queue.length < N) queue = queue.concat(temas);
queue = queue.slice(0, N);
let made = 0;
for (let i = 0; i < queue.length; i++) {
  try { await renderOne(queue[i], i); made++; if (!used.includes(queue[i])) used.push(queue[i]); await fsp.writeFile(usedFile, JSON.stringify(used, null, 2), 'utf8'); }
  catch (e) { log.err(`sermón ${i}: ${(e as Error).message.slice(0, 120)}`); }
}
console.log(`\n✅ Fe Vida Real — Sermones: ${made}/${queue.length} · ${used.length}/${temas.length} temas usados`);

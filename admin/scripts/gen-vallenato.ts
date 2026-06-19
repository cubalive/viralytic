// Motor VALLENATO (visualizer musical): canción Suno + voz sola (stem) + letra →
// video 16:9 con fotos animadas (Ken Burns, cortes al beat), CAPTIONS KARAOKE
// perfectos (forced-align del stem con karaoke.py, como Zuri) y soundwave moderno
// opcional. Las fotos se generan (gpt-image-1) si no pones una carpeta photos/.
//
// Pon los archivos en:  data/vallenato/<slug>/  → song.mp3, vocal.(wav|mp3), lyrics.txt
//   (opcional) photos/*.jpg|png
// Uso:  tsx scripts/gen-vallenato.ts <slug> [lang=es]
//   VALLENATO_WAVE=off  → sin soundwave · CUT=<seg> → duración por foto (default 6)
import path from 'node:path';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { geminiImage } from '../src/ai/gemini-image';
import { ff, probeDuration } from '../src/lib/ffmpeg';
import { detectBeats } from '../src/beat/detect';
import { ensureDir } from '../src/lib/files';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';

const exec = promisify(execFile);
const slug = process.argv[2];
if (!slug) throw new Error('Uso: tsx scripts/gen-vallenato.ts <slug> [lang]');
const lang = process.argv[3] || 'es';
const WAVE = (process.env.VALLENATO_WAVE ?? 'on').toLowerCase() !== 'off';
const CUT = Number(process.env.CUT || 6);

const dir = path.join(ROOT, 'data', 'vallenato', slug);
const songP = fs.existsSync(path.join(dir, 'song.mp3')) ? path.join(dir, 'song.mp3') : path.join(dir, 'song.wav');
const lyricsP = path.join(dir, 'lyrics.txt');
const vocalSrc = fs.existsSync(path.join(dir, 'vocal.wav')) ? path.join(dir, 'vocal.wav') : path.join(dir, 'vocal.mp3');
for (const [name, p] of [['song.mp3', songP], ['lyrics.txt', lyricsP], ['vocal.(wav|mp3)', vocalSrc]] as const) {
  if (!fs.existsSync(p)) throw new Error(`Falta ${name} en ${dir}`);
}

const KARAOKE_PY = path.resolve(ROOT, '..', 'apps', 'mv-render', 'karaoke.py');
const MV_DIR = path.resolve(ROOT, '..', 'apps', 'mv-render');

// Temas de fotos vallenato (cinematográfico, 16:9, sin texto) — cuando no traes fotos.
const PHOTO_THEMES = [
  'a romantic Colombian Caribbean coast at golden sunset, palm trees, cinematic, warm light',
  'extreme close-up of a vallenato accordion being played, warm stage light, cinematic, shallow focus',
  'a couple dancing closely at a warm outdoor party at dusk, bokeh lights, cinematic, romantic',
  'a picturesque colorful colonial town plaza in Colombia at golden hour, cinematic, no text',
  'a lone silhouette walking on a tropical beach at sunset, longing, cinematic, warm tones',
  'rustic wooden guitar and sombrero vueltiao on a warm table, dramatic light, cinematic still life',
  'rain on a window at night with warm city bokeh, melancholic romantic mood, cinematic',
  'a vast green Colombian countryside with mountains at sunrise, mist, cinematic, aspirational',
  'fireworks over a small festive coastal town at night, celebration, cinematic, warm',
  'a vintage romantic portrait mood, two hands almost touching, warm cinematic light, no faces clear',
];

async function buildPhotos(n: number): Promise<string[]> {
  const pool = path.join(dir, 'photos');
  const have = fs.existsSync(pool)
    ? fs.readdirSync(pool).filter((f) => /\.(jpe?g|png)$/i.test(f)).map((f) => path.join(pool, f))
    : [];
  if (have.length) { log.ok(`usando ${have.length} fotos de photos/`); return have; }
  await ensureDir(pool);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = path.join(pool, `gen_${String(i).padStart(2, '0')}.png`);
    try {
      if (!(fs.existsSync(p) && fs.statSync(p).size > 10000))
        await geminiImage(`${PHOTO_THEMES[i % PHOTO_THEMES.length]}, ultra realistic cinematic photography, 16:9, premium, highly detailed, no text`, p, { aspectRatio: '16:9' });
      out.push(p); log.ok(`foto ${i}`);
    } catch (e) { log.warn(`foto ${i}: ${(e as Error).message.slice(0, 40)}`); }
  }
  if (!out.length) throw new Error('no se generaron fotos');
  return out;
}

async function main() {
  const dur = await probeDuration(songP);
  log.step(`Vallenato "${slug}" — ${dur.toFixed(1)}s`);

  // 1) Karaoke (forced-align del stem). karaoke.py necesita WAV PCM.
  const vocalWav = path.join(dir, '_vocal16k.wav');
  await ff(['-y', '-i', vocalSrc, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', vocalWav]);
  const assPath = path.join(dir, 'karaoke.ass');
  // Estilo de caption elegido para el canal + intro (título de la canción + cantante).
  const rd = (f: string) => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch { return ''; } };
  let chosenStyle = '';
  try {
    const stylesCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'caption_styles.json'), 'utf8'));
    const key = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'caption_style.json'), 'utf8')) || {})['vallenato'];
    const found = (stylesCfg.styles || []).find((s: any) => s.key === key);
    if (found) chosenStyle = found.style;
  } catch { /* usa el estilo por defecto */ }
  // Overlay de título+cantante SOLO si llenaste el campo cantante. Si lo dejas vacío,
  // se asume que tu imagen de intro ya trae el título (no se superpone nada).
  const artistName = rd('artist.txt');
  const kenv: NodeJS.ProcessEnv = { ...process.env };
  if (artistName) { kenv.KARAOKE_TITLE = rd('title.txt'); kenv.KARAOKE_ARTIST = artistName; }
  if (chosenStyle) kenv.KARAOKE_STYLE = chosenStyle;
  log.step(`Karaoke (forced-align del stem vocal)${chosenStyle ? ' · estilo elegido' : ''}${kenv.KARAOKE_TITLE ? ' · intro título/cantante' : ''}…`);
  const { stdout } = await exec('python', [KARAOKE_PY, vocalWav, lyricsP, assPath, lang], { cwd: MV_DIR, env: kenv, maxBuffer: 1 << 24 });
  log.ok(stdout.trim().split('\n').slice(-2).join(' '));
  const vsM = stdout.match(/voz entra ([\d.]+)s/); // momento exacto en que empieza a cantar
  const voiceStart = vsM ? parseFloat(vsM[1]) : 5;

  // 2) Fondo del visualizer: modo LOOP (Veo 8s primera→última foto) o modo FOTOS (Ken Burns).
  const findFrame = (n: string) => ['png', 'jpg', 'jpeg', 'webp'].map((e) => path.join(dir, `${n}.${e}`)).find((p) => fs.existsSync(p));
  const frame1 = findFrame('frame1'), frame2 = findFrame('frame2');
  const LOOP = process.env.VALLENATO_LOOP === '1' || (!!frame1 && !!frame2);
  const silent = path.join(dir, '_silent.mp4');
  let segs: string[] = []; let listFile = '';

  if (LOOP) {
    if (!frame1 || !frame2) throw new Error('El visualizer necesita Imagen A e Imagen B (inicio y fin del loop)');
    const VEO = path.join(ROOT, 'py', 'veo_loop.py');
    const fileArg = (n: string) => fs.existsSync(path.join(dir, n)) ? path.join(dir, n) : '-';
    const durArg = (n: string, d: number) => { try { return String(parseInt(fs.readFileSync(path.join(dir, n), 'utf8').trim(), 10) || d); } catch { return String(d); } };
    const introWindow = Math.max(5, voiceStart);           // la intro cubre hasta que entra la voz (mín 5s)
    const introSeg = path.join(dir, '_intro.mp4');
    const loopSeg = path.join(dir, '_loopfill.mp4');

    // 1) INTRO (imagen 1, con el título). Video propio → se usa tal cual; imagen + prompt → la anima Veo; imagen sola → Ken Burns.
    const introImg = findFrame('intro') || frame1;
    const introVid = ['mp4', 'mov', 'webm', 'm4v'].map((e) => path.join(dir, `intro.${e}`)).find((p) => fs.existsSync(p));
    let introSrc = introVid;
    const ic = path.join(dir, '_introclip.mp4');
    if (!introVid && fs.existsSync(path.join(dir, 'intro_prompt.txt'))) {
      if (process.env.VALLENATO_REUSE_INTRO === '1' && fs.existsSync(ic) && fs.statSync(ic).size > 10000) {
        log.ok('Intro: reutilizando el clip Veo ya generado (_introclip.mp4) — sin re-gastar Veo');
        introSrc = ic;
      } else {
        log.step('Intro: animando la imagen 1 con Veo (prompt de intro)…');
        const { stdout: io } = await exec('python', [VEO, introImg, '-', ic, fileArg('intro_prompt.txt'), slug, fileArg('intro_neg.txt'), durArg('intro_dur.txt', 6)], { cwd: ROOT, maxBuffer: 1 << 24 });
        log.ok(io.trim().split('\n').slice(-1).join(' '));
        if (fs.existsSync(ic) && fs.statSync(ic).size > 10000) introSrc = ic;
      }
    }
    if (introSrc) {
      log.step(`Intro (${introWindow.toFixed(1)}s)…`);
      await ff(['-y', '-stream_loop', '-1', '-i', introSrc, '-t', introWindow.toFixed(2),
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p',
        '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', introSeg]);
    } else {
      const introFrames = Math.max(1, Math.round(introWindow * 30));
      log.step(`Intro animado Ken Burns (${introWindow.toFixed(1)}s)…`);
      const introVf = `scale=2304:1296:force_original_aspect_ratio=increase,crop=2304:1296,` +
        `zoompan=z='min(1.0+0.0007*on,1.14)':d=${introFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,format=yuv420p`;
      await ff(['-loop', '1', '-i', introImg, '-t', introWindow.toFixed(2), '-vf', introVf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', introSeg]);
    }

    // 2) LOOP (imagen A → imagen B) con su propio prompt/negativo/duración.
    log.step('Loop: generando clip Veo (imagen A → imagen B)…');
    const clip = path.join(dir, '_loop8.mp4');
    const { stdout: vo } = await exec('python', [VEO, frame1, frame2, clip, fileArg('loop_prompt.txt'), slug, fileArg('loop_neg.txt'), durArg('loop_dur.txt', 8)], { cwd: ROOT, maxBuffer: 1 << 24 });
    log.ok(vo.trim().split('\n').slice(-1).join(' '));
    if (!(fs.existsSync(clip) && fs.statSync(clip).size > 10000)) throw new Error('Veo no generó el clip de loop');
    // El loop llena el centro; si hay espacio, se repite el intro al final (bookend).
    const bookend = dur > (introWindow * 2 + 3);
    const loopFill = Math.max(1, dur - introWindow - (bookend ? introWindow : 0));
    log.step(`Repitiendo el loop hasta el final${bookend ? ' (+ intro repetida al cierre)' : ''}…`);
    await ff(['-y', '-stream_loop', '-1', '-i', clip, '-t', loopFill.toFixed(2), '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', loopSeg]);

    // 3) Concat: intro + loop (+ intro al final) → fondo silencioso.
    listFile = path.join(dir, '_list.txt');
    const parts = bookend ? [introSeg, loopSeg, introSeg] : [introSeg, loopSeg];
    fs.writeFileSync(listFile, parts.map((c) => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    await ff(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);
    segs.push(introSeg, loopSeg); // conserva _loop8.mp4 (clip animado) y _introclip.mp4 para los Shorts 9:16
  } else {
    // Modo FOTOS: corte alineado a beats cercanos a CUT + Ken Burns.
    const beats = await detectBeats(songP, { minGap: 1.0 }).catch(() => [] as number[]);
    const cuts: number[] = [0];
    if (beats.length) {
      for (const b of beats) if (b - cuts[cuts.length - 1] >= CUT) cuts.push(b);
    } else {
      for (let t = CUT; t < dur; t += CUT) cuts.push(t);
    }
    if (dur - cuts[cuts.length - 1] > 1) cuts.push(dur);
    const nSeg = cuts.length - 1;
    const photos = await buildPhotos(nSeg);
    log.step(`Visualizer: ${nSeg} segmentos`);
    for (let i = 0; i < nSeg; i++) {
      const segDur = Math.max(0.5, cuts[i + 1] - cuts[i]);
      const img = photos[i % photos.length];
      const out = path.join(dir, `seg_${String(i).padStart(3, '0')}.mp4`);
      const frames = Math.max(1, Math.round(segDur * 30));
      const z = i % 2 === 0 ? `min(1.0+0.0009*on,1.18)` : `max(1.20-0.0009*on,1.02)`;
      const vf =
        `scale=2304:1296:force_original_aspect_ratio=increase,crop=2304:1296,` +
        `zoompan=z='${z}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,format=yuv420p`;
      await ff(['-loop', '1', '-i', img, '-t', segDur.toFixed(2), '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
      segs.push(out);
    }
    listFile = path.join(dir, '_list.txt');
    fs.writeFileSync(listFile, segs.map((c) => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    await ff(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);
  }

  // 4) Soundwave moderno (opcional) + quemar karaoke + montar audio de la canción.
  const final = path.join(dir, 'video.mp4');
  const assEsc = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  // Soundwave configurable: on/off, tamaño (small/medium/large) y posición (top/middle/bottom).
  const waveCfg: any = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'wave.json'), 'utf8')); } catch { return {}; } })();
  const waveOn = waveCfg.on != null ? !!waveCfg.on : WAVE;
  const waveSize = String(waveCfg.size || process.env.VALLENATO_WAVE_SIZE || 'medium');
  const waveH = ({ small: 90, medium: 150, large: 240 } as Record<string, number>)[waveSize] || 150;
  const wavePos = String(waveCfg.pos || process.env.VALLENATO_WAVE_POS || 'bottom');
  const waveY = wavePos === 'top' ? '20' : wavePos === 'middle' ? '(H-h)/2' : `H-${waveH + 25}`;
  const filter = waveOn
    ? `[1:a]showwaves=s=1920x${waveH}:mode=cline:rate=30:colors=0xFF0066|0x00E5FF,format=rgba,colorchannelmixer=aa=0.9[w];` +
      `[0:v][w]overlay=0:${waveY}[bv];[bv]subtitles='${assEsc}'[v]`
    : `[0:v]subtitles='${assEsc}'[v]`;
  log.step(`Montaje final${waveOn ? ` (soundwave ${waveSize} ${wavePos})` : ' (sin soundwave)'}…`);
  await ff(['-y', '-i', silent, '-i', songP, '-filter_complex', filter,
    '-map', '[v]', '-map', '1:a', '-t', dur.toFixed(2),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', final]);

  // limpia intermedios
  for (const s of segs) fs.rmSync(s, { force: true });
  fs.rmSync(silent, { force: true }); if (listFile) fs.rmSync(listFile, { force: true }); fs.rmSync(vocalWav, { force: true });
  log.ok(`✅ ${final}`);

  // 5) Analizador de pista + cortes 9:16 (Shorts/Reels): coro + mejores partes
  try {
    log.step('Analizador + cortes 9:16 (Shorts)…');
    const { stdout: so } = await exec('python', [path.join(ROOT, 'py', 'vallenato_916.py'), slug, lang], { cwd: ROOT, maxBuffer: 1 << 24 });
    log.ok(so.trim().split('\n').slice(-2).join(' '));
  } catch (e) { log.warn(`9:16 (shorts) omitido: ${(e as Error).message.slice(0, 80)}`); }
}
main().catch((e) => { console.error(e); process.exit(1); });

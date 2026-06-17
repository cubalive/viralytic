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
  log.step('Karaoke (forced-align del stem vocal)…');
  const { stdout } = await exec('python', [KARAOKE_PY, vocalWav, lyricsP, assPath, lang], { cwd: MV_DIR, maxBuffer: 1 << 24 });
  log.ok(stdout.trim().split('\n').slice(-2).join(' '));

  // 2) Fotos + corte (alineado a beats cercanos a CUT).
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

  // 3) Visualizer Ken Burns 16:9.
  log.step(`Visualizer: ${nSeg} segmentos`);
  const segs: string[] = [];
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
  const listFile = path.join(dir, '_list.txt');
  fs.writeFileSync(listFile, segs.map((c) => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const silent = path.join(dir, '_silent.mp4');
  await ff(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);

  // 4) Soundwave moderno (opcional) + quemar karaoke + montar audio de la canción.
  const final = path.join(dir, 'video.mp4');
  const assEsc = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  const filter = WAVE
    ? `[1:a]showwaves=s=1920x150:mode=cline:rate=30:colors=0xFF0066|0x00E5FF,format=rgba,colorchannelmixer=aa=0.9[w];` +
      `[0:v][w]overlay=0:H-175[bv];[bv]subtitles='${assEsc}'[v]`
    : `[0:v]subtitles='${assEsc}'[v]`;
  log.step(`Montaje final${WAVE ? ' (con soundwave)' : ''}…`);
  await ff(['-y', '-i', silent, '-i', songP, '-filter_complex', filter,
    '-map', '[v]', '-map', '1:a', '-t', dur.toFixed(2),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', final]);

  // limpia intermedios
  for (const s of segs) fs.rmSync(s, { force: true });
  fs.rmSync(silent, { force: true }); fs.rmSync(listFile, { force: true }); fs.rmSync(vocalWav, { force: true });
  log.ok(`✅ ${final}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

import path from 'node:path';
import fsp from 'node:fs/promises';
import { ff } from '../lib/ffmpeg';
import { ensureDir } from '../lib/files';
import { config } from '../config';
import type { Song } from '../types';

function srtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
}

/** Genera el SRT de captions a partir de las escenas (letra cantada). */
export async function buildSrt(song: Song, outPath: string) {
  await ensureDir(path.dirname(outPath));
  const body = song.scenes
    .map((sc, i) => `${i + 1}\n${srtTime(sc.startSec)} --> ${srtTime(sc.endSec)}\n${sc.lyricLine}\n`)
    .join('\n');
  await fsp.writeFile(outPath, body, 'utf8');
  return outPath;
}

/** Une clips con el demuxer concat (sin recodificar). */
export async function concatClips(clips: string[], outPath: string) {
  await ensureDir(path.dirname(outPath));
  const listFile = outPath + '.list.txt';
  const list = clips.map((c) => `file '${path.resolve(c).replace(/\\/g, '/')}'`).join('\n');
  await fsp.writeFile(listFile, list, 'utf8');
  await ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outPath]);
  await fsp.unlink(listFile).catch(() => {});
  return outPath;
}

/**
 * Master 16:9 "elite": une los clips, mete la música como pista de audio y
 * quema los captions. Resultado 1920x1080.
 */
export async function renderMaster(song: Song, clips: string[], outPath: string) {
  const { w, h } = config.video.masterSize;
  const dir = path.dirname(outPath);
  await ensureDir(dir);

  const joined = path.join(dir, 'joined_16x9.mp4');
  await concatClips(clips, joined);

  const srt = await buildSrt(song, path.join(dir, 'captions.srt'));
  // ffmpeg subtitles filter: en Windows hay que escapar ':' y '\'
  const srtEsc = srt.replace(/\\/g, '/').replace(/:/g, '\\:');

  await ff([
    '-i', joined,
    '-i', song.audioPath,
    '-filter_complex',
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
      `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,` +
      `subtitles='${srtEsc}':force_style='FontName=Arial,FontSize=22,` +
      `PrimaryColour=&H00FFFFFF&,OutlineColour=&H90000000&,BorderStyle=3,Outline=1,MarginV=40'[v]`,
    '-map', '[v]',
    '-map', '1:a',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    outPath,
  ]);
  return outPath;
}

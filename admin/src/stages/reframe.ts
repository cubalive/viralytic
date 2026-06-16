import { ff } from '../lib/ffmpeg';
import { ensureDir } from '../lib/files';
import path from 'node:path';
import { config } from '../config';

/**
 * Reframe 16:9 → 9:16 para Reels / YouTube Kids vertical.
 * Fondo: el mismo video escalado a llenar + blur. Frente: el video 16:9 centrado.
 * Resultado: barras blur arriba/abajo, sin perder contenido.
 */
export async function reframeToReel(input: string, outPath: string) {
  const { w, h } = config.video.reelSize; // 1080x1920
  await ensureDir(path.dirname(outPath));

  const filter =
    `[0:v]split=2[bg][fg];` +
    `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=28[bgb];` +
    `[fg]scale=${w}:-2[fgs];` +
    `[bgb][fgs]overlay=(W-w)/2:(H-h)/2[v]`;

  await ff([
    '-i', input,
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '0:a?',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    outPath,
  ]);
  return outPath;
}

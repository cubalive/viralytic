import fsp from 'node:fs/promises';
import { ff } from '../lib/ffmpeg';
import { config } from '../config';

// Escapa rutas para los filtros de ffmpeg en Windows.
function esc(p: string) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

// Quita emojis/símbolos (Arial no los dibuja) y deja texto legible.
function stripEmoji(s: string) {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Genera un clip vertical 9:16 de un "beat": imagen con un suave zoom (Ken Burns)
 * y el texto en pantalla grande y legible (sin captions; es un gráfico).
 */
export async function makeBeatClip(
  image: string,
  text: string,
  lang: string,
  dur: number,
  outPath: string,
): Promise<string> {
  const FPS = 30;
  const frames = Math.max(1, Math.round(dur * FPS));
  const font = lang === 'zh' ? config.fonts.cjk : config.fonts.latin;

  const clean = stripEmoji(text);
  const txtFile = outPath + '.txt';
  await fsp.writeFile(txtFile, clean, 'utf8');

  const vf =
    `scale=1620:2880:force_original_aspect_ratio=increase,crop=1620:2880,` +
    `zoompan=z='min(zoom+0.0009,1.18)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${FPS},` +
    `drawtext=fontfile='${esc(font)}':textfile='${esc(txtFile)}':fontcolor=white:fontsize=66:` +
    `borderw=6:bordercolor=black@0.9:box=1:boxcolor=black@0.45:boxborderw=26:` +
    `x=(w-text_w)/2:y=h-440:line_spacing=12`;

  await ff([
    '-loop', '1', '-i', image,
    '-t', dur.toFixed(2),
    '-vf', vf,
    '-r', String(FPS),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    outPath,
  ]);
  await fsp.unlink(txtFile).catch(() => {});
  return outPath;
}

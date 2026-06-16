import { ff } from '../lib/ffmpeg';

function esc(p: string) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/**
 * Combina video + audio y QUEMA los captions sincronizados (único texto visible).
 * Si srtPath es null, solo combina sin captions.
 */
export async function burnCaptionsAndAudio(
  video: string,
  audio: string,
  srtPath: string | null,
  lang: string,
  out: string,
): Promise<string> {
  const fontName = lang === 'zh' ? 'Microsoft YaHei' : 'Arial';

  if (!srtPath) {
    await ff(['-i', video, '-i', audio, '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
    return out;
  }

  const style =
    `FontName=${fontName},FontSize=15,Bold=1,PrimaryColour=&H00FFFFFF&,` +
    `OutlineColour=&H00000000&,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=40`;
  await ff([
    '-i', video, '-i', audio,
    '-filter_complex', `[0:v]subtitles='${esc(srtPath)}':force_style='${style}'[v]`,
    '-map', '[v]', '-map', '1:a',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    out,
  ]);
  return out;
}

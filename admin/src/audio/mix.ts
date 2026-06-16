import { ff, probeDuration } from '../lib/ffmpeg';

export interface SfxItem { path: string; atSec: number; gain?: number }

/**
 * Mezcla voz (frente) + música (fondo, loop, bajo) + efectos de sonido ubicados en su
 * segundo (adelay). Resultado mp3 de duración targetDuration (o la de la voz).
 */
export async function mixAll(
  voicePath: string,
  musicPath: string,
  sfx: SfxItem[],
  outPath: string,
  opts: { musicGain?: number; targetDuration?: number } = {},
): Promise<string> {
  const gain = opts.musicGain ?? 0.16;
  const d = opts.targetDuration ?? (await probeDuration(voicePath));
  const fadeStart = Math.max(0, d - 0.6);

  const inputs: string[] = ['-i', voicePath, '-stream_loop', '-1', '-i', musicPath];
  for (const s of sfx) inputs.push('-i', s.path);

  const labels: string[] = ['[v]', '[bg]'];
  let filter =
    `[0:a]apad=whole_dur=${d.toFixed(2)},aformat=channel_layouts=stereo[v];` +
    `[1:a]volume=${gain},aformat=channel_layouts=stereo[bg];`;
  sfx.forEach((s, i) => {
    const idx = i + 2;
    const ms = Math.max(0, Math.round(s.atSec * 1000));
    const g = s.gain ?? 0.9;
    filter += `[${idx}:a]adelay=${ms}|${ms},volume=${g},aformat=channel_layouts=stereo[s${i}];`;
    labels.push(`[s${i}]`);
  });
  filter +=
    `${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=0[mx];` +
    `[mx]afade=t=out:st=${fadeStart.toFixed(2)}:d=0.6[a]`;

  await ff([...inputs, '-filter_complex', filter, '-map', '[a]', '-t', d.toFixed(2), '-c:a', 'libmp3lame', '-q:a', '3', outPath]);
  return outPath;
}

/** Mezcla simple voz + música (sin efectos). */
export async function mixVoiceMusic(
  voicePath: string,
  musicPath: string,
  outPath: string,
  opts: { musicGain?: number; targetDuration?: number } = {},
): Promise<string> {
  return mixAll(voicePath, musicPath, [], outPath, opts);
}

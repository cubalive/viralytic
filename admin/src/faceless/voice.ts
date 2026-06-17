// Voz en off para los motores faceless: narra los fragmentos con ElevenLabs y
// devuelve los tiempos de aparición SINCRONIZADOS a la voz (usando los
// timestamps de ElevenLabs), para que cada fragmento aparezca cuando se dice.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { tts } from '../ai/elevenlabs';
import { probeDuration } from '../lib/ffmpeg';

export interface Narration {
  voicePath: string;
  voiceDur: number;
  /** tiempo (s) en que debe aparecer cada fragmento (uno por fragmento) */
  times: number[];
}

/**
 * Genera la voz del mensaje (fragmentos en orden) y calcula cuándo aparece cada
 * fragmento. Si el mapeo por timestamps falla, reparte uniforme por la duración.
 */
export async function narrate(
  fragmentos: string[],
  dir: string,
  lang: string,
  voiceId?: string,
): Promise<Narration> {
  const text = fragmentos.join('  ').replace(/\s+/g, ' ').trim();
  const voicePath = path.join(dir, 'voice.mp3');
  await tts(text, voicePath, { lang, voiceId });
  const voiceDur = await probeDuration(voicePath);

  let times: number[] = [];
  try {
    const align = JSON.parse(await fsp.readFile(`${voicePath}.timestamps.json`, 'utf8')) as
      | { character_start_times_seconds?: number[] }
      | null;
    const starts = align?.character_start_times_seconds ?? [];
    if (starts.length) {
      let cursor = 0;
      for (const f of fragmentos) {
        const idx = text.indexOf(f, cursor);
        const at = idx >= 0 ? idx : cursor;
        times.push(starts[Math.min(at, starts.length - 1)] ?? 0);
        cursor = at + f.length;
      }
      // sanity: monótono y dentro de la duración
      const ok = times.every((t, i) => t >= 0 && t <= voiceDur + 0.5 && (i === 0 || t >= times[i - 1] - 0.01));
      if (!ok) times = [];
    }
  } catch {
    times = [];
  }
  if (times.length !== fragmentos.length || !fragmentos.length) {
    times = fragmentos.map((_, i) => (i * voiceDur) / Math.max(1, fragmentos.length));
  }
  return { voicePath, voiceDur, times };
}

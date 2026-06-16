import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { ensureDir } from '../lib/files';

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/**
 * Texto → voz (mp3) con ElevenLabs, SIEMPRE con timestamps.
 * Escribe el audio en outPath y la alineación en `${outPath}.timestamps.json`
 * (para poder generar captions cuando se necesiten). Devuelve la ruta del audio.
 */
export async function tts(
  text: string,
  outPath: string,
  opts: { lang?: string; voiceId?: string; modelId?: string } = {},
): Promise<string> {
  if (!config.elevenlabs.apiKey) throw new Error('Falta ELEVENLABS_API_KEY en .env');
  const voice = opts.voiceId
    ?? (opts.lang ? config.elevenlabs.voices[opts.lang] : undefined)
    ?? config.elevenlabs.voiceId;
  const model = opts.modelId ?? config.elevenlabs.modelId;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': config.elevenlabs.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 400)}`);

  const data = (await res.json()) as { audio_base64?: string; alignment?: Alignment; normalized_alignment?: Alignment };
  if (!data.audio_base64) throw new Error('ElevenLabs no devolvió audio_base64');

  await ensureDir(path.dirname(outPath));
  await fsp.writeFile(outPath, Buffer.from(data.audio_base64, 'base64'));
  const align = data.normalized_alignment ?? data.alignment ?? null;
  await fsp.writeFile(`${outPath}.timestamps.json`, JSON.stringify(align), 'utf8');
  return outPath;
}

function srtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(sec)},${p(ms, 3)}`;
}

/**
 * Construye un SRT a partir de los timestamps de ElevenLabs (agrupando en líneas).
 * Queda implementado para usarlo cuando un canal sí quiera captions.
 */
export async function buildCaptionsSrt(
  timestampsPath: string,
  srtPath: string,
  opts: { wordsPerLine?: number } = {},
): Promise<string | null> {
  const a = JSON.parse(await fsp.readFile(timestampsPath, 'utf8')) as Alignment | null;
  if (!a?.characters?.length) return null;

  const words: { w: string; start: number; end: number }[] = [];
  let cur = '', s = -1, e = 0;
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    if (ch === ' ' || ch === '\n') { if (cur) { words.push({ w: cur, start: s, end: e }); cur = ''; s = -1; } continue; }
    if (s < 0) s = a.character_start_times_seconds[i];
    e = a.character_end_times_seconds[i];
    cur += ch;
  }
  if (cur) words.push({ w: cur, start: s, end: e });

  const per = opts.wordsPerLine ?? 4;
  const lines: { text: string; start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i += per) {
    const grp = words.slice(i, i + per);
    lines.push({ text: grp.map((g) => g.w).join(' '), start: grp[0].start, end: grp[grp.length - 1].end });
  }
  const srt = lines.map((l, i) => `${i + 1}\n${srtTime(l.start)} --> ${srtTime(l.end)}\n${l.text}\n`).join('\n');
  await ensureDir(path.dirname(srtPath));
  await fsp.writeFile(srtPath, srt, 'utf8');
  return srtPath;
}

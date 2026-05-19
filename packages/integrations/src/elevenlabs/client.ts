import { IntegrationError, logger, COSTS_CENTS } from '@viralytic/shared';

const API_BASE = 'https://api.elevenlabs.io/v1';

export interface SynthesizeOptions {
  voiceId: string;
  text: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speakerBoost?: boolean;
  language?: string;
}

/**
 * Convert text with **double asterisk** emotion peaks into SSML-like markup
 * understood by ElevenLabs (slow emphasis + slight pitch increase on marked phrases).
 */
export function applyEmotionMarkup(text: string): string {
  // ElevenLabs respects pause tags and supports ssml-like prosody
  return text.replace(
    /\*\*(.+?)\*\*/g,
    (_, inner) => `<break time="100ms"/>${inner}<break time="100ms"/>`
  );
}

export interface SynthesisResult {
  audioBuffer: Buffer;
  charactersUsed: number;
  costCents: number;
  contentType: string;
}

export async function synthesize(opts: SynthesizeOptions): Promise<SynthesisResult> {
  const {
    voiceId,
    text,
    modelId = 'eleven_multilingual_v2',
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0.3,
    speakerBoost = true,
  } = opts;

  const processedText = applyEmotionMarkup(text);

  const res = await fetch(`${API_BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: processedText,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: speakerBoost,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new IntegrationError('ELEVENLABS_SYNTHESIS', `ElevenLabs synthesis failed: ${res.status}`, {
      status: res.status,
      body: errText,
    });
  }

  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);
  const charactersUsed = processedText.length;
  const costCents = Math.ceil((charactersUsed / 1000) * COSTS_CENTS.elevenlabsPer1kChars);

  logger.info({ voiceId, charactersUsed, costCents }, 'elevenlabs.synthesize');

  return { audioBuffer, charactersUsed, costCents, contentType: 'audio/mpeg' };
}

/** Clone a voice from a sample audio buffer */
export async function cloneVoice(input: {
  name: string;
  description?: string;
  sampleAudioFiles: Buffer[];
  labels?: Record<string, string>;
}): Promise<{ voiceId: string }> {
  const formData = new FormData();
  formData.append('name', input.name);
  if (input.description) formData.append('description', input.description);
  if (input.labels) formData.append('labels', JSON.stringify(input.labels));
  input.sampleAudioFiles.forEach((buf, i) => {
    formData.append('files', new Blob([new Uint8Array(buf)]), `sample_${i}.mp3`);
  });

  const res = await fetch(`${API_BASE}/voices/add`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
    body: formData,
  });

  if (!res.ok) {
    throw new IntegrationError('ELEVENLABS_CLONE', `Voice cloning failed: ${res.status}`, { body: await res.text() });
  }
  const data = await res.json() as { voice_id: string };
  return { voiceId: data.voice_id };
}

/** List available voices for the account */
export async function listVoices(): Promise<Array<{ voiceId: string; name: string; category: string }>> {
  const res = await fetch(`${API_BASE}/voices`, {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
  });
  if (!res.ok) throw new IntegrationError('ELEVENLABS_LIST', 'List voices failed');
  const data = await res.json() as { voices: Array<{ voice_id: string; name: string; category: string }> };
  return data.voices.map(v => ({ voiceId: v.voice_id, name: v.name, category: v.category }));
}

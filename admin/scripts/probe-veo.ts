// Sondeo real (sin poll): qué modelo Veo acepta el proyecto. 404 = no; operación = sí.
import path from 'node:path';
import { publisherModelUrl, vertexPost } from '../src/lib/vertex';
import { toBase64 } from '../src/lib/files';
import { CHARACTERS_DIR } from '../src/config';

const img = await toBase64(path.join(CHARACTERS_DIR, 'sabi', 'canon', 'sabi_01_wave.png'));
const body = {
  instances: [{ prompt: 'a cute robot waving, smooth motion', image: { bytesBase64Encoded: img, mimeType: 'image/png' } }],
  parameters: { aspectRatio: '9:16', durationSeconds: 8, sampleCount: 1, generateAudio: false },
};

const MODELS = ['veo-3.0-fast-generate-001', 'veo-3.0-generate-001', 'veo-3.1-generate-preview'];
for (const m of MODELS) {
  try {
    const op = await vertexPost(publisherModelUrl(m, 'predictLongRunning'), body, { retries: 0 });
    console.log(`${m} → ✅ OPERACIÓN: ${op?.name ?? JSON.stringify(op).slice(0, 80)}`);
  } catch (e) {
    console.log(`${m} → ❌ ${(e as Error).message.split('\n')[0]}`);
  }
}

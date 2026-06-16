import { config } from '../config';
import { publisherModelUrl, fetchOperationUrl, vertexPost } from '../lib/vertex';
import { saveBase64, toBase64 } from '../lib/files';
import { log } from '../lib/log';

export interface VeoOptions {
  firstFrame?: string;  // ruta de imagen (frame inicial)
  lastFrame?: string;   // ruta de imagen (frame final)
  aspectRatio?: '16:9' | '9:16';
  durationSeconds?: number;
  generateAudio?: boolean;
}

async function imageField(p?: string) {
  if (!p) return undefined;
  return { bytesBase64Encoded: await toBase64(p), mimeType: 'image/png' };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Genera un clip de video con Veo (operación de larga duración + polling). */
export async function generateVideo(prompt: string, outPath: string, opts: VeoOptions = {}): Promise<string> {
  const instance: any = { prompt };
  const first = await imageField(opts.firstFrame);
  const last = await imageField(opts.lastFrame);
  if (first) instance.image = first;
  if (last) instance.lastFrame = last; // Veo 3.1: interpolación frame inicial → final

  const body = {
    instances: [instance],
    parameters: {
      aspectRatio: opts.aspectRatio ?? '16:9',
      durationSeconds: opts.durationSeconds ?? config.video.clipSeconds,
      sampleCount: 1,
      generateAudio: opts.generateAudio ?? false,
    },
  };

  const startUrl = publisherModelUrl(config.models.veo, 'predictLongRunning');
  const op = await vertexPost(startUrl, body);
  const opName: string = op?.name;
  if (!opName) throw new Error('Veo no devolvió operación: ' + JSON.stringify(op).slice(0, 400));

  const fetchUrl = fetchOperationUrl(config.models.veo);
  for (let i = 0; i < 90; i++) {
    await sleep(10_000);
    const status = await vertexPost(fetchUrl, { operationName: opName });
    if (status?.done) {
      if (status.error) throw new Error('Veo error: ' + JSON.stringify(status.error).slice(0, 600));
      const vids =
        status?.response?.videos ??
        status?.response?.generatedSamples ??
        status?.response?.predictions ??
        [];
      const v = vids?.[0];
      const b64 = v?.bytesBase64Encoded ?? v?.video?.bytesBase64Encoded;
      const uri = v?.gcsUri ?? v?.video?.gcsUri;
      if (b64) {
        await saveBase64(outPath, b64);
        return outPath;
      }
      if (uri) throw new Error('Veo devolvió GCS URI (falta descargar de GCS): ' + uri);
      throw new Error('Veo terminó sin video: ' + JSON.stringify(status).slice(0, 600));
    }
    log.info(`Veo generando… (${(i + 1) * 10}s)`);
  }
  throw new Error('Veo timeout (>15 min)');
}

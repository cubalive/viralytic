import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { uploadPublic } from '../lib/storage';
import { ensureDir } from '../lib/files';
import { log } from '../lib/log';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lip sync con Sync.so: sube video + audio (voz), crea el job, hace polling y
 * descarga el video con la boca sincronizada. Devuelve la ruta del video sincronizado.
 */
export async function syncLips(videoPath: string, audioPath: string, outPath: string): Promise<string> {
  if (!config.sync.apiKey) throw new Error('Falta SYNC_API_KEY en .env');
  const tag = path.basename(path.dirname(outPath));

  // 1) Sync descarga desde URL → subimos a Supabase (público) primero.
  const videoUrl = await uploadPublic(videoPath, `kids-studio/tmp/${tag}_motion.mp4`, 'video/mp4');
  const audioUrl = await uploadPublic(audioPath, `kids-studio/tmp/${tag}_voz.mp3`, 'audio/mpeg');

  // 2) Crear job
  const create = await fetch('https://api.sync.so/v2/generate', {
    method: 'POST',
    headers: { 'x-api-key': config.sync.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.sync.model,
      input: [
        { type: 'video', url: videoUrl },
        { type: 'audio', url: audioUrl },
      ],
      options: { output_format: 'mp4' },
    }),
  });
  if (!create.ok) throw new Error(`Sync create ${create.status}: ${(await create.text()).slice(0, 400)}`);
  const job: any = await create.json();
  const id = job.id ?? job.generationId;
  if (!id) throw new Error('Sync no devolvió id: ' + JSON.stringify(job).slice(0, 200));
  log.info(`Sync job ${id} (${config.sync.model})`);

  // 3) Polling
  for (let i = 0; i < 120; i++) {
    await sleep(8000);
    const r = await fetch(`https://api.sync.so/v2/generate/${id}`, { headers: { 'x-api-key': config.sync.apiKey } });
    const s: any = await r.json();
    const status = (s.status ?? '').toUpperCase();
    if (status === 'COMPLETED') {
      const out = s.outputUrl ?? s.output_url ?? s.url;
      if (!out) throw new Error('Sync COMPLETED sin outputUrl: ' + JSON.stringify(s).slice(0, 200));
      const vid = await fetch(out);
      await ensureDir(path.dirname(outPath));
      await fsp.writeFile(outPath, Buffer.from(await vid.arrayBuffer()));
      return outPath;
    }
    if (['FAILED', 'REJECTED', 'ERROR', 'CANCELED', 'TIMED_OUT'].includes(status)) {
      throw new Error(`Sync ${status}: ${JSON.stringify(s).slice(0, 300)}`);
    }
    log.info(`Sync ${status || 'PROCESSING'}… (${(i + 1) * 8}s)`);
  }
  throw new Error('Sync timeout (>16 min)');
}

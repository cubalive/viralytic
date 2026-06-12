// Internal HTTP enqueue server for the web → workers bridge.
//
// Keeps BullMQ entirely out of Next.js bundles: the web app POSTs to
// /enqueue with a shared-secret header instead of importing bullmq.
// Only one endpoint, only POST, only with the matching secret.
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger, QUEUE_NAMES } from '@viralytic/shared';
import { queues, type QueueName } from './queues';

const ENQUEUE_PATH = '/enqueue';
const MAX_BODY_BYTES = 64_000;

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('body_too_large'));
        return;
      }
      data += chunk.toString('utf8');
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

export function startHttpServer(): http.Server | null {
  const port = parseInt(process.env.WORKERS_HTTP_PORT ?? '4001', 10);
  const secret = process.env.ENQUEUE_SECRET;
  if (!secret) {
    logger.error(
      'ENQUEUE_SECRET is not set — HTTP enqueue server disabled. Jobs from the web will fail to enqueue.',
    );
    return null;
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== ENQUEUE_PATH) {
        return json(res, 404, { ok: false, error: 'not_found' });
      }
      if (req.headers['x-enqueue-secret'] !== secret) {
        return json(res, 401, { ok: false, error: 'unauthorized' });
      }

      const body = (await readJsonBody(req)) as { queue?: unknown; [k: string]: unknown };
      const queueName = body?.queue;

      if (typeof queueName !== 'string' || !(queueName in queues)) {
        return json(res, 400, { ok: false, error: 'invalid_queue', received: queueName });
      }

      // Forward everything except the routing key as the BullMQ job payload.
      const { queue: _queue, ...payload } = body;
      const q = queues[queueName as QueueName];
      const jobName = QUEUE_NAMES[queueName as QueueName];

      const bullJob = await q.add(jobName, payload as any);
      logger.info({ queueName, jobBullId: bullJob.id }, 'http.enqueue.ok');
      return json(res, 200, { ok: true, jobBullId: bullJob.id });
    } catch (err) {
      logger.error({ err }, 'http.handler.error');
      if (!res.headersSent) {
        json(res, 500, { ok: false, error: (err as Error).message });
      } else {
        res.end();
      }
    }
  });

  server.listen(port, () => {
    logger.info({ port }, 'workers.http.listening');
  });

  return server;
}

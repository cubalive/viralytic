import { config } from '../config';
import { getAccessToken } from './auth';
import { log } from './log';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function host(location: string) {
  return location === 'global'
    ? 'https://aiplatform.googleapis.com'
    : `https://${location}-aiplatform.googleapis.com`;
}

export function publisherModelUrl(model: string, method: string, location = config.gcp.location) {
  return `${host(location)}/v1/projects/${config.gcp.projectId}/locations/${location}` +
    `/publishers/google/models/${model}:${method}`;
}

export function fetchOperationUrl(model: string, location = config.gcp.location) {
  return `${host(location)}/v1/projects/${config.gcp.projectId}/locations/${location}` +
    `/publishers/google/models/${model}:fetchPredictOperation`;
}

export async function vertexPost<T = any>(
  url: string,
  body: unknown,
  opts: { retries?: number } = {},
): Promise<T> {
  const max = opts.retries ?? 5;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    let text: string;
    try {
      const token = await getAccessToken();
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Goog-User-Project': config.gcp.projectId,
        },
        body: JSON.stringify(body),
      });
      text = await res.text();
    } catch (e) {
      // Error de red (ECONNRESET, etc.) → reintenta con backoff.
      if (attempt < max) {
        const waitMs = Math.min(64_000, 4_000 * 2 ** attempt);
        log.warn(`Red falló (${(e as Error).message.slice(0, 60)}) — reintento ${attempt + 1}/${max} en ${waitMs / 1000}s`);
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
    if (res.ok) return (text ? JSON.parse(text) : {}) as T;

    // Reintenta ante límite de cuota / errores transitorios con backoff exponencial.
    const transient = res.status === 429 || res.status === 500 || res.status === 503;
    if (transient && attempt < max) {
      const waitMs = Math.min(64_000, 4_000 * 2 ** attempt); // 4s, 8s, 16s, 32s, 64s
      log.warn(`Vertex ${res.status} (cuota/transitorio) — reintento ${attempt + 1}/${max} en ${waitMs / 1000}s`);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`Vertex ${res.status} en ${url}\n${text.slice(0, 1500)}`);
  }
}

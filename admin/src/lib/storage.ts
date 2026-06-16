import fsp from 'node:fs/promises';
import { config } from '../config';

/** Sube un archivo local a Supabase Storage (bucket público) y devuelve la URL pública. */
export async function uploadPublic(
  localPath: string,
  objectPath: string,
  contentType = 'application/octet-stream',
  bucket = 'story-videos',
): Promise<string> {
  const base = `${config.sounds.url}/storage/v1`;
  const data = await fsp.readFile(localPath);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${base}/object/${bucket}/${objectPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.sounds.key}`,
          apikey: config.sounds.key,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        body: data,
      });
      if (!res.ok) throw new Error(`Upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return `${base}/object/public/${bucket}/${objectPath}`;
    } catch (e) {
      if (attempt < 4) { await new Promise((r) => setTimeout(r, 2500 * (attempt + 1))); continue; }
      throw e;
    }
  }
}

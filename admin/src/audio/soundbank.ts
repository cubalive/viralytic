import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { ensureDir } from '../lib/files';

/** Lista las pistas de un mood en el bucket de sonidos (Supabase). */
async function listMood(mood: string): Promise<string[]> {
  const res = await fetch(`${config.sounds.url}/storage/v1/object/list/${config.sounds.bucket}`, {
    method: 'POST',
    headers: {
      apikey: config.sounds.key,
      Authorization: `Bearer ${config.sounds.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: `${mood}/`, limit: 500 }),
  });
  if (!res.ok) throw new Error(`Soundbank list ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const arr = (await res.json()) as any[];
  return arr.filter((x) => x.id !== null).map((x) => `${mood}/${x.name}`);
}

/** Descarga una pista de fondo del mood dado (el bucket es público). */
export async function getMoodTrack(mood: string, outPath: string, pick = 0): Promise<string> {
  const files = await listMood(mood);
  if (!files.length) throw new Error(`Sin pistas en el mood "${mood}" (bucket ${config.sounds.bucket})`);
  const chosen = files[pick % files.length];
  const url = `${config.sounds.url}/storage/v1/object/public/${config.sounds.bucket}/${encodeURI(chosen)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga de sonido ${res.status}: ${url}`);
  await ensureDir(path.dirname(outPath));
  await fsp.writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  return outPath;
}

export async function moodCount(mood: string): Promise<number> {
  return (await listMood(mood)).length;
}

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_PATH } from '../config';

export async function ensureDir(p: string) {
  await fsp.mkdir(p, { recursive: true });
}

export function exists(p: string) {
  return fs.existsSync(p);
}

export async function writeJson(p: string, data: unknown) {
  await ensureDir(path.dirname(p));
  await fsp.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

export async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export async function saveBase64(p: string, b64: string) {
  await ensureDir(path.dirname(p));
  await fsp.writeFile(p, Buffer.from(b64, 'base64'));
}

export async function toBase64(p: string): Promise<string> {
  return (await fsp.readFile(p)).toString('base64');
}

// === Manifest = banco de assets (índice reutilizable) ===
export interface Manifest {
  characters: Record<string, { canonImages: string[]; updatedAt: string }>;
  songs: Record<string, {
    status: string;
    master?: string;
    reel?: string;
    scenes: number;
    updatedAt: string;
  }>;
}

const EMPTY: Manifest = { characters: {}, songs: {} };

export async function loadManifest(): Promise<Manifest> {
  return readJson<Manifest>(MANIFEST_PATH, EMPTY);
}

export async function saveManifest(m: Manifest) {
  await writeJson(MANIFEST_PATH, m);
}

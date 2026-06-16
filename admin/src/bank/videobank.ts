// Banco de videos CLASIFICADOS y reutilizables (para no regenerar Veo de más).
// Cada clip vive en data/bank/<theme>/clips/ y se cataloga en data/bank/<theme>/bank.json.
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from '../config';

export interface BankClip {
  id: string;
  file: string;
  category: string;
  tags: string[];
  durationS: number;
  prompt: string;
}

export const bankDir = (theme: string) => path.join(ROOT, 'data', 'bank', theme);
export const clipsDir = (theme: string) => path.join(bankDir(theme), 'clips');
const manifestPath = (theme: string) => path.join(bankDir(theme), 'bank.json');

export function loadBank(theme: string): BankClip[] {
  try { return JSON.parse(fs.readFileSync(manifestPath(theme), 'utf8')); } catch { return []; }
}
export function saveBank(theme: string, clips: BankClip[]) {
  fs.mkdirSync(bankDir(theme), { recursive: true });
  fs.writeFileSync(manifestPath(theme), JSON.stringify(clips, null, 2), 'utf8');
}
/** Agrega o reemplaza un clip por id. */
export function addClip(theme: string, clip: BankClip) {
  const all = loadBank(theme).filter((c) => c.id !== clip.id);
  all.push(clip);
  saveBank(theme, all);
}
export function countByCategory(theme: string, category: string): number {
  return loadBank(theme).filter((c) => c.category === category).length;
}
export function categories(theme: string): string[] {
  return [...new Set(loadBank(theme).map((c) => c.category))];
}
/**
 * Selecciona n clips reutilizables. Prioriza la categoría, luego tags, luego cualquier clip.
 * Cicla con offset para variar entre videos. Solo devuelve clips cuyo archivo existe.
 */
export function pickClips(theme: string, opts: { category?: string; tags?: string[]; n: number; offset?: number }): BankClip[] {
  const all = loadBank(theme).filter((c) => fs.existsSync(c.file) && fs.statSync(c.file).size > 10000);
  let pool = all;
  if (opts.category) { const byCat = all.filter((c) => c.category === opts.category); if (byCat.length) pool = byCat; }
  if (pool === all && opts.tags?.length) { const byTag = all.filter((c) => c.tags.some((t) => opts.tags!.includes(t))); if (byTag.length) pool = byTag; }
  if (!pool.length) return [];
  const out: BankClip[] = [];
  const off = opts.offset || 0;
  for (let i = 0; i < opts.n; i++) out.push(pool[(off + i) % pool.length]);
  return out;
}

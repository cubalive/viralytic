// Helper COMPARTIDO del BANCO DE VIDEOS GENERAL.
// Convención única para TODOS los proyectos: <BANK>/<Canal>/<IDIOMA>/<Publicados|Generados>/<nombre>.mp4
// Cualquier pipeline (este admin o viralytic) deja sus videos llamando a placeInBank().
import fs from 'node:fs';
import path from 'node:path';

export const BANK_DIR = process.env.BANK_DIR || 'E:\\0005. Passkal\\Canales de Youtube\\BANCO DE VIDEOS GENERAL';
export type Estado = 'Publicados' | 'Generados';

/**
 * Coloca (copia) un video en el banco, en Canal/IDIOMA/Estado/nombre.mp4.
 * Si el mismo nombre estaba en el otro estado (p.ej. pasó de Generado a Publicado), lo mueve.
 * Reanudable: no recopia si ya existe. Devuelve la ruta destino.
 */
export function placeInBank(channel: string, lang: string, status: Estado, name: string, srcFile: string): string {
  const L = lang.toUpperCase();
  const file = name.endsWith('.mp4') ? name : `${name}.mp4`;
  const other: Estado = status === 'Publicados' ? 'Generados' : 'Publicados';
  const otherPath = path.join(BANK_DIR, channel, L, other, file);
  if (fs.existsSync(otherPath)) { try { fs.unlinkSync(otherPath); } catch {} }
  const dst = path.join(BANK_DIR, channel, L, status, file);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (!fs.existsSync(dst)) fs.copyFileSync(srcFile, dst);
  return dst;
}

/** Igual que placeInBank pero desde un Buffer (útil al bajar de Supabase storage). */
export function writeToBank(channel: string, lang: string, status: Estado, name: string, data: Buffer): string {
  const L = lang.toUpperCase();
  const file = name.endsWith('.mp4') ? name : `${name}.mp4`;
  const other: Estado = status === 'Publicados' ? 'Generados' : 'Publicados';
  const otherPath = path.join(BANK_DIR, channel, L, other, file);
  if (fs.existsSync(otherPath)) { try { fs.unlinkSync(otherPath); } catch {} }
  const dst = path.join(BANK_DIR, channel, L, status, file);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (!fs.existsSync(dst)) fs.writeFileSync(dst, data);
  return dst;
}

import path from 'node:path';
import fsp from 'node:fs/promises';
import { geminiImage } from '../ai/gemini-image';
import { qaCanonImage } from './qa';
import { ensureDir, loadManifest, saveManifest } from '../lib/files';
import { log } from '../lib/log';
import type { Character } from '../types';

// Tomas estándar que definen un canon sólido y reutilizable.
const CANON_SHOTS = [
  'full body, neutral standing pose, plain studio background',
  'happy expression, close-up portrait',
  'singing with open mouth, mid shot',
  'dancing pose, full body, dynamic',
  'side profile view, full body',
  'three-quarter view, friendly smile',
];

/** Construye el canon de un personaje a partir de sus 3 fotos de referencia. */
export async function buildCanon(char: Character): Promise<string[]> {
  log.step(`Canon: ${char.name} (${char.id})`);

  const refs = (await fsp.readdir(char.refDir).catch(() => []))
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => path.join(char.refDir, f));

  if (refs.length < 1) {
    throw new Error(
      `Faltan fotos de referencia en ${char.refDir}\n` +
        `Pon 3 fotos del personaje "${char.name}" ahí y vuelve a correr.`,
    );
  }
  log.info(`${refs.length} foto(s) de referencia encontradas`);
  await ensureDir(char.canonDir);

  const made: string[] = [];
  for (let i = 0; i < CANON_SHOTS.length; i++) {
    const shot = CANON_SHOTS[i];
    const out = path.join(char.canonDir, `canon_${String(i + 1).padStart(2, '0')}.png`);
    const prompt =
      `${char.description}. ${shot}. Children's cartoon style, consistent character design, ` +
      `bright, friendly, safe for kids.`;

    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      await geminiImage(prompt, out, { aspectRatio: '1:1', refImagePaths: refs });
      const verdict = await qaCanonImage(out, refs, char.description);
      ok = verdict.pass;
      if (!ok) log.warn(`Toma ${i + 1}, intento ${attempt}: QA falló — ${verdict.reason}`);
    }
    if (ok) {
      made.push(out);
      log.ok(`Toma ${i + 1}/${CANON_SHOTS.length} OK`);
    } else {
      log.err(`Toma ${i + 1} descartada tras 3 intentos`);
    }
  }

  const m = await loadManifest();
  m.characters[char.id] = { canonImages: made, updatedAt: new Date().toISOString() };
  await saveManifest(m);

  log.ok(`Canon de ${char.name}: ${made.length}/${CANON_SHOTS.length} imágenes guardadas`);
  return made;
}

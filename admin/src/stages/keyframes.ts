import path from 'node:path';
import { geminiImage } from '../ai/gemini-image';
import { ensureDir } from '../lib/files';
import type { Scene } from '../types';

/**
 * Genera el frame inicial y final de una escena con Gemini.
 * Si hay imágenes de canon (refs), las pasa como referencia para mantener al
 * personaje consistente; si no, genera libre (modo sin canon todavía).
 */
export async function sceneKeyframes(scene: Scene, refs: string[], outDir: string): Promise<Scene> {
  await ensureDir(outDir);
  const n = String(scene.index + 1).padStart(2, '0');
  const first = path.join(outDir, `scene_${n}_a.png`);
  const last = path.join(outDir, `scene_${n}_b.png`);

  const refImagePaths = refs.length ? refs : undefined;
  await geminiImage(`${scene.imagePrompt}. Opening frame of the shot.`, first, { aspectRatio: '16:9', refImagePaths });
  await geminiImage(`${scene.imagePrompt}. Closing frame, slight natural motion change.`, last, { aspectRatio: '16:9', refImagePaths });

  scene.firstFrame = first;
  scene.lastFrame = last;
  return scene;
}

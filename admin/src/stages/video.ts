import path from 'node:path';
import { generateVideo } from '../ai/veo';
import { ensureDir } from '../lib/files';
import type { Scene } from '../types';

/** Genera el clip de 8s de una escena con Veo (frame inicial + final). */
export async function sceneClip(scene: Scene, outDir: string): Promise<Scene> {
  await ensureDir(outDir);
  const n = String(scene.index + 1).padStart(2, '0');
  const out = path.join(outDir, `clip_${n}.mp4`);

  await generateVideo(`${scene.description}. ${scene.imagePrompt}`, out, {
    firstFrame: scene.firstFrame,
    lastFrame: scene.lastFrame,
    aspectRatio: '16:9',
    generateAudio: false, // la música/voz se añade en el render
  });

  scene.clip = out;
  return scene;
}

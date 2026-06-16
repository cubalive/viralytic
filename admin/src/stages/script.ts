import { geminiJson } from '../ai/gemini';
import { config } from '../config';
import type { Song, Scene } from '../types';

const SCENE_SCHEMA = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lyricLine: { type: 'string' },
          description: { type: 'string' },
          imagePrompt: { type: 'string' },
        },
        required: ['lyricLine', 'description', 'imagePrompt'],
      },
    },
  },
  required: ['scenes'],
};

type RawScene = Pick<Scene, 'lyricLine' | 'description' | 'imagePrompt'>;

/** Convierte la letra de una canción en un guion de escenas de ~8s. */
export async function lyricsToScenes(song: Song, charactersDesc: string): Promise<Scene[]> {
  const clip = config.video.clipSeconds;
  const system =
    'Eres director de videos musicales infantiles (6-14 años) para YouTube Kids. ' +
    'El contenido es 100% apto para niños: alegre, colorido, seguro, sin nada que asuste. ' +
    `Divides la letra en escenas de ${clip} segundos. Cada escena tiene: la línea de letra, ` +
    'una acción visual simple, y un prompt de imagen EN INGLÉS que SIEMPRE incluya a los ' +
    'personajes del canon y el escenario fijo, para mantener consistencia visual.';
  const prompt =
    `Personajes del canon: ${charactersDesc}\n` +
    `Escenario fijo: ${song.setting}\n` +
    `Idioma de la canción: ${song.lang}\n` +
    `Título: ${song.title}\n\n` +
    `LETRA:\n${song.lyrics}\n\n` +
    `Genera escenas en orden que cubran toda la letra, cada una de ~${clip}s.`;

  const out = await geminiJson<{ scenes: RawScene[] }>(prompt, SCENE_SCHEMA, system);
  return out.scenes.map((s, i) => ({
    ...s,
    index: i,
    startSec: i * clip,
    endSec: (i + 1) * clip,
  }));
}

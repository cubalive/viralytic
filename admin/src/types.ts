export type Lang = 'es' | 'pt' | 'it' | 'en';

export interface Character {
  id: string;            // slug, p.ej. "principal"
  name: string;
  role: 'main' | 'secondary';
  description: string;   // ADN canon: edad, pelo, ojos, ropa, colores, personalidad
  refDir: string;        // carpeta con las 3 fotos de referencia
  canonDir: string;      // imágenes canon generadas
}

export interface Scene {
  index: number;
  startSec: number;
  endSec: number;
  lyricLine: string;     // línea de letra que cubre
  description: string;   // acción visual
  imagePrompt: string;   // prompt para keyframes (incluye personajes + escenario)
  firstFrame?: string;
  lastFrame?: string;
  clip?: string;         // clip Veo crudo
  syncedClip?: string;   // clip tras lip sync
}

export interface Song {
  id: string;
  title: string;
  lang: Lang;
  audioPath: string;     // relativo a la raíz del proyecto o absoluto
  lyrics: string;
  characters: string[];  // ids de personajes
  setting: string;       // escenario fijo
  scenes: Scene[];
}

export type JobStatus =
  | 'scripted' | 'keyframed' | 'clips' | 'lipsynced'
  | 'mastered' | 'reframed' | 'done' | 'error';

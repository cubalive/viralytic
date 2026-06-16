// Genera conceptos del robot mascota "Sabi / 知宝" con Gemini.
// No necesita fotos (personaje original). Resultado en data/characters/sabi/concepts/.
import path from 'node:path';
import { geminiImage } from '../src/ai/gemini-image';
import { CHARACTERS_DIR } from '../src/config';
import { ensureDir } from '../src/lib/files';

const outDir = path.join(CHARACTERS_DIR, 'sabi', 'concepts');
await ensureDir(outDir);

const base =
  'Mascot character design for a preschool educational YouTube channel for kids aged 1-10. ' +
  'A friendly, cute little robot named Sabi. Big expressive friendly eyes, gentle smile, ' +
  'soft rounded body, simple clean design that is easy to keep consistent, very kid-friendly ' +
  'and safe, waving hello, full body, plain white background, high quality, vibrant. ';

const concepts: { id: string; prompt: string }[] = [
  { id: '01_teal_yellow', prompt: base + 'Color scheme teal and warm yellow, small antenna with a glowing dot, screen-face showing eyes, modern soft toy look.' },
  { id: '02_orange_blue', prompt: base + 'Color scheme orange and sky blue, round ball-shaped body, tiny arms, cheerful, chubby and huggable.' },
  { id: '03_owl_robot', prompt: base + 'An owl-robot hybrid (owl symbolizes wisdom/learning), soft feathers texture mixed with smooth robot panels, big round eyes like glasses, purple and mint colors.' },
  { id: '04_pastel_scholar', prompt: base + 'Pastel colors (soft green, cream), wearing a tiny cute graduation cap, holding a small glowing book or star, gentle scholarly but adorable.' },
];

for (const c of concepts) {
  const out = path.join(outDir, `concept_${c.id}.png`);
  await geminiImage(c.prompt, out, { aspectRatio: '1:1' });
  console.log(`[mascota] ${out}`);
}
console.log(`\nListo. Abre la carpeta:\n  ${outDir}`);

// gen-zuri-images.ts — genera ESCENAS nuevas de Zuri (solo IMÁGENES, cero Veo) usando TUS fotos
// como refs canon (mismo look, trío, ambiente bosque/atardecer, SIN guitarra). Para aprobar antes
// de animar. Salen a data/characters/zuri/scenes_new/ para revisar.
// Uso: tsx scripts/gen-zuri-images.ts [N=10] [offset=0]
import path from 'node:path';
import fs from 'node:fs';
import { geminiImage } from '../src/ai/gemini-image';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';

const SRC = 'E:/0005. Passkal/Canales de Youtube/@Zury/Imagenes_video_general';
const REFS = ['selfie_1.PNG', 'zuri_closeup_manos_abierta.png', 'trio_mirando_el_bosque.png', 'cam_1.PNG']
  .map((f) => path.join(SRC, f)).filter((p) => fs.existsSync(p));
const OUT = path.join(ROOT, 'data', 'characters', 'zuri', 'scenes_new'); fs.mkdirSync(OUT, { recursive: true });
const N = Number(process.argv[2] || 10);
const OFF = Number(process.argv[3] || 0);

const CANON = 'Zuri the caramel meerkat girl pop star with two pink roses on her head and a yellow crop sweater with a blue heart and gold star. Her TWO friends are ALSO caramel meerkats: friend ONE is a boy with a GREEN backwards cap, green eyes and a green outfit; friend TWO is a boy with a RED bandana around his neck, a denim/blue vest and spiky tuft hair. KEEP all three EXACTLY like the reference images (all meerkats, same faces and outfits), NO guitar, no instruments, no new objects';
const STYLE = 'BRIGHT cheerful magical forest in clear luminous daylight, VIVID saturated colorful palette, lush green, lots of colorful flowers, sparkly fireflies and floating neon music notes, everything bright and clear (NOT dark, NOT moody), high-key lighting, Pixar-quality 3D render, cinematic, 16:9';

const SCENES = [
  'the trio walking along a glowing forest path toward the sunset, seen from behind, wide shot',
  'the trio dancing joyfully in a forest clearing surrounded by fireflies, medium shot',
  'Zuri singing happily with her two friends behind her, wide shot on a natural stage',
  'the trio standing by a glowing waterfall with soft rainbow mist, wide shot',
  'the trio crossing a glowing wooden bridge over a forest stream, side view',
  'Zuri twirling with joy while her two friends clap, medium shot',
  'the trio sitting on a big glowing mushroom looking up at the starry sky, wide shot',
  'the trio gathered around a cozy magical campfire at night in the forest, medium shot',
  'Zuri reaching tenderly toward floating fireflies, her friends beside her, medium shot',
  'the trio on a hilltop overlooking the glowing valley at sunset, seen from behind, wide shot',
  'the trio running happily down a flower-lined forest path, side view',
  'Zuri waving with a big smile, friends jumping behind, wide shot under lanterns',
];

let made = 0;
for (let k = 0; k < N; k++) {
  const sc = SCENES[(OFF + k) % SCENES.length];
  const out = path.join(OUT, `escena_${String(OFF + k + 1).padStart(2, '0')}.png`);
  if (fs.existsSync(out) && fs.statSync(out).size > 10000) { log.ok(`(ya existe) ${path.basename(out)}`); made++; continue; }
  try {
    log.step(`${OFF + k + 1}: ${sc.slice(0, 50)}…`);
    await geminiImage(`${CANON}. SCENE: ${sc}. ${STYLE}.`, out, { aspectRatio: '16:9', refImagePaths: REFS });
    made++; log.ok(`✅ ${path.basename(out)}`);
  } catch (e) { log.err(`escena ${OFF + k + 1}: ${(e as Error).message.slice(0, 100)}`); }
}
console.log(`\n✅ ${made}/${N} imágenes en data/characters/zuri/scenes_new/ — revísalas y aprueba`);

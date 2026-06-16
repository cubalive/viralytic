// Puebla el BANCO de videos de maternidad (faceless, 9:16, ≤8s) clasificados para reutilizar.
// Cada categoría = N clips. Reanudable: salta lo ya hecho. Uso: tsx scripts/gen-mom-bank.ts [perCat] [maxClips]
import path from 'node:path';
import fs from 'node:fs';
import { geminiImage } from '../src/ai/gemini-image';
import { generateVideo } from '../src/ai/veo';
import { addClip, countByCategory, clipsDir, loadBank } from '../src/bank/videobank';
import { log } from '../src/lib/log';

const THEME = 'mom';
const PER_CAT = Number(process.argv[2] || 2);
const MAX = Number(process.argv[3] || 999); // tope de clips NUEVOS por corrida (control de gasto Veo)

// Categorías FACELESS de maternidad (sin rostros identificables: manos, detalles, siluetas, de espaldas).
const CATEGORIES: { cat: string; tags: string[]; prompt: string }[] = [
  { cat: 'newborn-hands', tags: ['newborn', 'baby', 'tender', 'bond'], prompt: 'extreme close-up of a newborn baby tiny hand wrapped around a mother finger, soft warm natural light, shallow depth of field' },
  { cat: 'feeding-night', tags: ['feeding', 'night', 'tired', 'cozy'], prompt: 'silhouette of a mother feeding her baby at night beside a dim warm lamp, seen from behind, cozy intimate room' },
  { cat: 'rocking-sleep', tags: ['bedtime', 'tired', 'tender'], prompt: 'a mother gently rocking a baby to sleep, view over the shoulder, warm dim nursery, soft motion' },
  { cat: 'tiny-feet', tags: ['baby', 'tender', 'detail'], prompt: 'close-up of tiny baby feet in soft blanket held by mother hands, morning light, faceless' },
  { cat: 'tired-coffee', tags: ['tired', 'exhausted', 'morning', 'selfcare'], prompt: 'a mother hands holding a coffee mug in a messy kitchen at dawn, exhausted mood, faceless, cinematic' },
  { cat: 'toddler-play', tags: ['toddler', 'playing', 'joy'], prompt: 'a mother hands building blocks on the floor with a toddler, sunlit living room, faceless from above' },
  { cat: 'stroller-walk', tags: ['walk', 'outdoor', 'calm'], prompt: 'hands pushing a baby stroller along a tree-lined path at golden hour, seen from behind, faceless' },
  { cat: 'pregnant-belly', tags: ['pregnancy', 'expecting', 'tender'], prompt: 'a pregnant woman hands cradling her belly by a window with soft light, faceless, warm tones' },
  { cat: 'laundry-chaos', tags: ['chores', 'overwhelmed', 'home'], prompt: 'a pile of baby laundry and toys in a sunlit home, mother hands folding tiny clothes, faceless, candid' },
  { cat: 'first-steps', tags: ['toddler', 'milestone', 'joy'], prompt: 'a toddler taking first steps toward open mother arms, low angle, faceless, warm backlight' },
  { cat: 'hug-comfort', tags: ['hug', 'tender', 'bond', 'love'], prompt: 'a mother holding and comforting her child in a warm embrace, seen from behind, soft light, faceless' },
  { cat: 'window-quiet', tags: ['selfcare', 'calm', 'reflection'], prompt: 'a mother silhouette standing quietly by a rainy window holding a warm cup, reflective mood, faceless' },
];

const cdir = clipsDir(THEME);
fs.mkdirSync(cdir, { recursive: true });

let made = 0;
outer:
for (const { cat, tags, prompt } of CATEGORIES) {
  for (let i = countByCategory(THEME, cat); i < PER_CAT; i++) {
    if (made >= MAX) { log.warn(`Tope de ${MAX} clips nuevos alcanzado — paro (reanudable).`); break outer; }
    const id = `${cat}_${i}`;
    const clipFile = path.join(cdir, `${id}.mp4`);
    if (fs.existsSync(clipFile) && fs.statSync(clipFile).size > 10000) {
      addClip(THEME, { id, file: clipFile, category: cat, tags, durationS: 8, prompt });
      continue;
    }
    try {
      const img = path.join(cdir, `${id}.png`);
      await geminiImage(`${prompt}, vertical 9:16, ultra realistic cinematic photography, high quality, no text`, img, { aspectRatio: '9:16' });
      await generateVideo(`${prompt}, subtle natural motion, gentle camera movement`, clipFile, { firstFrame: img, aspectRatio: '9:16', durationSeconds: 8, generateAudio: false });
      addClip(THEME, { id, file: clipFile, category: cat, tags, durationS: 8, prompt });
      made++;
      log.ok(`banco: ${id} (${made} nuevos)`);
    } catch (e) { log.err(`${id}: ${(e as Error).message.slice(0, 100)}`); }
  }
}
console.log(`\n✅ Banco '${THEME}': +${made} clips nuevos. Total catalogado: ${loadBank(THEME).length}.`);

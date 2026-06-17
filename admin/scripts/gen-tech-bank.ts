// Puebla el BANCO de b-roll de TECNOLOGÍA/FUTURO (Signal From The Future, faceless,
// cinematográfico, 9:16, ≤8s) clasificado. Reanudable.
// Uso: tsx scripts/gen-tech-bank.ts [perCat] [maxClips]
import path from 'node:path';
import fs from 'node:fs';
import { geminiImage } from '../src/ai/gemini-image';
import { generateVideo } from '../src/ai/veo';
import { addClip, countByCategory, clipsDir, loadBank } from '../src/bank/videobank';
import { log } from '../src/lib/log';

const THEME = 'tech';
const PER_CAT = Number(process.argv[2] || 2);
const MAX = Number(process.argv[3] || 999);

const CATEGORIES: { cat: string; tags: string[]; prompt: string }[] = [
  { cat: 'neon-future-city', tags: ['future', 'city', 'tech'], prompt: 'a futuristic neon city skyline at night with holograms and flying lights, cinematic aerial, no people' },
  { cat: 'stock-charts', tags: ['markets', 'investing', 'data'], prompt: 'glowing green and red stock market charts and financial data on dark trading screens, cinematic, depth' },
  { cat: 'ai-robot', tags: ['ai', 'robot', 'future'], prompt: 'a humanoid AI robot head lit by blue light slowly turning, cinematic, highly detailed, dark background' },
  { cat: 'data-center', tags: ['data', 'servers', 'tech'], prompt: 'a vast data center server room with rows of glowing blue lights, slow dolly, cinematic, no people' },
  { cat: 'holo-interface', tags: ['ui', 'future', 'tech'], prompt: 'hands interacting with a transparent floating holographic interface, glowing data, cinematic, faceless' },
  { cat: 'microchip-macro', tags: ['chip', 'hardware', 'ai'], prompt: 'extreme macro of a glowing microchip with electric circuits pulsing, cinematic, shallow focus' },
  { cat: 'rocket-launch', tags: ['space', 'innovation', 'future'], prompt: 'a rocket launching at dawn leaving a bright trail of fire and smoke, epic, cinematic, no people' },
  { cat: 'news-studio', tags: ['news', 'media', 'society'], prompt: 'a sleek modern breaking-news studio with glowing world-map screens, cinematic, no people' },
  { cat: 'phone-ui', tags: ['mobile', 'tech', 'ui'], prompt: 'a hand holding a smartphone with a glowing futuristic interface, dark moody background, cinematic' },
  { cat: 'self-driving-car', tags: ['ev', 'future', 'tech'], prompt: 'an electric self-driving car gliding on a neon-lit city street at night, reflections, cinematic, no people' },
  { cat: 'digital-network', tags: ['network', 'data', 'ai'], prompt: 'an abstract glowing 3D network of nodes and data connections forming and pulsing, cinematic, dark' },
  { cat: 'trader-monitors', tags: ['markets', 'finance', 'data'], prompt: 'a silhouette watching a wall of monitors with rising green charts in a dark room, cinematic, faceless' },
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
    if (fs.existsSync(clipFile) && fs.statSync(clipFile).size > 10000) { addClip(THEME, { id, file: clipFile, category: cat, tags, durationS: 8, prompt }); continue; }
    try {
      const img = path.join(cdir, `${id}.png`);
      await geminiImage(`${prompt}, vertical 9:16, ultra realistic cinematic photography, premium high-end mood, highly detailed, no text`, img, { aspectRatio: '9:16' });
      await generateVideo(`${prompt}, subtle cinematic camera motion`, clipFile, { firstFrame: img, aspectRatio: '9:16', durationSeconds: 8, generateAudio: false });
      addClip(THEME, { id, file: clipFile, category: cat, tags, durationS: 8, prompt });
      made++; log.ok(`banco: ${id} (${made} nuevos)`);
    } catch (e) { log.err(`${id}: ${(e as Error).message.slice(0, 100)}`); }
  }
}
console.log(`\n✅ Banco '${THEME}': +${made} clips nuevos. Total catalogado: ${loadBank(THEME).length}.`);

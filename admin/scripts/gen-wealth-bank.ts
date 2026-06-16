// Puebla el BANCO de b-roll de RIQUEZA (faceless, cinematográfico, 9:16, ≤8s) clasificado.
// Reanudable. Uso: tsx scripts/gen-wealth-bank.ts [perCat] [maxClips]
import path from 'node:path';
import fs from 'node:fs';
import { geminiImage } from '../src/ai/gemini-image';
import { generateVideo } from '../src/ai/veo';
import { addClip, countByCategory, clipsDir, loadBank } from '../src/bank/videobank';
import { log } from '../src/lib/log';

const THEME = 'wealth';
const PER_CAT = Number(process.argv[2] || 2);
const MAX = Number(process.argv[3] || 999);

const CATEGORIES: { cat: string; tags: string[]; prompt: string }[] = [
  { cat: 'skyline-night', tags: ['city', 'success', 'ambition'], prompt: 'a glowing modern city skyline at night, financial district skyscrapers, cinematic aerial' },
  { cat: 'luxury-car', tags: ['luxury', 'success', 'car'], prompt: 'a sleek luxury sports car on a wet city street at dusk, reflections, cinematic, no people' },
  { cat: 'luxury-watch', tags: ['luxury', 'time', 'detail'], prompt: 'extreme close-up of an elegant luxury watch on a wrist with a suit cuff, cinematic, shallow focus' },
  { cat: 'cash-gold', tags: ['money', 'wealth'], prompt: 'neat stacks of cash and gold coins on a dark marble table, dramatic rim light, cinematic' },
  { cat: 'laptop-night', tags: ['work', 'hustle', 'focus'], prompt: 'hands typing on a laptop at night with city light bokeh through a window, faceless, focused mood' },
  { cat: 'private-jet', tags: ['luxury', 'freedom', 'travel'], prompt: 'a private jet on a runway at golden hour, stairs down, cinematic, no people' },
  { cat: 'stock-charts', tags: ['investing', 'markets', 'data'], prompt: 'glowing green stock market charts and financial data on dark screens, cinematic, depth' },
  { cat: 'business-handshake', tags: ['business', 'deal'], prompt: 'a confident business handshake in a modern glass office with city view, faceless, cinematic' },
  { cat: 'rooftop-sunrise', tags: ['ambition', 'success', 'mindset'], prompt: 'a lone silhouette standing on a rooftop overlooking a vast city at sunrise, aspirational, cinematic' },
  { cat: 'modern-office', tags: ['business', 'luxury', 'work'], prompt: 'a sleek modern luxury office interior with floor-to-ceiling city view, cinematic, no people' },
  { cat: 'goals-notebook', tags: ['planning', 'discipline', 'focus'], prompt: 'hands writing goals in a notebook beside black coffee and a laptop, morning light, faceless' },
  { cat: 'mansion-pool', tags: ['luxury', 'freedom', 'lifestyle'], prompt: 'a luxury modern mansion with a glowing infinity pool at dusk, cinematic, no people' },
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

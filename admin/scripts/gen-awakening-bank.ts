// Puebla el BANCO de b-roll de AWAKENING/Katharsis (faceless, cinematográfico,
// 9:16, ≤8s) clasificado. Reanudable. Mismo modelo que gen-wealth-bank.ts.
// Uso: tsx scripts/gen-awakening-bank.ts [perCat] [maxClips]
import path from 'node:path';
import fs from 'node:fs';
import { geminiImage } from '../src/ai/gemini-image';
import { generateVideo } from '../src/ai/veo';
import { addClip, countByCategory, clipsDir, loadBank } from '../src/bank/videobank';
import { log } from '../src/lib/log';

const THEME = 'awakening';
const PER_CAT = Number(process.argv[2] || 2);
const MAX = Number(process.argv[3] || 999);

const CATEGORIES: { cat: string; tags: string[]; prompt: string }[] = [
  { cat: 'lone-silhouette-sunrise', tags: ['awakening', 'hope', 'solitude'], prompt: 'a lone silhouette standing on a hill facing a vast sunrise, mist, vast sky, aspirational and awakening mood, cinematic' },
  { cat: 'misty-forest-path', tags: ['journey', 'unknown', 'nature'], prompt: 'an empty misty forest path at dawn, soft god rays through tall trees, mysterious and contemplative, cinematic, no people' },
  { cat: 'ocean-horizon-dawn', tags: ['vastness', 'calm', 'rebirth'], prompt: 'calm endless ocean meeting a glowing horizon at dawn, gentle waves, serene and infinite, cinematic, no people' },
  { cat: 'mountain-peak-clouds', tags: ['ambition', 'clarity', 'heights'], prompt: 'a mountain peak above a sea of clouds at golden hour, epic scale, clarity and achievement, cinematic, no people' },
  { cat: 'empty-road-vanishing', tags: ['path', 'decision', 'future'], prompt: 'a long empty road vanishing into the horizon at dusk, dramatic sky, the journey ahead, cinematic, no people' },
  { cat: 'candle-darkness', tags: ['inner-light', 'hope', 'focus'], prompt: 'a single candle flame glowing in deep darkness, intimate and symbolic of inner light, cinematic macro, no people' },
  { cat: 'rain-window-reflection', tags: ['introspection', 'melancholy'], prompt: 'raindrops streaming down a window with soft city bokeh behind, introspective and quiet, cinematic, no people' },
  { cat: 'starry-night-sky', tags: ['vastness', 'wonder', 'cosmos'], prompt: 'a vast starry night sky and milky way over a dark silent landscape, awe and insignificance, cinematic timelapse feel, no people' },
  { cat: 'desert-vastness', tags: ['solitude', 'journey', 'silence'], prompt: 'endless desert dunes under a dramatic sky at sunrise, profound solitude and silence, cinematic, no people' },
  { cat: 'single-tree-field', tags: ['resilience', 'growth', 'stillness'], prompt: 'a single resilient tree standing alone in a vast empty field under dramatic light, stillness and strength, cinematic, no people' },
  { cat: 'shattered-light-rebirth', tags: ['rebirth', 'breakthrough'], prompt: 'light breaking through dark storm clouds onto a calm landscape, a breakthrough after the storm, hopeful and powerful, cinematic, no people' },
  { cat: 'open-door-light', tags: ['opportunity', 'change', 'threshold'], prompt: 'a single open door in darkness with warm light pouring through, symbolic threshold of change, cinematic, no people' },
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
      await geminiImage(`${prompt}, vertical 9:16, ultra realistic cinematic photography, dramatic light, awakening and inspiring mood, highly detailed, no text`, img, { aspectRatio: '9:16' });
      await generateVideo(`${prompt}, subtle cinematic camera motion`, clipFile, { firstFrame: img, aspectRatio: '9:16', durationSeconds: 8, generateAudio: false });
      addClip(THEME, { id, file: clipFile, category: cat, tags, durationS: 8, prompt });
      made++; log.ok(`banco: ${id} (${made} nuevos)`);
    } catch (e) { log.err(`${id}: ${(e as Error).message.slice(0, 100)}`); }
  }
}
console.log(`\n✅ Banco '${THEME}': +${made} clips nuevos. Total catalogado: ${loadBank(THEME).length}.`);

// Agrega efectos de sonido a los temas que aún no los tienen (reusa el video de Veo + voz).
import path from 'node:path';
import fsp from 'node:fs/promises';
import { produceAllLangs, reelDir } from '../src/edu/produce-edu-veo';
import { uploadPublic } from '../src/lib/storage';
import { readJson, exists } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';
import type { SeleccionEdu } from '../src/formats/types';

const TOPICS = [
  { t: 'Los animales de la granja', m: 'esperanzador' },
  { t: 'Los colores', m: 'retencion-tiktok' },
  { t: 'Los números del 1 al 10', m: 'calmado' },
  { t: 'Los animales de la selva', m: 'exotico-premium' },
  { t: 'Las frutas', m: 'calido-folk' },
  { t: 'Las formas', m: 'calmado' },
  { t: 'Los vehículos', m: 'retencion-tiktok' },
  { t: 'Los animales del mar', m: 'ensueno' },
  { t: 'Las emociones', m: 'emotivo' },
  { t: 'Los sonidos de los animales', m: 'retencion-tiktok' },
];
const LANGS = ['es', 'en', 'it', 'zh'];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

for (const { t, m } of TOPICS) {
  const slug = slugify(t);
  const sel = await readJson<SeleccionEdu>(path.join(OUTPUT_DIR, 'briefs', `eduveo_${slug}.json`), null as any);
  if (!sel) { log.err(`Sin brief para ${t}`); continue; }
  const dir = reelDir(t, sel.slug);

  if (exists(path.join(dir, 'sfx.json'))) { log.info(`${t}: ya tiene SFX, salto`); continue; }

  // borrar reels + audio para forzar re-render con SFX (el motion de Veo se conserva)
  for (const l of LANGS) {
    for (const f of [`reel_${l}.mp4`, `audio_${l}.mp3`]) {
      await fsp.rm(path.join(dir, f), { force: true }).catch(() => {});
    }
  }
  log.step(`${t} (agregando SFX)`);
  const reels = await produceAllLangs(sel, { topic: t, mood: m, langs: LANGS });
  for (const l of LANGS) {
    const url = await uploadPublic(reels[l], `kids-studio/batch/${slug}_${l}.mp4`, 'video/mp4');
    log.ok(`${l}: ${url}`);
  }
}
console.log('\nSFX DONE');

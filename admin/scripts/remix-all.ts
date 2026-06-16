// Re-mezcla TODOS los reels (efectos más bajos) sin regenerar Veo ni voz. Re-sube a Supabase.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { renderLang, reelDir } from '../src/edu/produce-edu-veo';
import { uploadPublic } from '../src/lib/storage';
import { readJson, exists } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';
import type { SeleccionEdu } from '../src/formats/types';

const TOPICS = [
  ['Los animales de la granja', 'esperanzador'], ['Los colores', 'retencion-tiktok'], ['Los números del 1 al 10', 'calmado'],
  ['Los animales de la selva', 'exotico-premium'], ['Las frutas', 'calido-folk'], ['Las formas', 'calmado'],
  ['Los vehículos', 'retencion-tiktok'], ['Los animales del mar', 'ensueno'], ['Las emociones', 'emotivo'],
  ['Los sonidos de los animales', 'retencion-tiktok'], ['El abecedario', 'calmado'], ['Las mascotas', 'esperanzador'],
  ['El cuerpo humano', 'calmado'], ['La ropa', 'calido-folk'], ['Las profesiones', 'esperanzador'],
  ['El clima y las estaciones', 'ensueno'], ['Los insectos', 'calido-folk'], ['El espacio y los planetas', 'ensueno'],
  ['Los instrumentos musicales', 'retencion-tiktok'], ['Los opuestos', 'calmado'],
];
const LANGS = ['es', 'en', 'it', 'zh'];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

let n = 0;
for (const [t, mood] of TOPICS) {
  const slug = slugify(t);
  const sel = await readJson<SeleccionEdu>(path.join(OUTPUT_DIR, 'briefs', `eduveo_${slug}.json`), null as any);
  if (!sel) { log.warn(`sin brief: ${t}`); continue; }
  const dir = reelDir(t, sel.slug);
  const motion = path.join(dir, 'motion.mp4');
  if (!exists(motion)) { log.warn(`sin motion: ${t}`); continue; }
  log.step(t);
  for (const l of LANGS) {
    await fsp.rm(path.join(dir, `reel_${l}.mp4`), { force: true }).catch(() => {});
    await fsp.rm(path.join(dir, `audio_${l}.mp3`), { force: true }).catch(() => {});
    const reel = await renderLang(motion, sel, dir, l, mood);
    await uploadPublic(reel, `kids-studio/batch/${slug}_${l}.mp4`, 'video/mp4');
    n++;
  }
  log.ok(`${t}: 4 idiomas re-mezclados`);
}
console.log(`\n✅ ${n} reels re-mezclados (efectos a 0.3) y re-subidos.`);

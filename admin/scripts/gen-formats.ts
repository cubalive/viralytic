// Variedad de FORMATOS: produce cada tema en varios formatos distintos (cada uno su Veo).
// Uso: tsx scripts/gen-formats.ts [N]   (N = formatos por tema, default 3)
import path from 'node:path';
import { selectEduFormats } from '../src/formats/selector';
import { produceAllLangs } from '../src/edu/produce-edu-veo';
import { uploadPublic } from '../src/lib/storage';
import { readJson, writeJson, exists } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';
import type { EduResult } from '../src/formats/types';

const N = Number(process.argv[2] || 3);
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

let made = 0;
for (const [t, mood] of TOPICS) {
  const slug = slugify(t);
  const selFile = path.join(OUTPUT_DIR, 'briefs', `seleccion_${slug}.json`);
  let res = await readJson<EduResult>(selFile, null as any);
  if (!res) { try { res = await selectEduFormats(t); await writeJson(selFile, res); } catch (e) { log.warn(`selector "${t}": ${(e as Error).message.slice(0, 50)}`); continue; } }

  const formats = (res.seleccion || []).slice(0, N);
  for (const sel of formats) {
    log.step(`${t} — formato ${sel.slug}`);
    try {
      const reels = await produceAllLangs(sel as any, { topic: t, mood, langs: LANGS });
      for (const l of LANGS) {
        await uploadPublic(reels[l], `kids-studio/batch/${slug}__${sel.slug}_${l}.mp4`, 'video/mp4');
        made++;
      }
    } catch (e) { log.err(`${slug}/${sel.slug}: ${(e as Error).message.slice(0, 120)}`); }
  }
}
console.log(`\n✅ ${made} reels generados en formatos variados.`);

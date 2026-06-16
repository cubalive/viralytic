// Lote: 10 temas × 4 idiomas (ES/EN/IT/ZH). Reusa el motion de Veo por tema.
// Reanudable: salta lo ya hecho. Sube cada reel a Supabase e imprime el link.
import path from 'node:path';
import { selectEduFormats } from '../src/formats/selector';
import { produceAllLangs } from '../src/edu/produce-edu-veo';
import { uploadPublic } from '../src/lib/storage';
import { readJson, writeJson, exists } from '../src/lib/files';
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

const links: string[] = [];
let done = 0;
for (const { t, m } of TOPICS) {
  const slug = slugify(t);
  const bf = path.join(OUTPUT_DIR, 'briefs', `eduveo_${slug}.json`);
  let sel: SeleccionEdu;
  if (exists(bf)) sel = await readJson<SeleccionEdu>(bf, null as any);
  else {
    const r = await selectEduFormats(t);
    sel = r.seleccion.find((s) => ['con_objetos', 'personaje_narrador', 'quiz_adivinanza'].includes(s.slug)) ?? r.seleccion[0];
    await writeJson(bf, sel);
  }
  log.step(`TEMA ${++done}/${TOPICS.length}: ${t} (${sel.slug})`);
  try {
    const reels = await produceAllLangs(sel, { topic: t, mood: m, langs: LANGS });
    for (const l of LANGS) {
      const url = await uploadPublic(reels[l], `kids-studio/batch/${slug}_${l}.mp4`, 'video/mp4');
      links.push(url);
      log.ok(`${t} [${l}] → ${url}`);
    }
  } catch (e) {
    log.err(`Tema "${t}" falló: ${(e as Error).message.slice(0, 120)} — sigo con el siguiente`);
  }
}

console.log('\n=== BATCH COMPLETO (40 reels) ===');
links.forEach((u) => console.log(u));

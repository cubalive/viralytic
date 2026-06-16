// Lote #2: otros 10 temas × 4 idiomas (ES/EN/IT/ZH). Reanudable. Sube cada reel a Supabase.
import path from 'node:path';
import { selectEduFormats } from '../src/formats/selector';
import { produceAllLangs } from '../src/edu/produce-edu-veo';
import { uploadPublic } from '../src/lib/storage';
import { readJson, writeJson, exists } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';
import type { SeleccionEdu } from '../src/formats/types';

const TOPICS = [
  { t: 'El abecedario', m: 'calmado' },
  { t: 'Las mascotas', m: 'esperanzador' },
  { t: 'El cuerpo humano', m: 'calmado' },
  { t: 'La ropa', m: 'calido-folk' },
  { t: 'Las profesiones', m: 'esperanzador' },
  { t: 'El clima y las estaciones', m: 'ensueno' },
  { t: 'Los insectos', m: 'calido-folk' },
  { t: 'El espacio y los planetas', m: 'ensueno' },
  { t: 'Los instrumentos musicales', m: 'retencion-tiktok' },
  { t: 'Los opuestos', m: 'calmado' },
];
const LANGS = ['es', 'en', 'it', 'zh'];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

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
      log.ok(`${t} [${l}] → ${url}`);
    }
  } catch (e) {
    log.err(`Tema "${t}" falló: ${(e as Error).message.slice(0, 120)} — sigo`);
  }
}
console.log('\n=== LOTE #2 COMPLETO ===');

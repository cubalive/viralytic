// Reel de CALIDAD con Veo (escenas encadenadas + captions + voz Liam).
// Uso: tsx scripts/first-reel-veo.ts "<tema>" [mood] [lang]
import path from 'node:path';
import { selectEduFormats } from '../src/formats/selector';
import { produceEduReelVeo } from '../src/edu/produce-edu-veo';
import { readJson, writeJson, exists } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import type { SeleccionEdu } from '../src/formats/types';

const TEMA = process.argv[2] || 'Los animales de la granja';
const MOOD = process.argv[3] || 'esperanzador';
const LANG = process.argv[4] || 'es';

// Determinista: guarda el formato/guion por tema y lo reutiliza (no regenera Veo al iterar).
const slug = TEMA.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const briefFile = path.join(OUTPUT_DIR, 'briefs', `eduveo_${slug}.json`);

let sel: SeleccionEdu;
if (exists(briefFile)) {
  sel = await readJson<SeleccionEdu>(briefFile, null as any);
  console.log(`(reusando guion guardado: ${sel.slug})`);
} else {
  const res = await selectEduFormats(TEMA);
  sel = res.seleccion.find((s) => ['con_objetos', 'personaje_narrador', 'quiz_adivinanza'].includes(s.slug)) ?? res.seleccion[0];
  await writeJson(briefFile, sel);
}

console.log(`Tema: ${TEMA} · Formato: ${sel.slug} · ${sel.brief.guion_por_beat.length} beats → 3 escenas Veo`);
const reel = await produceEduReelVeo(sel, { topic: TEMA, lang: LANG, mood: MOOD, maxScenes: 3 });
console.log('\n=== REEL VEO ===\n' + reel);

// Lote SabiKids 16:9 NATIVO: 20 temas × 4 idiomas (ES/EN/IT/ZH), reusando el
// motion por tema (Veo una sola vez, voz traducida por idioma). Resumible (salta
// lo ya hecho). Corre SIEMPRE con EDU_ASPECT=16:9.
//   EDU_ASPECT=16:9 tsx scripts/gen-sabikids-16x9.ts [N=20]
import path from 'node:path';
import { selectEduFormats } from '../src/formats/selector';
import { produceAllLangs } from '../src/edu/produce-edu-veo';
import { readJson, writeJson, exists } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';
import type { SeleccionEdu } from '../src/formats/types';

if (process.env.EDU_ASPECT !== '16:9') { console.error('Corre con EDU_ASPECT=16:9'); process.exit(1); }

const TOPICS = [
  'Los animales de la granja', 'Los colores', 'Los números del 1 al 10', 'Las frutas',
  'Las formas', 'Los animales del mar', 'Los animales de la selva', 'Las emociones',
  'El abecedario', 'Los vehículos', 'Las profesiones', 'El cuerpo humano',
  'Los opuestos', 'Los sonidos de los animales', 'Las verduras', 'Los insectos',
  'La ropa', 'El espacio y los planetas', 'Los instrumentos musicales', 'Los días de la semana',
];
const N = Number(process.argv[2] || 20);
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

let made = 0;
for (const tema of TOPICS.slice(0, N)) {
  try {
    const briefFile = path.join(OUTPUT_DIR, 'briefs', `eduveo_${slugify(tema)}.json`);
    let sel: SeleccionEdu;
    if (exists(briefFile)) sel = await readJson<SeleccionEdu>(briefFile, null as any);
    else {
      const res = await selectEduFormats(tema);
      sel = res.seleccion.find((s) => ['con_objetos', 'personaje_narrador', 'quiz_adivinanza'].includes(s.slug)) ?? res.seleccion[0];
      await writeJson(briefFile, sel);
    }
    const out = await produceAllLangs(sel, { topic: tema, langs: ['es', 'en', 'it', 'zh'] });
    made++;
    log.ok(`(${made}/${Math.min(N, TOPICS.length)}) ${tema} → ${Object.keys(out).join('/')}`);
  } catch (e) {
    log.err(`${tema}: ${(e as Error).message.slice(0, 100)}`);
  }
}
console.log(`\n✅ SabiKids 16:9: ${made}/${Math.min(N, TOPICS.length)} temas en 4 idiomas (${made * 4} videos).`);

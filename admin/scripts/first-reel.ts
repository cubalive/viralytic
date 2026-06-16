// Primer reel educativo de prueba (camino económico, sin Veo).
import path from 'node:path';
import { selectEduFormats } from '../src/formats/selector';
import { produceEduReel } from '../src/edu/produce-edu';
import { readJson, exists } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import type { EduResult } from '../src/formats/types';

const TEMA = 'qué es un bucle / loop en programación';

// Reutiliza el brief ya generado (determinista y barato); si no existe, lo crea.
const briefPath = path.join(OUTPUT_DIR, 'briefs', 'edu_qu-es-un-bucle-loop-en-programaci-n.json');
const res: EduResult = exists(briefPath)
  ? await readJson<EduResult>(briefPath, null as any)
  : await selectEduFormats(TEMA);
const sel = res.seleccion.find((s) => s.slug === 'con_objetos') ?? res.seleccion[0];
console.log(`Formato elegido: ${sel.slug} · ${sel.brief.guion_por_beat.length} beats`);

const reel = await produceEduReel(sel, { topic: TEMA, lang: 'es', mood: 'esperanzador' });
console.log('\n=== REEL ===\n' + reel);

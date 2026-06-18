// Remix SabiKids: reusa el MOTION (visuales Veo de Sabi) de un tema YA hecho y le
// pone un guion + voz + captions NUEVOS de un tema RELACIONADO → Short nuevo.
// CERO Veo (lo caro se reusa; solo cambia script LLM + voz ElevenLabs + captions).
// Uso: tsx scripts/gen-sabikids-remix.ts "<tema nuevo>" "<tema base existente>" [lang=es]
import path from 'node:path';
import fs from 'node:fs';
import { selectEduFormats } from '../src/formats/selector';
import { renderLang } from '../src/edu/produce-edu-veo';
import { readJson, writeJson, exists, ensureDir } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';
import type { SeleccionEdu } from '../src/formats/types';

const newTopic = process.argv[2];
const baseTopic = process.argv[3];
const lang = process.argv[4] || 'es';
if (!newTopic || !baseTopic) throw new Error('Uso: tsx scripts/gen-sabikids-remix.ts "<tema nuevo>" "<tema base existente>" [lang]');

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** Busca el motion.mp4 de un tema base (prefiere 16:9, si no 9:16). */
function findMotion(slug: string): string | null {
  for (const base of ['edu-veo-16x9', 'edu-veo']) {
    const root = path.join(OUTPUT_DIR, 'reels', base);
    if (!fs.existsSync(root)) continue;
    const d = fs.readdirSync(root).find((x) => x.startsWith(`${slug}__`) && exists(path.join(root, x, 'motion.mp4')));
    if (d) return path.join(root, d, 'motion.mp4');
  }
  return null;
}

const motion = findMotion(slugify(baseTopic));
if (!motion) throw new Error(`no encontré motion del tema base "${baseTopic}" (genera ese tema primero)`);
log.ok(`motion base reusado: ${motion}`);

// Guion del tema NUEVO (reusa brief guardado o lo genera)
const briefFile = path.join(OUTPUT_DIR, 'briefs', `eduveo_${slugify(newTopic)}.json`);
let sel: SeleccionEdu;
if (exists(briefFile)) sel = await readJson<SeleccionEdu>(briefFile, null as any);
else {
  const res = await selectEduFormats(newTopic);
  sel = res.seleccion.find((s) => ['con_objetos', 'personaje_narrador', 'quiz_adivinanza'].includes(s.slug)) ?? res.seleccion[0];
  await writeJson(briefFile, sel);
}

// Render: visuales base + voz/captions/guion del tema nuevo → Short remix
const remixDir = path.join(OUTPUT_DIR, 'reels', 'edu-veo-remix', `${slugify(newTopic)}__from-${slugify(baseTopic)}`);
await ensureDir(remixDir);
const reel = await renderLang(motion, sel, remixDir, lang, 'esperanzador');
console.log(`\n✅ Remix "${newTopic}" (visuales de "${baseTopic}") → ${reel}`);

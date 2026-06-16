// Variantes: reusa el video de Veo y genera K guiones distintos por tema → más reels eficientes.
// Uso: tsx scripts/gen-variants.ts [K]   (default 3)
import path from 'node:path';
import { renderLang, reelDir } from '../src/edu/produce-edu-veo';
import { generateVariants } from '../src/edu/variant';
import { uploadPublic } from '../src/lib/storage';
import { readJson, writeJson, exists } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';
import type { SeleccionEdu } from '../src/formats/types';

const K = Number(process.argv[2] || 3);
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
  const sel = await readJson<SeleccionEdu>(path.join(OUTPUT_DIR, 'briefs', `eduveo_${slug}.json`), null as any);
  if (!sel) { log.warn(`sin brief: ${t}`); continue; }
  const dir = reelDir(t, sel.slug);
  const motion = path.join(dir, 'motion.mp4');
  if (!exists(motion)) { log.warn(`sin motion: ${t}`); continue; }

  // Genera (o reusa) los guiones variantes una vez por tema.
  const vfile = path.join(dir, 'variants.json');
  let variants = await readJson<{ titulo: string; voz: string }[]>(vfile, []);
  if (variants.length < K) {
    try {
      const extra = await generateVariants(t, sel, K - variants.length, variants.map((v) => v.voz));
      variants = [...variants, ...extra];
      await writeJson(vfile, variants);
    } catch (e) { log.warn(`variantes de "${t}" fallaron: ${(e as Error).message.slice(0, 60)}`); continue; }
  }

  log.step(`${t} — ${variants.length} variantes`);
  for (let i = 0; i < variants.length; i++) {
    const suffix = `_v${i + 1}`;
    for (const lang of LANGS) {
      try {
        const reel = await renderLang(motion, sel, dir, lang, mood, { vozEs: variants[i].voz, suffix });
        await uploadPublic(reel, `kids-studio/batch/${slug}_${lang}${suffix}.mp4`, 'video/mp4');
        made++;
      } catch (e) {
        log.err(`${slug}${suffix}/${lang}: ${(e as Error).message.slice(0, 100)}`);
      }
    }
    log.ok(`${t} ${suffix}: 4 idiomas`);
  }
}
console.log(`\n✅ ${made} reels variantes generados y subidos.`);

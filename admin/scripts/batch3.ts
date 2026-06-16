// Lote 3: TEMAS NUEVOS para SabiKids (base + 2 variantes × 4 idiomas). Reusa motion de Veo.
// Reanudable: salta lo ya hecho. Uso: tsx scripts/batch3.ts [K]   (K variantes extra, default 2)
import path from 'node:path';
import { selectEduFormats } from '../src/formats/selector';
import { produceAllLangs, renderLang, reelDir } from '../src/edu/produce-edu-veo';
import { generateVariants } from '../src/edu/variant';
import { uploadPublic } from '../src/lib/storage';
import { readJson, writeJson, exists } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';
import type { SeleccionEdu } from '../src/formats/types';

const K = Number(process.argv[2] || 2);
const NEW_TOPICS = [
  { t: 'Los días de la semana', m: 'calmado' },
  { t: 'La familia', m: 'emotivo' },
  { t: 'Las verduras', m: 'calido-folk' },
  { t: 'Los dinosaurios', m: 'exotico-premium' },
  { t: 'Los animales del bosque', m: 'esperanzador' },
  { t: 'Las partes de la cara', m: 'calmado' },
  { t: 'Los números del 11 al 20', m: 'calmado' },
  { t: 'Los buenos modales', m: 'esperanzador' },
  { t: 'La higiene diaria', m: 'retencion-tiktok' },
  { t: 'Los cinco sentidos', m: 'ensueno' },
  { t: 'El día y la noche', m: 'ensueno' },
  { t: 'Las aves', m: 'calido-folk' },
  { t: 'Los animales bebés y sus mamás', m: 'emotivo' },
  { t: 'La comida saludable', m: 'retencion-tiktok' },
  { t: 'El arcoíris y los colores', m: 'retencion-tiktok' },
];
const LANGS = ['es', 'en', 'it', 'zh'];
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

let base = 0, vars = 0, done = 0;
for (const { t, m } of NEW_TOPICS) {
  const slug = slugify(t);
  const bf = path.join(OUTPUT_DIR, 'briefs', `eduveo_${slug}.json`);
  let sel: SeleccionEdu;
  try {
    if (exists(bf)) sel = await readJson<SeleccionEdu>(bf, null as any);
    else {
      const r = await selectEduFormats(t);
      sel = r.seleccion.find((s) => ['con_objetos', 'personaje_narrador', 'quiz_adivinanza'].includes(s.slug)) ?? r.seleccion[0];
      await writeJson(bf, sel);
    }
  } catch (e) { log.err(`brief "${t}": ${(e as Error).message.slice(0, 80)} — sigo`); continue; }

  log.step(`TEMA ${++done}/${NEW_TOPICS.length}: ${t} (${sel.slug})`);
  // 1) Base (genera motion + reel por idioma)
  try {
    const reels = await produceAllLangs(sel, { topic: t, mood: m, langs: LANGS });
    for (const l of LANGS) { await uploadPublic(reels[l], `kids-studio/batch/${slug}_${l}.mp4`, 'video/mp4'); base++; }
    log.ok(`${t}: base 4 idiomas`);
  } catch (e) { log.err(`base "${t}": ${(e as Error).message.slice(0, 100)} — sigo`); continue; }

  // 2) Variantes (reusan el motion)
  const dir = reelDir(t, sel.slug);
  const motion = path.join(dir, 'motion.mp4');
  if (!exists(motion)) { log.warn(`sin motion para variantes: ${t}`); continue; }
  const vfile = path.join(dir, 'variants.json');
  let variants = await readJson<{ titulo: string; voz: string }[]>(vfile, []);
  if (variants.length < K) {
    try {
      const extra = await generateVariants(t, sel, K - variants.length, variants.map((v) => v.voz));
      variants = [...variants, ...extra];
      await writeJson(vfile, variants);
    } catch (e) { log.warn(`variantes "${t}": ${(e as Error).message.slice(0, 60)}`); }
  }
  for (let i = 0; i < Math.min(K, variants.length); i++) {
    const suffix = `_v${i + 1}`;
    for (const l of LANGS) {
      try {
        const reel = await renderLang(motion, sel, dir, l, m, { vozEs: variants[i].voz, suffix });
        await uploadPublic(reel, `kids-studio/batch/${slug}_${l}${suffix}.mp4`, 'video/mp4');
        vars++;
      } catch (e) { log.err(`${slug}${suffix}/${l}: ${(e as Error).message.slice(0, 80)}`); }
    }
  }
  log.ok(`${t}: +${Math.min(K, variants.length)} variantes`);
}
console.log(`\n✅ Temas nuevos: ${base} base + ${vars} variantes = ${base + vars} reels (≈${Math.round((base + vars) / 4)}/canal).`);

// Orquestador diario SabiKids — CERO Veo. Cada corrida, por idioma:
//   1) genera REMIXES (temas relacionados reusando motions existentes) → Shorts nuevos
//   2) genera 1 COMPILACIÓN (video largo multi-tema)
//   3) escribe su metadata SEO publish-ready en data/youtube/<lang>/<slug>.json
//      para que el publicador (yt-publish-all) lo programe en franjas Miami.
// Uso: tsx scripts/sabikids-daily.ts [remixesPorIdioma=2]
import path from 'node:path';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { selectEduFormats } from '../src/formats/selector';
import { renderLang } from '../src/edu/produce-edu-veo';
import { geminiJson } from '../src/ai/gemini';
import { readJson, writeJson, exists, ensureDir } from '../src/lib/files';
import { ROOT, OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';
import type { SeleccionEdu } from '../src/formats/types';
import { kidsSeoSystem, SABI_BRAND, type SabiLang } from '../src/seo/sabikids';

const exec = promisify(execFile);
const REMIXES = Number(process.argv[2] || 2);
const LANGS = ['es', 'en', 'it', 'zh'];
const YT = path.join(ROOT, 'data', 'youtube');
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// Tema NUEVO → tema BASE existente (reusa sus visuales). Rota por día.
const REMIX_MAP: [string, string][] = [
  ['Los sonidos de la granja', 'Los animales de la granja'],
  ['Los bebés de los animales', 'Los animales de la granja'],
  ['Mezclar los colores', 'Los colores'],
  ['Los colores del arcoíris', 'Los colores'],
  ['Las frutas tropicales', 'Las frutas'],
  ['Contar hasta veinte', 'Los números del 1 al 10'],
  ['Los animales del océano', 'Los animales del mar'],
  ['Las formas en casa', 'Las formas'],
  ['Los animales de la selva africana', 'Los animales de la selva'],
  ['Las emociones del día', 'Las emociones'],
];

function findMotion(slug: string): string | null {
  for (const base of ['edu-veo-16x9', 'edu-veo']) {
    const root = path.join(OUTPUT_DIR, 'reels', base);
    if (!fs.existsSync(root)) continue;
    const d = fs.readdirSync(root).find((x) => x.startsWith(`${slug}__`) && exists(path.join(root, x, 'motion.mp4')));
    if (d) return path.join(root, d, 'motion.mp4');
  }
  return null;
}

async function selFor(topic: string): Promise<SeleccionEdu> {
  const f = path.join(OUTPUT_DIR, 'briefs', `eduveo_${slugify(topic)}.json`);
  if (exists(f)) return readJson<SeleccionEdu>(f, null as any);
  const res = await selectEduFormats(topic);
  const sel = res.seleccion.find((s) => ['con_objetos', 'personaje_narrador', 'quiz_adivinanza'].includes(s.slug)) ?? res.seleccion[0];
  await writeJson(f, sel);
  return sel;
}

/** Metadata SEO ecosistémica publish-ready para el publicador SabiKids. */
async function writeMeta(lang: string, slug: string, file: string, topic: string, kind: 'short' | 'compilation', cfg: any) {
  const brand = SABI_BRAND[lang as SabiLang] || 'Sabi Kids';
  let meta: any = { title: `${topic} | ${brand}`, description: '', tags: cfg.keywords || ['kids learning'], file };
  try {
    const sys = kidsSeoSystem(lang as SabiLang, { brand, channelDesc: cfg.description, keywords: cfg.keywords, kind });
    const out: any = await geminiJson(`Topic: "${topic}"`, { type: 'object', properties: { titulo: { type: 'string' }, descripcion: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['titulo', 'descripcion', 'tags'] }, sys);
    meta = { title: (out.titulo || topic).slice(0, 100), description: out.descripcion || '', tags: (out.tags || meta.tags).slice(0, 30), file };
  } catch (e) { log.warn(`meta ${slug}: ${(e as Error).message.slice(0, 40)}`); }
  await ensureDir(path.join(YT, lang));
  await writeJson(path.join(YT, lang, `${slug}.json`), meta);
}

let made = 0;
for (const lang of LANGS) {
  const cfg: any = await readJson(path.join(YT, `channel_${lang}.json`), {});
  // 1) Remixes (temas relacionados, cero Veo)
  for (let i = 0; i < REMIXES; i++) {
    const pair = REMIX_MAP[(made + i) % REMIX_MAP.length];
    const [newTopic, baseTopic] = pair;
    const motion = findMotion(slugify(baseTopic));
    if (!motion) { log.warn(`${lang}: sin motion base "${baseTopic}"`); continue; }
    try {
      const sel = await selFor(newTopic);
      const dir = path.join(OUTPUT_DIR, 'reels', 'edu-veo-remix', `${slugify(newTopic)}__from-${slugify(baseTopic)}`);
      await ensureDir(dir);
      const reel = await renderLang(motion, sel, dir, lang, 'esperanzador');
      await writeMeta(lang, `remix-${slugify(newTopic)}`, reel, newTopic, 'short', cfg);
      made++; log.ok(`${lang} remix: ${newTopic}`);
    } catch (e) { log.err(`${lang} remix ${newTopic}: ${(e as Error).message.slice(0, 70)}`); }
  }
  // 2) Compilación (1 por idioma, cero Veo)
  try {
    await exec('npx', ['tsx', 'scripts/gen-sabikids-compilation.ts', lang, '12'], { cwd: ROOT, maxBuffer: 1 << 26 });
    log.ok(`${lang} compilación lista`);
  } catch (e) { log.warn(`${lang} compilación: ${(e as Error).message.slice(0, 60)}`); }
}
console.log(`\n✅ sabikids-daily: ${made} remixes + compilaciones generadas (cero Veo). Publica con yt-publish-all.`);

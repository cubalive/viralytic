// Crea la metadata YouTube de cada variante (título traducido + desc/tags del tema base).
import path from 'node:path';
import { geminiText } from '../src/ai/gemini';
import { reelDir } from '../src/edu/produce-edu-veo';
import { readJson, writeJson, exists } from '../src/lib/files';
import { OUTPUT_DIR, ROOT } from '../src/config';
import { log } from '../src/lib/log';
import type { SeleccionEdu } from '../src/formats/types';

const TOPIC_NAMES = [
  'Los animales de la granja', 'Los colores', 'Los números del 1 al 10', 'Los animales de la selva', 'Las frutas',
  'Las formas', 'Los vehículos', 'Los animales del mar', 'Las emociones', 'Los sonidos de los animales',
  'El abecedario', 'Las mascotas', 'El cuerpo humano', 'La ropa', 'Las profesiones',
  'El clima y las estaciones', 'Los insectos', 'El espacio y los planetas', 'Los instrumentos musicales', 'Los opuestos',
];
const LANGS = ['es', 'en', 'it', 'zh'];
const LNAME: Record<string, string> = { en: 'English', it: 'Italian', zh: 'Simplified Chinese' };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const YT = path.join(ROOT, 'data', 'youtube');

async function transTitle(title: string, lang: string): Promise<string> {
  if (lang === 'es') return title;
  const o = await geminiText(`Traduce este título de video infantil de YouTube a ${LNAME[lang]}, conservando emojis y tono alegre. Devuelve SOLO el título:\n${title}`);
  return o.trim().replace(/^["“]|["”]$/g, '');
}

let n = 0;
for (const name of TOPIC_NAMES) {
  const slug = slugify(name);
  const sel = await readJson<SeleccionEdu>(path.join(OUTPUT_DIR, 'briefs', `eduveo_${slug}.json`), null as any);
  if (!sel) continue;
  const dir = reelDir(name, sel.slug);
  const variants = await readJson<{ titulo: string; voz: string }[]>(path.join(dir, 'variants.json'), []);
  if (!variants.length) continue;

  for (let i = 0; i < variants.length; i++) {
    const vid = `_v${i + 1}`;
    for (const lang of LANGS) {
      const reel = path.join(dir, `reel_${lang}${vid}.mp4`);
      if (!exists(reel)) continue;
      const out = path.join(YT, lang, `${slug}${vid}.json`);
      if (exists(out)) continue;
      const base = await readJson<any>(path.join(YT, lang, `${slug}.json`), null);
      if (!base) continue;
      try {
        const title = await transTitle(variants[i].titulo, lang);
        await writeJson(out, {
          title,
          description: base.description,
          tags: base.tags,
          categoryId: '27',
          madeForKids: true,
          file: path.relative(ROOT, reel).replace(/\\/g, '/'),
        });
        n++;
      } catch (e) { log.warn(`${slug}${vid}/${lang}: ${(e as Error).message.slice(0, 60)}`); }
    }
  }
  log.ok(`${slug}: metadata de variantes`);
}
console.log(`\n✅ ${n} metadatas de variantes creadas.`);

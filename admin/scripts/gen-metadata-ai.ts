// gen-metadata-ai.ts — metadata por VIDEO de SabiKids con ChatGPT (gpt-4o), UNICA por tema.
// Usa el prompt made-for-kids kidsSeoSystem() + el catalogo SABI_TOPICS. NO toca los canales
// (eso lo hace channel_seo.py). Escribe data/youtube/<lang>/<slug>.json (mismo formato que la base).
// Uso: npx tsx scripts/gen-metadata-ai.ts [es|en|it|zh]   (sin arg = los 4 idiomas)
import 'dotenv/config';
import path from 'node:path';
import { geminiJson } from '../src/ai/gemini';
import { writeJson } from '../src/lib/files';
import { OUTPUT_DIR } from '../src/config';
import { recordUsage } from '../src/lib/usage';
import { SABI_TOPICS, SABI_BRAND, kidsSeoSystem, type SabiLang } from '../src/seo/sabikids';

const SCHEMA = { type: 'object', properties: { titulo: { type: 'string' }, descripcion: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['titulo', 'descripcion', 'tags'] };
const DIR = path.join(OUTPUT_DIR, '..', 'youtube');
const LANGS: SabiLang[] = ['es', 'en', 'it', 'zh'];
const only = process.argv[2] as SabiLang | undefined;

function buildTags(list: string[]): string[] {
  const out: string[] = []; let n = 0;
  for (const raw of list) {
    const t = (raw || '').trim();
    if (!t || out.includes(t)) continue;
    const add = t.length + (out.length ? 1 : 0);
    if (n + add > 490 || out.length >= 26) break;
    out.push(t); n += add;
  }
  return out;
}

let ok = 0, fail = 0;
for (const lang of (only ? [only] : LANGS)) {
  for (const t of SABI_TOPICS) {
    const sys = kidsSeoSystem(lang, { brand: SABI_BRAND[lang], keywords: t.kw, kind: 'short' });
    const user = `Optimize THIS specific topic: "${t.name[lang]}" ${t.emoji}. Localized primary keyword: "${t.name[lang]}". Write a description UNIQUE to this exact topic (concrete examples of this topic) — never a generic template that could fit another topic.`;
    try {
      const md: any = await geminiJson(user, SCHEMA, sys);
      const meta = {
        title: String(md.titulo || '').slice(0, 100),
        description: String(md.descripcion || ''),
        tags: buildTags(Array.isArray(md.tags) ? md.tags : []),
        categoryId: '27', madeForKids: true,
        file: `data/output/SABI_REELS/${lang}/${t.slug}.mp4`,
      };
      await writeJson(path.join(DIR, lang, `${t.slug}.json`), meta);
      try { recordUsage('sabi-' + lang, 'metadata', 'openai', 'gpt-4o', 2000, 0.012, t.slug); } catch { /* noop */ }
      ok++;
      console.log(`[${lang}] ${t.slug}: ${meta.title.slice(0, 48)} · desc ${meta.description.length} · tags ${meta.tags.length}`);
    } catch (e) {
      fail++;
      console.log(`[${lang}] ${t.slug} FAIL: ${(e as Error).message.slice(0, 70)}`);
    }
  }
}
console.log(`DONE · ${ok} ok · ${fail} fail`);

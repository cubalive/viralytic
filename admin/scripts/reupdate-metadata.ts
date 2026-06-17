// Re-genera la metadata (con el branding CORRECTO del canal) de los videos YA
// publicados de un slot y los actualiza vía YouTube videos.update. Útil tras
// arreglar el branding del publicador. Reanudable e idempotente por video.
// Uso: tsx scripts/reupdate-metadata.ts <slot>   (ej. wealth)
import path from 'node:path';
import { geminiJson } from '../src/ai/gemini';
import { getYtAccessToken } from '../src/youtube/auth';
import { readJson } from '../src/lib/files';
import { ROOT, OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';

const slot = process.argv[2];
if (!slot) throw new Error('Uso: tsx scripts/reupdate-metadata.ts <slot>');
const YT = path.join(ROOT, 'data', 'youtube');

const meta = await readJson<any>(path.join(YT, `channel_${slot}.json`), null);
if (!meta) throw new Error(`falta channel_${slot}.json`);
const published = await readJson<Record<string, any>>(path.join(YT, `kat_published_${slot}.json`), {});
const DIRS: Record<string, string> = { 'kat-es': 'awakening', 'kat-en': 'awakening-en', 'wealth': 'wealth', 'signal': 'signal' };
const localDir = path.join(OUTPUT_DIR, DIRS[slot] || slot);
const lang = meta.lang || 'en';

const pillarKeys: string[] = (meta.pillars || []).map((p: any) => p.key);
const pillarLines = (meta.pillars || []).map((p: any) => `${p.key}: ${p.title} — ${p.desc}`).join('\n');
const brandName: string = meta.title || slot;
const brandLine: string = meta.brandLine || meta.tagline || brandName;
const nicheHint: string = meta.tagline ? ` (brand line: "${meta.tagline}")` : '';

const SCHEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string' }, descripcion: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    pillar: { type: 'string', enum: pillarKeys },
  },
  required: ['titulo', 'descripcion', 'tags', 'pillar'],
};
const LANG_FULL: Record<string, string> = { es: 'Spanish', en: 'English', it: 'Italian', zh: 'Simplified Chinese' };
const langName = LANG_FULL[lang] ?? 'English';
const SYS =
  `You are the world's #1 YouTube SEO strategist (2026 best practices) for the channel "${brandName}"${nicheHint}. ` +
  `Write ALL output STRICTLY in ${langName}, tied to THIS video's message and the "${brandName}" niche. NEVER mention any other brand or channel name. Natural, human, professional — no keyword stuffing, no AI clichés.\n` +
  `Return ONLY JSON with:\n` +
  `- titulo: ≤100 characters. Structure "primary keyword | emotional hook | ${brandName}". Primary keyword near the start, natural (no clickbait), 1-2 emojis ok.\n` +
  `- descripcion: a RICH SEO description (aim 1500-3000+ characters, use the space). Structure: (1) INTRO — hook + what the viewer will learn, with primary and secondary keywords; (2) BODY — depth on the topic, related concepts and entities, answer common audience questions, weave long-tail phrases, synonyms and LSI keywords naturally, and one line on what "${brandName}" is about and why to follow it (channel authority); (3) END — clear CTA (subscribe, watch another video, a playlist), a community invitation, then a final line with 8-12 specific hashtags. Close the brand voice with "${brandLine}".\n` +
  `- tags: 18-26 specific tags (mix of high-volume, medium, long-tail, brand, related entities and question searches) for THIS niche, ~500 characters total, no duplicates, never another brand's name.\n` +
  `- pillar: best key from:\n${pillarLines}`;

function capTags(tags: string[]): string[] {
  const out: string[] = []; let total = 0;
  for (const raw of tags || []) {
    const t = String(raw).replace(/[<>"“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!t || out.includes(t)) continue;
    const add = t.length + (out.length ? 1 : 0);
    if (total + add > 480) break;
    out.push(t); total += add;
  }
  return out;
}

const token = await getYtAccessToken(slot);
let done = 0, fail = 0;
for (const [slug, pub] of Object.entries(published)) {
  const videoId = (pub as any).videoId;
  if (!videoId) continue;
  const fr = await readJson<any>(path.join(localDir, slug, 'frase.json'), null);
  if (!fr?.frase) { log.warn(`${slug}: sin frase.json, salto`); continue; }
  try {
    const md: any = await geminiJson(
      lang === 'en' ? `Theme: "${fr.topic}"\nPhrase: "${fr.frase}"` : `Tema: "${fr.topic}"\nFrase: "${fr.frase}"`,
      SCHEMA, SYS);
    const snippet = {
      title: (md.titulo || fr.topic).slice(0, 100),
      description: md.descripcion || '',
      tags: capTags(md.tags || []),
      categoryId: meta.categoryId || '27',
      defaultLanguage: meta.defaultLanguage || lang,
    };
    const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: videoId, snippet }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`videos.update ${r.status}: ${JSON.stringify(j).slice(0, 160)}`);
    done++; log.ok(`✏️  ${slug} → "${snippet.title.slice(0, 50)}" [${md.pillar}]`);
  } catch (e) { fail++; log.err(`${slug}: ${(e as Error).message.slice(0, 120)}`); }
}
console.log(`\n✅ ${slot}: ${done} re-actualizados, ${fail} fallos.`);

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
const SYS = lang === 'en'
  ? `You are the #1 YouTube SEO strategist for the channel "${brandName}"${nicheHint}. Produce METICULOUS, SPECIFIC metadata tied to THIS video's message AND the "${brandName}" niche — NEVER mention any other brand or channel name.
- titulo: click-worthy, MAX 100 chars, hook + real keyword, emotional (1-2 emojis ok). No templates.
- descripcion: strong SEO. Hook + keywords first line; 2-3 lines of depth; clear CTA; close with the brand line "${brandLine}" + 8-12 specific hashtags.
- tags: 18-26 specific tags for THIS channel's niche (~500 chars total). Never another brand's name.
- pillar: best key from:\n${pillarLines}\nReturn ONLY JSON.`
  : `Eres el estratega #1 de YouTube SEO para el canal "${brandName}"${nicheHint}. Crea metadata MINUCIOSA y ESPECÍFICA atada al mensaje de ESTE video Y al nicho de "${brandName}" — NUNCA menciones otra marca o canal.
- titulo: invita al clic, MÁX 100 chars, gancho + keyword real, emocional (1-2 emojis ok). Sin plantillas.
- descripcion: SEO fuerte. Gancho + keywords 1ª línea; 2-3 líneas de profundidad; CTA claro; cierra con la frase de marca "${brandLine}" + 8-12 hashtags específicos.
- tags: 18-26 etiquetas del nicho de ESTE canal (~500 chars total). Nunca la marca de otro canal.
- pillar: mejor clave de:\n${pillarLines}\nDevuelve SOLO JSON.`;

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

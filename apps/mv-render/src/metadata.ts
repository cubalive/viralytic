/**
 * metadata — shared YouTube metadata generator for ALL engines (Zuri music,
 * Caroline, Faceless). Implements METADATA_STRATEGY.md so every channel gets the
 * same algorithm-tuned signals instead of ad-hoc per-engine text:
 *
 *   - NATIVE per-language title (researched keywords, not literal translation) +
 *     emoji hook + brand. One channel per language → each language is its own
 *     native upload (no YouTube "localizations" needed).
 *   - Description built for retention: 2-line hook → chapters (if precise music
 *     structure is known) → body excerpt (lyrics/script) → value → brand lore →
 *     hashtags.
 *   - LAYERED tags: exact (song+brand) → brand → niche → theme → language.
 *
 * Generated at RENDER time by the pollers and stored on the row (mv_songs.metadata
 * / mv_video_languages.metadata); the publisher (cron) just reads + applies it.
 */
import OpenAI from 'openai';

export type MetaKind = 'music' | 'caroline' | 'faceless';
export type Lang = 'es' | 'en' | 'zh';

export interface MetadataInput {
  kind: MetaKind;
  language: Lang;
  /** Working/song title or faceless topic. */
  workingTitle: string;
  /** Lyrics (music/caroline) or narration script (faceless). */
  body?: string;
  mood?: string;
  /** Channel/character brand, e.g. "Zuri", "Caroline". */
  brand: string;
  /** Short brand/character lore for the description's "world" block. */
  lore?: string;
  /** Freeform niche descriptor used to steer keywords (caller-provided). */
  niche?: string;
  /** Precise chapters from the music structure (first must be ~0s). Optional. */
  chapters?: { title: string; startSeconds: number }[];
  handle?: string;
  model?: string;
}

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  generatedAt: string;
}

const LANG_GUIDE: Record<Lang, { name: string; search: string }> = {
  es: { name: 'español', search: 'términos que busca esa audiencia en español (no traduzcas literal)' },
  en: { name: 'English', search: 'native English search terms for this niche (not a literal translation)' },
  zh: { name: '简体中文', search: '该受众在中文里真正会搜索的关键词（不要逐字翻译）' },
};

/** "00:00 Intro\n01:12 Coro…" — first line forced to 00:00 so YouTube treats it as chapters. */
function chaptersBlock(chapters: { title: string; startSeconds: number }[]): string {
  const sorted = [...chapters].sort((a, b) => a.startSeconds - b.startSeconds);
  if (!sorted.length) return '';
  const ts = (s: number) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };
  return sorted.map((c, i) => `${i === 0 ? '00:00' : ts(c.startSeconds)} ${c.title}`).join('\n');
}

function normalizeTags(raw: unknown, fallback: string[]): string[] {
  const arr = Array.isArray(raw) ? raw.map((t) => String(t).trim().replace(/^#/, '').toLowerCase()) : [];
  const all = [...arr, ...fallback].filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of all) {
    if (t.length > 30 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 15) break;
  }
  return out;
}

/**
 * Build algorithm-tuned YouTube metadata for one video in one language. Falls
 * back to a deterministic template if the LLM call fails (never throws).
 */
export async function buildVideoMetadata(input: MetadataInput): Promise<VideoMetadata> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = input.model ?? process.env.MV_STRATEGIST_MODEL ?? 'gpt-4o';
  const lang = LANG_GUIDE[input.language];
  const handle = input.handle ?? '';

  const sys = [
    `You are a YouTube growth editor for the brand "${input.brand}" (${input.niche ?? input.kind}).`,
    `Write metadata in ${lang.name}, optimized for retention + discovery. Use ${lang.search}.`,
    `Be honest — never invent collaborators, numbers or facts. Output JSON only:`,
    `{"title":"<=90 chars, hook + brand + 1 niche keyword + at most 1 emoji>",`,
    ` "description":"2-line hook first; then what it's about; intimate, native tone (3-6 short lines). Do NOT add chapters, hashtags or lyrics — those are appended programmatically.",`,
    ` "tags":["10-15 lowercase tags, no #, LAYERED: exact (song+brand) -> brand -> niche -> theme -> language"]}`,
  ].join('\n');

  const user = [
    `Working title / topic: ${input.workingTitle}`,
    input.mood ? `Mood: ${input.mood}` : '',
    input.body ? `${input.kind === 'faceless' ? 'Script' : 'Lyrics'} (excerpt):\n${input.body.slice(0, 2000)}` : '',
  ].filter(Boolean).join('\n');

  const fallbackTags = [input.brand.toLowerCase(), input.niche ?? input.kind, input.language].filter(Boolean) as string[];

  let title = input.workingTitle;
  let description = '';
  let tags = fallbackTags;
  try {
    const r = await openai.chat.completions.create({
      model, temperature: 0.7, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    });
    const j = JSON.parse(r.choices[0]?.message?.content ?? '{}');
    title = String(j.title ?? input.workingTitle).slice(0, 95);
    description = String(j.description ?? '').trim();
    tags = normalizeTags(j.tags, fallbackTags);
  } catch {
    description = `${input.workingTitle} — ${input.brand}`;
    tags = normalizeTags(null, fallbackTags);
  }

  // Assemble the full description: hook → chapters → body → lore → brand/hashtags.
  const parts: string[] = [description];
  if (input.chapters?.length) parts.push(chaptersBlock(input.chapters));
  if (input.body && input.kind !== 'faceless') {
    parts.push(`📝\n${input.body.slice(0, 1500)}`); // lyrics aid karaoke + keyword density
  }
  if (input.lore) parts.push(input.lore);
  const hashtags = tags.slice(0, 3).map((t) => `#${t.replace(/\s+/g, '')}`).join(' ');
  parts.push([hashtags, input.brand + (handle ? ` · ${handle}` : '')].filter(Boolean).join('\n'));

  return {
    title,
    description: parts.filter(Boolean).join('\n\n').slice(0, 4900),
    tags,
    generatedAt: new Date().toISOString(),
  };
}

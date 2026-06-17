// Publicador de Katharsis: sube cada video de despertar con metadata FUERTE y específica
// (título gancho + descripción SEO + tags ≤500c + pilar→playlist). Drip 5/día.
// Hoy: primeros 5 públicos. Resto: programados 5/día a horas pico. Reanudable.
// Uso: tsx scripts/yt-kat-publish.ts <kat-es|kat-en> [perDay]
import path from 'node:path';
import fs from 'node:fs';
import { geminiJson } from '../src/ai/gemini';
import { uploadVideo, setThumbnail } from '../src/youtube/upload';
import { addToPlaylist } from '../src/youtube/playlists';
import { readJson, writeJson } from '../src/lib/files';
import { ROOT, OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';

const slot = process.argv[2];
if (!slot) throw new Error('Uso: tsx scripts/yt-kat-publish.ts <kat-es|kat-en> [perDay]');
const PER_DAY = Number(process.argv[3] || 6);
// LAUNCH=1 → hoy: el 1º público ya y el resto cada 1h hasta PER_DAY.
// (por defecto) diario → reparte en los slots fijos de Miami 6,9,12,15,18,21.
const LAUNCH = process.env.LAUNCH === '1';
const YT = path.join(ROOT, 'data', 'youtube');

const meta = await readJson<any>(path.join(YT, `channel_${slot}.json`), null);
if (!meta) throw new Error(`falta channel_${slot}.json`);
// Carpeta de origen por canal (bien separado, sin cruces)
const DIRS: Record<string, string> = { 'kat-es': 'awakening', 'kat-en': 'awakening-en', 'wealth': 'wealth', 'signal': 'signal' };
const lang = meta.lang || (slot === 'kat-en' ? 'en' : 'es');
const localDir = path.join(OUTPUT_DIR, DIRS[slot] || slot);
const playlists = await readJson<Record<string, string>>(path.join(YT, `kat_playlists_${slot}.json`), {});
const pillarKeys: string[] = (meta.pillars || []).map((p: any) => p.key);
const pillarLines = (meta.pillars || []).map((p: any) => `${p.key}: ${p.title} — ${p.desc}`).join('\n');

// Estado (reanudable): slug -> { videoId, publishAt }
const stateFile = path.join(YT, `kat_published_${slot}.json`);
const state = await readJson<Record<string, any>>(stateFile, {});

// Cursor de agenda POR CANAL: última franja ya reservada, para no doble-reservar
// entre corridas diarias (cada canal llena su grilla de forma independiente).
const cursorFile = path.join(YT, `schedule_cursor_${slot}.json`);
const cursor = await readJson<{ lastSlot?: string }>(cursorFile, {});

// Recolecta videos listos (con frase.json)
const dirs = fs.readdirSync(localDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => path.join(localDir, d.name))
  .filter((p) => fs.existsSync(path.join(p, 'video.mp4')) && fs.existsSync(path.join(p, 'frase.json')));

log.step(`${slot}: ${dirs.length} videos en disco, ${Object.keys(state).length} ya publicados`);

const SCHEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string' }, descripcion: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    pillar: { type: 'string', enum: pillarKeys },
  },
  required: ['titulo', 'descripcion', 'tags', 'pillar'],
};
// Branding por canal (desde channel_<slot>.json): nunca usar la marca de otro canal.
const brandName: string = meta.title || slot;
const brandLine: string = meta.brandLine || meta.tagline || brandName;
const nicheHint: string = meta.tagline ? ` (brand line: "${meta.tagline}")` : '';
const LANG_FULL: Record<string, string> = { es: 'Spanish', en: 'English', it: 'Italian', zh: 'Simplified Chinese' };
const langName = LANG_FULL[lang] ?? 'English';
const SYS =
  `You are the world's #1 YouTube SEO strategist (2026 best practices) for the channel "${brandName}"${nicheHint}. ` +
  `You are given the EXACT phrase of one video. Write ALL output STRICTLY in ${langName}, tied to THIS video's message and the "${brandName}" niche. NEVER mention any other brand or channel name. Natural, human, professional — no keyword stuffing.\n` +
  `Return ONLY JSON with:\n` +
  `- titulo: ≤100 characters. Structure "primary keyword | emotional hook | ${brandName}". Primary keyword near the start, natural (no clickbait), 1-2 emojis ok.\n` +
  `- descripcion: a RICH SEO description (aim 1200-3000+ characters). (1) INTRO: hook + what the viewer gets, with primary/secondary keywords; (2) BODY: depth, related concepts/entities, answer common audience questions, long-tail phrases, synonyms and LSI keywords woven naturally, plus one line on what "${brandName}" is about and why to follow (channel authority); (3) END: clear CTA (subscribe / comment / save / watch another), community invite, brand line "${brandLine}", and a final line of 8-12 specific hashtags.\n` +
  `- tags: 18-26 specific tags (high-volume + medium + long-tail + brand + related entities + question searches) for THIS niche, ~500 chars total, no duplicates, never another brand.\n` +
  `- pillar: best key from:\n${pillarLines}`;

// Sanea + llena tags hasta ~480 chars (YouTube rechaza < > comillas y suma > 500)
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

// Franjas fijas en hora de Miami (America/New_York), 6/día dentro de 6am–9pm, ≥1h aparte.
const SLOT_HOURS = [6, 9, 12, 15, 18, 21];

/** ISO (UTC) de la hora `hour`:00 America/New_York en hoy+dayOffset. La máquina
 *  puede estar en otra zona (p.ej. LA), por eso se calcula el offset real de Miami. */
// Offset (ms) de una zona respecto a UTC en un instante dado (positivo = adelantada).
function tzOffsetMs(instant: number, tz: string): number {
  const p: any = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant)).reduce((a: any, x) => ((a[x.type] = x.value), a), {});
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - instant;
}
function miamiSlotISO(hour: number, dayOffset = 0): string {
  const ny = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = ny.format(new Date()).split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d + dayOffset, hour, 0, 0); // hora de pared deseada (Miami)
  let utc = wall - tzOffsetMs(wall, 'America/New_York');
  utc = wall - tzOffsetMs(utc, 'America/New_York'); // 2ª pasada por bordes de DST
  return new Date(utc).toISOString();
}

// Próximas `count` franjas Miami FUTURAS y posteriores al cursor (no doble-reserva).
function buildDailySlots(count: number): string[] {
  const after = Math.max(Date.now() + 60_000, cursor.lastSlot ? new Date(cursor.lastSlot).getTime() : 0);
  const out: string[] = [];
  for (let day = 0; out.length < count && day < 90; day++) {
    for (const h of SLOT_HOURS) {
      const iso = miamiSlotISO(h, day);
      if (new Date(iso).getTime() > after) { out.push(iso); if (out.length >= count) break; }
    }
  }
  return out;
}
const dailySlots = LAUNCH ? [] : buildDailySlots(PER_DAY);

// Slot del i-ésimo video DE ESTA CORRIDA (i = 0..PER_DAY-1).
function slotFor(i: number): string | undefined {
  if (LAUNCH) {
    // hoy (lanzamiento): el 1º público ya; el resto cada 1h.
    return i === 0 ? undefined : new Date(Date.now() + i * 3600_000).toISOString();
  }
  return dailySlots[i]; // diario: repartido en la grilla Miami, siempre futuro
}

let publishedNow = 0, scheduled = 0, placed = 0;
for (const dir of dirs) {
  const slug = path.basename(dir);
  if (state[slug]) continue;
  if (placed >= PER_DAY) { log.ok(`Tope de ${PER_DAY} por corrida alcanzado — el resto queda para la próxima.`); break; }
  const fr = await readJson<any>(path.join(dir, 'frase.json'), null);
  if (!fr?.frase) { log.warn(`${slug}: sin frase, salto`); continue; }

  let md: any;
  try {
    md = await geminiJson(
      (lang === 'en' ? `Theme: "${fr.topic}"\nPhrase: "${fr.frase}"` : `Tema: "${fr.topic}"\nFrase: "${fr.frase}"`),
      SCHEMA, SYS);
  } catch (e) { log.err(`${slug} metadata: ${(e as Error).message.slice(0, 80)} — salto`); continue; }

  const title = (md.titulo || fr.topic).slice(0, 100);
  const tags = capTags(md.tags || []);
  const publishAt = slotFor(placed);
  try {
    const res = await uploadVideo(slot, {
      title, description: md.descripcion || '', tags,
      categoryId: meta.categoryId || '22', madeForKids: false,
      file: path.join(dir, 'video.mp4'),
    }, publishAt);
    const videoId = res.id;
    state[slug] = { videoId, publishAt: publishAt || 'now', pillar: md.pillar, title };
    await writeJson(stateFile, state);
    // Miniatura sin texto (si el motor la generó). Requiere canal verificado.
    const thumbFile = path.join(dir, 'thumb.png');
    if (fs.existsSync(thumbFile)) {
      try { await setThumbnail(slot, videoId, thumbFile); }
      catch (e) { log.warn(`thumb ${slug}: ${(e as Error).message.slice(0, 60)}`); }
    }
    // Asignar a playlist del pilar
    const plId = playlists[md.pillar] || playlists[pillarKeys[0]];
    if (plId) { try { await addToPlaylist(slot, plId, videoId); } catch (e) { log.warn(`playlist ${slug}: ${(e as Error).message.slice(0, 60)}`); } }
    if (publishAt) { scheduled++; log.ok(`📅 ${slug} → ${publishAt.slice(0, 16)} [${md.pillar}] "${title.slice(0, 50)}"`); }
    else { publishedNow++; log.ok(`🔴 PÚBLICO ${slug} [${md.pillar}] "${title.slice(0, 50)}"`); }
    placed++;
  } catch (e) {
    const msg = (e as Error).message;
    log.err(`${slug} upload: ${msg.slice(0, 140)}`);
    if (/uploadLimitExceeded|quotaExceeded|exceeded.*number/i.test(msg)) { log.warn('Límite de subidas del canal alcanzado — paro aquí (reanudable).'); break; }
  }
}
// Avanza el cursor a la última franja reservada (modo diario), para que la
// próxima corrida continúe desde ahí sin doble-reservar.
if (!LAUNCH && placed > 0 && dailySlots[placed - 1]) {
  cursor.lastSlot = dailySlots[placed - 1];
  await writeJson(cursorFile, cursor);
}
console.log(`\n✅ ${slot}: ${publishedNow} públicos hoy + ${scheduled} programados. Total acumulado: ${Object.keys(state).length}/${dirs.length}.`);

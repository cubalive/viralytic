// Publicador de ClaseoShow: programa los videos (con su metadata SEO ya generada: es_title/desc/tags)
// en franjas fijas de Miami (America/New_York), 5/día entre 6am y 11pm. publishAt + cursor reanudable.
// Uso: tsx scripts/claseo-publish.ts [perDay=5]
import path from 'node:path';
import fs from 'node:fs';
import { uploadVideo } from '../src/youtube/upload';
import { readJson, writeJson } from '../src/lib/files';
import { ROOT, OUTPUT_DIR } from '../src/config';
import { log } from '../src/lib/log';

const slot = 'claseo';
const PER_DAY = Number(process.argv[2] || 5);
const LAUNCH = process.env.LAUNCH === '1'; // hoy: 1º público ya + resto cada 1h
const YT = path.join(ROOT, 'data', 'youtube');
const localDir = path.join(OUTPUT_DIR, 'claseo');

const stateFile = path.join(YT, 'claseo_published.json');
const state = await readJson<Record<string, any>>(stateFile, {});
const cursorFile = path.join(YT, 'schedule_cursor_claseo.json');
const cursor = await readJson<{ lastSlot?: string }>(cursorFile, {});

// Videos listos: tienen video.mp4 + metadata (es_title.txt)
const dirs = fs.existsSync(localDir) ? fs.readdirSync(localDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => path.join(localDir, d.name))
  .filter((p) => fs.existsSync(path.join(p, 'video.mp4')) && fs.existsSync(path.join(p, 'es_title.txt'))) : [];
log.step(`claseo: ${dirs.length} videos listos, ${Object.keys(state).length} ya publicados/programados`);

// Franjas fijas hora de Miami: 5/día entre 6am y 11pm (≥4h aparte).
const SLOT_HOURS = [6, 10, 14, 18, 22];
function tzOffsetMs(instant: number, tz: string): number {
  const p: any = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(instant)).reduce((a: any, x) => ((a[x.type] = x.value), a), {});
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - instant;
}
function miamiSlotISO(hour: number, dayOffset = 0): string {
  const ny = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = ny.format(new Date()).split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d + dayOffset, hour, 0, 0);
  let utc = wall - tzOffsetMs(wall, 'America/New_York');
  utc = wall - tzOffsetMs(utc, 'America/New_York');
  return new Date(utc).toISOString();
}
function buildDailySlots(count: number): string[] {
  const after = Math.max(Date.now() + 60_000, cursor.lastSlot ? new Date(cursor.lastSlot).getTime() : 0);
  const out: string[] = [];
  for (let day = 0; out.length < count && day < 120; day++) {
    for (const h of SLOT_HOURS) {
      const iso = miamiSlotISO(h, day);
      if (new Date(iso).getTime() > after) { out.push(iso); if (out.length >= count) break; }
    }
  }
  return out;
}
const dailySlots = LAUNCH ? [] : buildDailySlots(PER_DAY);
const slotFor = (i: number): string | undefined => LAUNCH ? (i === 0 ? undefined : new Date(Date.now() + i * 3600_000).toISOString()) : dailySlots[i];

let placed = 0, scheduled = 0, publishedNow = 0;
for (const dir of dirs) {
  const slug = path.basename(dir);
  if (state[slug]) continue;
  if (placed >= PER_DAY) { log.ok(`Tope ${PER_DAY}/corrida alcanzado — el resto en la próxima.`); break; }
  const rd = (f: string) => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim(); } catch { return ''; } };
  const title = rd('es_title.txt').slice(0, 100);
  const description = rd('es_desc.txt');
  const tags = rd('es_tags.txt').split(',').map((t) => t.trim()).filter(Boolean);
  if (!title) { log.warn(`${slug}: sin título, salto`); continue; }
  const publishAt = slotFor(placed);
  try {
    const res = await uploadVideo(slot, { title, description, tags, categoryId: '22', madeForKids: false, file: path.join(dir, 'video.mp4') }, publishAt);
    state[slug] = { videoId: res.id, publishAt: publishAt || 'now', title };
    await writeJson(stateFile, state);
    if (publishAt) { scheduled++; log.ok(`📅 ${slug} → ${publishAt.slice(0, 16)} Miami "${title.slice(0, 48)}"`); }
    else { publishedNow++; log.ok(`🔴 PÚBLICO ${slug} "${title.slice(0, 48)}"`); }
    placed++;
  } catch (e) {
    const msg = (e as Error).message;
    log.err(`${slug} upload: ${msg.slice(0, 140)}`);
    if (/uploadLimitExceeded|quotaExceeded|exceeded.*number/i.test(msg)) { log.warn('Límite de subidas del canal — paro (reanudable).'); break; }
  }
}
if (!LAUNCH && placed > 0 && dailySlots[placed - 1]) { cursor.lastSlot = dailySlots[placed - 1]; await writeJson(cursorFile, cursor); }
console.log(`\n✅ claseo: ${publishedNow} públicos + ${scheduled} programados. Total: ${Object.keys(state).length}/${dirs.length}.`);

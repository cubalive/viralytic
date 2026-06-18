// Sube a los 4 canales en round-robin (hasta N por canal). Modo "schedule" = programa
// cada video en horario estratégico según el país, 1/día por canal. Reanudable.
// Uso: tsx scripts/yt-publish-all.ts [N] [schedule]
import path from 'node:path';
import fs from 'node:fs';
import { uploadVideo } from '../src/youtube/upload';
import { addToPlaylist, playlistForTopic } from '../src/youtube/playlists';
import { readJson, writeJson, exists } from '../src/lib/files';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';

const TARGET = Number(process.argv[2] || 5);
const SCHEDULE = process.argv[3] === 'schedule';
const LANGS = ['es', 'en', 'it', 'zh'];

// Horario estratégico por país (después del colegio / prime time infantil).
const SCHED: Record<string, { off: number; hour: number; label: string }> = {
  es: { off: -6, hour: 16, label: 'México/LatAm 16:00' },
  en: { off: -5, hour: 16, label: 'EE.UU. Este 16:00' },
  it: { off: 1, hour: 16, label: 'Italia 16:00' },
  zh: { off: 8, hour: 17, label: 'Taiwán/Singapur 17:00' },
};

function publishAtFor(lang: string, dayOffset: number): string {
  const s = SCHED[lang];
  let utcHour = s.hour - s.off;
  let dayShift = 0;
  while (utcHour < 0) { utcHour += 24; dayShift -= 1; }
  while (utcHour >= 24) { utcHour -= 24; dayShift += 1; }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset + dayShift, utcHour, 0, 0)).toISOString();
}

const VIRAL = [
  'los-sonidos-de-los-animales', 'los-animales-de-la-granja', 'los-colores', 'los-n-meros-del-1-al-10', 'los-veh-culos',
  'los-animales-del-mar', 'los-animales-de-la-selva', 'las-frutas', 'las-mascotas', 'las-formas',
  'las-emociones', 'el-abecedario', 'los-insectos', 'el-espacio-y-los-planetas', 'los-instrumentos-musicales',
  'la-ropa', 'las-profesiones', 'el-cuerpo-humano', 'el-clima-y-las-estaciones', 'los-opuestos',
];
const YT = path.join(ROOT, 'data', 'youtube');

const state: Record<string, { pls: Record<string, string>; pub: Record<string, string> }> = {};
for (const l of LANGS) {
  state[l] = { pls: await readJson(path.join(YT, `playlists_${l}.json`), {}), pub: await readJson(path.join(YT, `published_${l}.json`), {}) };
}

// Cola de publicación por idioma: enumera TODOS los .json con metadata (base,
// variantes _vN, remixes, compilaciones…). Orden: VIRAL/variantes primero (orden
// curado), luego el resto (remix-*, compilacion-*) alfabético. Reanudable por slug.
const items: Record<string, string[]> = {};
for (const l of LANGS) {
  const priority = [...VIRAL];
  for (let v = 1; v <= 8; v++) priority.push(...VIRAL.map((s) => `${s}_v${v}`));
  const dir = path.join(YT, l);
  const all = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  const allSet = new Set(all);
  const rest = all.filter((s) => !priority.includes(s)).sort();
  items[l] = [...priority.filter((s) => allSet.has(s)), ...rest];
}

let total = 0;
let quota = false;
const exhausted = new Set<string>();
for (let round = 0; round < TARGET && !quota; round++) {
  if (exhausted.size === LANGS.length) break;
  for (const lang of LANGS) {
    if (quota) break;
    if (exhausted.has(lang)) continue;
    const slug = items[lang].find((s) => !state[lang].pub[s]);
    if (!slug) continue;
    const meta = await readJson<any>(path.join(YT, lang, `${slug}.json`), null);
    const rawFile = meta?.file || '';
    const file = path.isAbsolute(rawFile) ? rawFile : path.join(ROOT, rawFile);
    if (!meta || !exists(file)) { log.warn(`${lang}/${slug}: sin archivo`); state[lang].pub[slug] = 'SKIP'; continue; }
    meta.file = file;
    const when = SCHEDULE ? publishAtFor(lang, round + 1) : undefined;
    try {
      const v = await uploadVideo(lang, meta, when);
      log.ok(`[${lang}] ${slug} → https://youtu.be/${v.id}  ${when ? '⏰ ' + when + ` (${SCHED[lang].label})` : '(' + v.status?.privacyStatus + ')'}`);
      const plk = playlistForTopic(slug.replace(/_v\d+$/, ''));
      if (plk && state[lang].pls[plk]) await addToPlaylist(lang, state[lang].pls[plk], v.id).catch(() => {});
      state[lang].pub[slug] = v.id;
      await writeJson(path.join(YT, `published_${lang}.json`), state[lang].pub);
      total++;
    } catch (e) {
      const msg = (e as Error).message;
      log.err(`${lang}/${slug}: ${msg.slice(0, 160)}`);
      if (/number of videos they may upload/i.test(msg)) { exhausted.add(lang); log.warn(`${lang}: límite de subidas del canal alcanzado — verifica el canal (SMS) para subir más`); }
      else if (/quotaExceeded|dailyLimit|userRateLimitExceeded/i.test(msg)) { quota = true; log.err('⛔ Cuota API del día agotada — paro.'); }
    }
  }
}
console.log(`\n✅ ${SCHEDULE ? 'Programados' : 'Subidos'} en esta corrida: ${total}.`);

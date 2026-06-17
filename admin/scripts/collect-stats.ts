// Colector de métricas: para CADA canal (faceless + SabiKids), lee sus videos
// publicados (estado local), pide a YouTube sus estadísticas (vistas/likes/
// comentarios) y las hace upsert en Supabase `mv_channel_stats`. Es el "puente"
// que unifica el dashboard y alimenta la auto-optimización. Idempotente.
// Uso: tsx scripts/collect-stats.ts
import 'dotenv/config';
import path from 'node:path';
import { getYtAccessToken } from '../src/youtube/auth';
import { readJson } from '../src/lib/files';
import { ROOT } from '../src/config';
import { log } from '../src/lib/log';

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) throw new Error('Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en admin/.env');
const YT = path.join(ROOT, 'data', 'youtube');

// slot (= archivo de token y de config) -> archivo de estado de publicados
const SLOTS: { key: string; state: string }[] = [
  { key: 'wealth', state: 'kat_published_wealth' },
  { key: 'signal', state: 'kat_published_signal' },
  { key: 'kat-es', state: 'kat_published_kat-es' },
  { key: 'kat-en', state: 'kat_published_kat-en' },
  { key: 'es', state: 'published_es' },
  { key: 'en', state: 'published_en' },
  { key: 'it', state: 'published_it' },
  { key: 'zh', state: 'published_zh' },
];

async function supa(method: string, pathq: string, body?: unknown): Promise<any> {
  const r = await fetch(`${SUPA}/rest/v1/${pathq}`, {
    method,
    headers: {
      apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`supabase ${method} ${pathq}: ${r.status} ${(await r.text()).slice(0, 160)}`);
  return method === 'GET' ? r.json() : null;
}

// org única
const orgs = await supa('GET', 'organizations?select=id&limit=1');
const orgId = orgs?.[0]?.id ?? null;

let totalRows = 0;
for (const { key, state } of SLOTS) {
  const cfg = await readJson<any>(path.join(YT, `channel_${key}.json`), null);
  if (!cfg) continue;
  const channelName: string = cfg.title || key;
  const language: string = cfg.lang || (['es', 'en', 'it', 'zh'].includes(key) ? key : 'en');
  const published = await readJson<Record<string, any>>(path.join(YT, `${state}.json`), {});
  // normaliza: slug -> {videoId, pillar?, title?}
  const entries = Object.entries(published)
    .map(([slug, v]) => (typeof v === 'string' ? { slug, videoId: v } : { slug, videoId: v?.videoId, pillar: v?.pillar, title: v?.title }))
    .filter((e) => e.videoId);
  if (!entries.length) continue;

  let token: string;
  try { token = await getYtAccessToken(key); }
  catch (e) { log.warn(`${key}: sin token (${(e as Error).message.slice(0, 40)}) — salto`); continue; }

  const byId = new Map(entries.map((e) => [e.videoId, e]));
  const ids = entries.map((e) => e.videoId);
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(',');
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${batch}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    if (!r.ok) { log.warn(`${key} videos.list: ${r.status}`); continue; }
    for (const it of j.items || []) {
      const e: any = byId.get(it.id) || {};
      rows.push({
        video_id: it.id,
        organization_id: orgId,
        channel_key: key,
        channel_name: channelName,
        language,
        title: it.snippet?.title ?? e.title ?? null,
        pillar: e.pillar ?? null,
        published_at: it.snippet?.publishedAt ?? null,
        views: Number(it.statistics?.viewCount ?? 0),
        likes: Number(it.statistics?.likeCount ?? 0),
        comments: Number(it.statistics?.commentCount ?? 0),
        collected_at: new Date().toISOString(),
      });
    }
  }
  if (rows.length) {
    await supa('POST', 'mv_channel_stats?on_conflict=video_id', rows);
    totalRows += rows.length;
    log.ok(`${channelName} (${key}): ${rows.length} videos`);
  }
}
console.log(`\n✅ collect-stats: ${totalRows} videos actualizados en mv_channel_stats.`);

/**
 * reels-poll — autonomous worker for the Reels (vertical Shorts) pipeline.
 *
 * Watches mv_reels for status='generating' (admin created a reel on /reels), then:
 *   1. claim it atomically (generating -> rendering)
 *   2. renderReel(mode, topic) — the retention-engineered Short engine (shared CLI)
 *   3. generate YouTube metadata (title/description/tags) with the shared module
 *   4. mark status='ready' + video_path + metadata (publishing is the cron's job)
 *
 * Stale 'rendering' rows are reclaimed after MV_RECLAIM_MINUTES.
 *
 *   tsx src/reels-poll.ts        (loop)
 *   ONCE=1 tsx src/reels-poll.ts (single tick)
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { renderReel } from './reels-render';
import { buildVideoMetadata, type Lang, type MetaKind } from './metadata';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const db: SupabaseClient = createClient(req('SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const pollMs = Number(process.env.REELS_POLL_MS ?? process.env.POLL_MS ?? 10000);
const reclaimMin = Number(process.env.MV_RECLAIM_MINUTES ?? 30);

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), svc: 'reels-poll', msg, ...extra }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Per-mode metadata shaping (brand/niche/language) for the shared generator. */
function metaArgs(mode: string, topic: string): { kind: MetaKind; language: Lang; brand: string; niche: string } {
  if (mode === 'kids') return { kind: 'music', language: 'es', brand: 'Zuri', niche: 'canciones infantiles / shorts' };
  if (mode === 'music') return { kind: 'caroline', language: 'es', brand: 'Caroline', niche: 'R&B / dembow / shorts' };
  return { kind: 'faceless', language: 'es', brand: 'Signal', niche: 'tech / IA / shorts' }; // tech
}

async function processReel(reel: any): Promise<void> {
  log('render.start', { id: reel.id, mode: reel.mode, topic: reel.topic });
  const { dest } = await renderReel(reel.mode, reel.topic);

  const m = metaArgs(reel.mode, reel.topic);
  const metadata = await buildVideoMetadata({ ...m, workingTitle: reel.topic, body: reel.topic });

  await db.from('mv_reels').update({
    status: 'ready', video_path: dest, metadata, error: null, updated_at: new Date().toISOString(),
  }).eq('id', reel.id);
  log('reel.ready', { id: reel.id, dest });
}

async function tick(): Promise<void> {
  // Reclaim reels stuck in 'rendering' past the timeout (crash mid-render).
  const staleBefore = new Date(Date.now() - reclaimMin * 60_000).toISOString();
  const { data: reclaimed } = await db
    .from('mv_reels').update({ status: 'generating', updated_at: new Date().toISOString() })
    .eq('status', 'rendering').lt('updated_at', staleBefore).select('id');
  if (reclaimed?.length) log('reclaimed', { count: reclaimed.length });

  const { data: reel } = await db
    .from('mv_reels').select('*').eq('status', 'generating')
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!reel) return;

  // Atomic claim.
  const { data: claimed } = await db
    .from('mv_reels').update({ status: 'rendering', updated_at: new Date().toISOString() })
    .eq('id', reel.id).eq('status', 'generating').select('id');
  if (!claimed || claimed.length === 0) { log('claimed_elsewhere', { id: reel.id }); return; }

  try {
    await processReel(reel);
  } catch (err) {
    log('reel.failed', { id: reel.id, error: (err as Error).message });
    await db.from('mv_reels').update({ status: 'failed', error: (err as Error).message, updated_at: new Date().toISOString() }).eq('id', reel.id);
  }
}

async function main(): Promise<void> {
  if (process.env.ONCE === '1') { await tick(); return; }
  log('started', { pollMs });
  let running = true;
  process.on('SIGTERM', () => { running = false; log('sigterm'); });
  while (running) {
    try { await tick(); } catch (err) { log('tick.error', { error: (err as Error).message }); }
    await sleep(pollMs);
  }
  process.exit(0);
}

main().catch((err) => { log('fatal', { error: (err as Error).message }); process.exit(1); });

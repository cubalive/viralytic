/**
 * caroline-poll — autonomous worker for the Caroline music-video pipeline.
 *
 * Watches mv_songs for status='generating' (intake complete: lyrics + track +
 * stem uploaded from the /caroline admin tab), then per song:
 *   1. claim it atomically (generating -> rendering)
 *   2. download the full track + vocal stem from storage
 *   3. renderSong() — Veo lyric/energy engine (shared with the CLI)
 *   4. generate YouTube metadata (title/description/tags) with the LLM
 *   5. mark status='ready' + final_path + metadata  (publishing is a later step)
 *
 * Resumable: renderSong persists per-window takes, so a crashed render resumes.
 * Stale 'rendering' rows are reclaimed after MV_RECLAIM_MINUTES.
 *
 *   tsx src/caroline-poll.ts        (loop)
 *   ONCE=1 tsx src/caroline-poll.ts (single tick, for testing)
 */
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { renderSong } from './caroline-song';
import { buildVideoMetadata } from './metadata';

const db: SupabaseClient = createClient(req('SUPABASE_URL'), req('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const bucket = process.env.MV_BUCKET ?? 'assets';
const MODEL = process.env.MV_STRATEGIST_MODEL ?? 'gpt-4o';
const pollMs = Number(process.env.POLL_MS ?? 10000);
const reclaimMin = Number(process.env.MV_RECLAIM_MINUTES ?? 30);
const CHANNEL_HANDLE = process.env.CAROLINE_CHANNEL ?? '@CarolineMusicShow';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), svc: 'caroline-poll', msg, ...extra }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function signedUrl(p: string): Promise<string> {
  if (/^https?:\/\//.test(p)) return p;
  const { data, error } = await db.storage.from(bucket).createSignedUrl(p, 3600);
  if (error || !data) throw new Error(`signedUrl ${p}: ${error?.message}`);
  return data.signedUrl;
}
async function download(url: string): Promise<Buffer> {
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}

const CAROLINE_LORE =
  'Caroline — sesiones íntimas de R&B y dembow con alma. Voz con brillo, micrófono dorado y luz tenue. ' +
  'Música para sanar, despertar y sentir.';

/** YouTube metadata via the shared strategy module (title/description/tags/lyrics). */
async function buildMetadata(title: string, lyrics: string, mood: string, feel: string) {
  return buildVideoMetadata({
    kind: 'caroline',
    language: 'es',
    workingTitle: title,
    body: lyrics,
    mood: `${mood} / ${feel}`,
    brand: 'Caroline',
    niche: 'R&B / dembow en español',
    lore: CAROLINE_LORE,
    handle: CHANNEL_HANDLE,
    model: MODEL,
  });
}

async function processSong(song: any): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cpoll_'));
  try {
    if (!song.lyrics || !song.track_path || !song.stem_path) throw new Error('intake incompleto (lyrics/track/stem)');
    const aspect: '16:9' | '9:16' = song.aspect === '16:9' ? '16:9' : '9:16';

    const trackLocal = path.join(dir, 'track.wav');
    const stemLocal = path.join(dir, 'stem.wav');
    await fs.writeFile(trackLocal, await download(await signedUrl(song.track_path)));
    await fs.writeFile(stemLocal, await download(await signedUrl(song.stem_path)));
    log('render.start', { id: song.id, title: song.title, aspect });

    const { dest, mood, feel, happy, windows } = await renderSong({
      lyrics: song.lyrics, trackLocal, stemLocal, aspect, slug: song.title || song.id,
    });

    const meta = await buildMetadata(song.title || 'Caroline', song.lyrics, mood, feel);
    await db.from('mv_songs').update({
      status: 'ready',
      final_path: dest,
      metadata: { ...meta, mood, feel, happy, windows, channel_handle: CHANNEL_HANDLE },
      updated_at: new Date().toISOString(),
    }).eq('id', song.id);
    log('song.ready', { id: song.id, dest, mood, windows });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function tick(): Promise<void> {
  // Reclaim songs stuck in 'rendering' past the timeout (crash mid-render).
  const staleBefore = new Date(Date.now() - reclaimMin * 60_000).toISOString();
  const { data: reclaimed } = await db
    .from('mv_songs').update({ status: 'generating', updated_at: new Date().toISOString() })
    .eq('status', 'rendering').lt('updated_at', staleBefore).select('id');
  if (reclaimed?.length) log('reclaimed', { count: reclaimed.length });

  const { data: song } = await db
    .from('mv_songs').select('*').eq('status', 'generating')
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!song) return;

  // Atomic claim.
  const { data: claimed } = await db
    .from('mv_songs').update({ status: 'rendering', updated_at: new Date().toISOString() })
    .eq('id', song.id).eq('status', 'generating').select('id');
  if (!claimed || claimed.length === 0) { log('claimed_elsewhere', { id: song.id }); return; }

  try {
    await processSong(song);
  } catch (err) {
    log('song.failed', { id: song.id, error: (err as Error).message });
    await db.from('mv_songs').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', song.id);
  }
}

async function main(): Promise<void> {
  if (process.env.ONCE === '1') { await tick(); return; }
  log('started', { pollMs, channel: CHANNEL_HANDLE });
  let running = true;
  process.on('SIGTERM', () => { running = false; log('sigterm'); });
  while (running) {
    try { await tick(); } catch (err) { log('tick.error', { error: (err as Error).message }); }
    await sleep(pollMs);
  }
  process.exit(0);
}

main().catch((err) => { log('fatal', { error: (err as Error).message }); process.exit(1); });

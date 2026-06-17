import { NextResponse, type NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { getServiceClient } from '@viralytic/db';
import { youtube } from '@viralytic/integrations';

// Auto-publisher cron: render worker marks items ready/rendered → this job
// publishes them to YouTube (where googleapis + the OAuth connections live).
// Bounded to a few uploads per run to stay within the function time budget;
// Vercel calls it on a schedule (see apps/web/vercel.json). Idempotent via a
// transient status claim so overlapping runs never double-publish.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUCKET = 'assets';
const CAROLINE_HANDLE = '@CarolineMusicShow';

/**
 * Resolve the Caroline mv_channels id robustly. Prefers the channel carrying the
 * current YouTube handle (so a duplicate "Caroline" project can't misroute the
 * publish), then falls back to the newest Caroline project's es channel.
 */
async function carolineChannelId(db: any): Promise<string | null> {
  const { data: byHandle } = await db
    .from('mv_channels')
    .select('id')
    .eq('youtube_handle', CAROLINE_HANDLE)
    .limit(1);
  if (byHandle?.length) return byHandle[0].id as string;

  const { data: proj } = await db
    .from('mv_projects')
    .select('id')
    .eq('name', 'Caroline')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!proj) return null;
  const { data: chan } = await db
    .from('mv_channels')
    .select('id')
    .eq('project_id', proj.id)
    .eq('language', 'es')
    .maybeSingle();
  return chan?.id ?? null;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // must be configured
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

async function streamFromStorage(db: any, path: string): Promise<Readable> {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error('sign_failed');
  const res = await fetch(data.signedUrl);
  if (!res.ok || !res.body) throw new Error(`fetch_video ${res.status}`);
  return Readable.fromWeb(res.body as any);
}

async function connectionFor(db: any, channelId: string | null) {
  if (!channelId) return null;
  const { data } = await db
    .from('mv_youtube_connections')
    .select('*')
    .eq('channel_id', channelId)
    .eq('connection_status', 'connected')
    .maybeSingle();
  return data ?? null;
}

/** Publish one ready Caroline song (if its channel is connected). */
async function publishOneCaroline(db: any, done: string[]) {
  const { data: song } = await db
    .from('mv_songs')
    .select('*')
    .eq('status', 'ready')
    .not('final_path', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!song) return;

  // Resolve the Caroline channel by handle (robust to a duplicate project) + its connection.
  const channelId = await carolineChannelId(db);
  const conn = await connectionFor(db, channelId ?? song.channel_id ?? null);
  if (!conn) return; // not connected yet — leave it ready

  // Claim (ready -> publishing) so a second run can't grab it.
  const { data: claimed } = await db
    .from('mv_songs').update({ status: 'publishing' }).eq('id', song.id).eq('status', 'ready').select('id');
  if (!claimed?.length) return;

  try {
    const meta = (song.metadata ?? {}) as any;
    const stream = await streamFromStorage(db, song.final_path);
    const videoId = await youtube.uploadVideo({
      db, connection: conn, fileStream: stream,
      title: meta.title ?? song.title, description: meta.description ?? '',
      tags: meta.tags ?? ['caroline', 'r&b'], categoryId: '10', privacyStatus: 'public', defaultLanguage: 'es',
    });
    await db.from('mv_songs').update({ status: 'published', youtube_video_id: videoId, channel_id: channelId }).eq('id', song.id);
    done.push(`caroline:${song.id}`);
  } catch (e) {
    await db.from('mv_songs').update({ status: 'ready', metadata: { ...(song.metadata ?? {}), publish_error: (e as Error).message } }).eq('id', song.id);
  }
}

/** Publish one rendered video-language (Zuri music or Faceless) on a connected channel. */
async function publishOneVideoLanguage(db: any, done: string[]) {
  const { data: rows } = await db
    .from('mv_video_languages')
    .select('id, language, status, final_video_path, short_video_path, channel_id, metadata, mv_videos!inner(title, song_title, kind)')
    .eq('status', 'rendered')
    .not('final_video_path', 'is', null)
    .not('channel_id', 'is', null)
    .limit(8);
  for (const vl of rows ?? []) {
    const conn = await connectionFor(db, vl.channel_id);
    if (!conn) continue;
    const video = Array.isArray(vl.mv_videos) ? vl.mv_videos[0] : vl.mv_videos;
    // Claim (rendered -> scheduled) idempotently.
    const { data: claimed } = await db
      .from('mv_video_languages').update({ status: 'scheduled' }).eq('id', vl.id).eq('status', 'rendered').select('id');
    if (!claimed?.length) continue;
    try {
      const isFaceless = video?.kind === 'faceless';
      const meta = (vl.metadata ?? {}) as { title?: string; description?: string; tags?: string[] };
      const title = String(meta.title ?? video?.song_title ?? video?.title ?? 'Video').slice(0, 95);
      const lang = vl.language === 'zh' ? 'zh-Hans' : vl.language;
      const description = meta.description ?? (isFaceless ? `${title}\n\n#SignalFromTheFuture` : title);
      const tags = meta.tags;
      const categoryId = isFaceless ? '28' : '10';
      const videoId = await youtube.uploadVideo({
        db, connection: conn, fileStream: await streamFromStorage(db, vl.final_video_path),
        title, description, tags, categoryId, privacyStatus: 'public', defaultLanguage: lang, madeForKids: false,
      });
      await db.from('mv_video_languages').update({ status: 'published', youtube_video_id: videoId }).eq('id', vl.id);
      done.push(`vl:${vl.id}`);

      // Short 9:16 → uploaded as a separate #Shorts video on the same channel (best-effort).
      if (vl.short_video_path) {
        try {
          const shortId = await youtube.uploadVideo({
            db, connection: conn, fileStream: await streamFromStorage(db, vl.short_video_path),
            title: `${title} #Shorts`.slice(0, 95), description: `${description} #Shorts`,
            tags: tags ? [...tags, 'shorts'] : undefined,
            categoryId, privacyStatus: 'public', defaultLanguage: lang, madeForKids: false,
          });
          done.push(`vl-short:${vl.id}:${shortId}`);
        } catch { /* short is non-critical — master already published */ }
      }
    } catch {
      await db.from('mv_video_languages').update({ status: 'rendered' }).eq('id', vl.id);
    }
    return; // one per run
  }
}

/** Publish one ready reel (vertical Short) to its assigned channel. */
async function publishOneReel(db: any, done: string[]) {
  const { data: reel } = await db
    .from('mv_reels')
    .select('id, mode, topic, video_path, channel_id, metadata')
    .eq('status', 'ready')
    .not('video_path', 'is', null)
    .not('channel_id', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!reel) return;

  const conn = await connectionFor(db, reel.channel_id);
  if (!conn) return; // channel not connected — leave it ready

  const { data: claimed } = await db
    .from('mv_reels').update({ status: 'publishing' }).eq('id', reel.id).eq('status', 'ready').select('id');
  if (!claimed?.length) return;

  try {
    const meta = (reel.metadata ?? {}) as { title?: string; description?: string; tags?: string[] };
    const title = `${String(meta.title ?? reel.topic)} #Shorts`.slice(0, 95);
    const videoId = await youtube.uploadVideo({
      db, connection: conn, fileStream: await streamFromStorage(db, reel.video_path),
      title, description: `${meta.description ?? reel.topic} #Shorts`,
      tags: meta.tags ? [...meta.tags, 'shorts'] : ['shorts'],
      categoryId: reel.mode === 'tech' ? '28' : '10', privacyStatus: 'public', defaultLanguage: 'es', madeForKids: false,
    });
    await db.from('mv_reels').update({ status: 'published', youtube_video_id: videoId }).eq('id', reel.id);
    done.push(`reel:${reel.id}`);
  } catch (e) {
    await db.from('mv_reels').update({ status: 'ready', error: (e as Error).message }).eq('id', reel.id);
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = getServiceClient() as any;
  const done: string[] = [];
  try {
    await publishOneCaroline(db, done);
    await publishOneVideoLanguage(db, done);
    await publishOneReel(db, done);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, done }, { status: 500 });
  }
  return NextResponse.json({ ok: true, published: done });
}

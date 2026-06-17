'use server';

import { Readable } from 'node:stream';
import { revalidatePath } from 'next/cache';
import { youtube } from '@viralytic/integrations';
import { requireAdmin } from '@/lib/admin';

const ASSETS_BUCKET = 'assets';
const PROJECT = 'Vallenato';
const ARTIST = 'vallenato';
// Canal de YouTube del usuario (vallenatos). Se resuelve/crea por su channelId.
const YT_CHANNEL_ID = 'UC12Mp8PiLu4KIPtO78fSToQ';

/** Create a vallenato song row (draft). Visualizer = 16:9. */
export async function createSong(formData: FormData): Promise<void> {
  const { orgId, db } = await requireAdmin();
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;
  await db.from('mv_songs').insert({ organization_id: orgId, artist: ARTIST, title, aspect: '16:9', status: 'draft' });
  revalidatePath('/vallenato');
}

async function resolveSong(db: any, orgId: string, songId: string) {
  const { data } = await db.from('mv_songs').select('*').eq('id', songId).single();
  if (!data || data.organization_id !== orgId || data.artist !== ARTIST) return null;
  return data;
}

/** Signed upload URL so the browser PUTs the big WAV straight to storage. */
export async function createUploadTarget(input: { songId: string; kind: 'track' | 'stem' }) {
  const { orgId, db } = await requireAdmin();
  const song = await resolveSong(db, orgId, input.songId);
  if (!song) return { error: 'not_found' };
  const path = `mv/vallenato/intake/${input.songId}/${input.kind}.wav`;
  const { data, error } = await db.storage.from(ASSETS_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return { error: error?.message ?? 'sign_failed' };
  return { path: data.path, token: data.token };
}

export async function recordUpload(input: { songId: string; kind: 'track' | 'stem'; path: string }): Promise<void> {
  const { orgId, db } = await requireAdmin();
  const song = await resolveSong(db, orgId, input.songId);
  if (!song) return;
  const column = input.kind === 'track' ? 'track_path' : 'stem_path';
  await db.from('mv_songs').update({ [column]: input.path }).eq('id', input.songId);
  await maybeStart(input.songId);
  revalidatePath('/vallenato');
}

export async function saveLyrics(input: { songId: string; lyrics: string }): Promise<void> {
  const { orgId, db } = await requireAdmin();
  const song = await resolveSong(db, orgId, input.songId);
  if (!song) return;
  await db.from('mv_songs').update({ lyrics: input.lyrics.trim() || null }).eq('id', input.songId);
  await maybeStart(input.songId);
  revalidatePath('/vallenato');
}

/** Once lyrics + track + stem are present, flip draft → generating (the render worker picks it up). */
export async function maybeStart(songId: string): Promise<void> {
  const { db } = await requireAdmin();
  const { data: s } = await db.from('mv_songs').select('status, lyrics, track_path, stem_path').eq('id', songId).single();
  if (!s || s.status !== 'draft' || !s.lyrics || !s.track_path || !s.stem_path) return;
  await db.from('mv_songs').update({ status: 'generating' }).eq('id', songId).eq('status', 'draft');
}

export async function deleteSong(formData: FormData): Promise<void> {
  const { orgId, db } = await requireAdmin();
  const songId = String(formData.get('songId') ?? '');
  const song = await resolveSong(db, orgId, songId);
  if (!song) return;
  await db.from('mv_songs').delete().eq('id', songId).eq('organization_id', orgId);
  revalidatePath('/vallenato');
}

/** Idempotently ensure the Vallenato project + channel (keyed on the YouTube channelId). */
async function ensureChannel(db: any, orgId: string): Promise<string> {
  const { data: byId } = await db.from('mv_channels').select('id').eq('youtube_channel_id', YT_CHANNEL_ID).limit(1);
  if (byId?.length) return byId[0].id as string;
  const { data: projs } = await db
    .from('mv_projects').select('id').eq('organization_id', orgId).eq('name', PROJECT)
    .order('created_at', { ascending: false }).limit(1);
  let projId = projs?.[0]?.id as string | undefined;
  if (!projId) {
    const { data } = await db.from('mv_projects')
      .insert({ organization_id: orgId, name: PROJECT, protagonist: 'Vallenato', status: 'active' }).select('id').single();
    projId = data?.id;
  }
  const { data: chans } = await db.from('mv_channels').select('id').eq('project_id', projId).eq('language', 'es').limit(1);
  if (chans?.length) {
    await db.from('mv_channels').update({ youtube_channel_id: YT_CHANNEL_ID }).eq('id', chans[0].id);
    return chans[0].id as string;
  }
  const { data: chan } = await db.from('mv_channels')
    .insert({ project_id: projId, language: 'es', youtube_channel_id: YT_CHANNEL_ID }).select('id').single();
  return chan.id as string;
}

export async function getChannelInfo(): Promise<{ channelId: string; connected: boolean; youtubeTitle: string | null }> {
  const { orgId, db } = await requireAdmin();
  const channelId = await ensureChannel(db, orgId);
  const { data: conn } = await db.from('mv_youtube_connections')
    .select('youtube_title, connection_status').eq('channel_id', channelId).maybeSingle();
  return { channelId, connected: conn?.connection_status === 'connected', youtubeTitle: conn?.youtube_title ?? null };
}

/** Publish a READY vallenato video to its channel. */
export async function publishSong(formData: FormData): Promise<void> {
  const { orgId, db } = await requireAdmin();
  const songId = String(formData.get('songId') ?? '');
  const song = await resolveSong(db, orgId, songId);
  if (!song || song.status !== 'ready' || !song.final_path) return;
  const channelId = await ensureChannel(db, orgId);
  const { data: conn } = await db.from('mv_youtube_connections').select('*').eq('channel_id', channelId).maybeSingle();
  if (!conn) return;

  await db.from('mv_songs').update({ status: 'publishing' }).eq('id', songId);
  try {
    const { data: signed, error: signErr } = await db.storage.from(ASSETS_BUCKET).createSignedUrl(song.final_path, 3600);
    if (signErr || !signed) throw new Error('sign_failed');
    const res = await fetch(signed.signedUrl);
    if (!res.ok || !res.body) throw new Error(`fetch_video ${res.status}`);
    const meta = (song.metadata ?? {}) as { title?: string; description?: string; tags?: string[] };
    const videoId = await youtube.uploadVideo({
      db, connection: conn, fileStream: Readable.fromWeb(res.body as any),
      title: meta.title ?? song.title, description: meta.description ?? '',
      tags: meta.tags ?? ['vallenato', 'música vallenata', 'vallenatos'],
      categoryId: '10', privacyStatus: 'public', defaultLanguage: 'es',
    });
    await db.from('mv_songs').update({ status: 'published', youtube_video_id: videoId, channel_id: channelId }).eq('id', songId);
  } catch (e) {
    await db.from('mv_songs').update({ status: 'ready', metadata: { ...(song.metadata ?? {}), publish_error: (e as Error).message } }).eq('id', songId);
  }
  revalidatePath('/vallenato');
}

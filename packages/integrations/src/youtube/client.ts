// YouTube Data API v3 — OAuth client + publishing for the music-video channels.
//
// Tokens live ENCRYPTED in mv_youtube_connections (one row per mv_channels).
// getFreshConnection() mirrors apps/workers/src/lib/tiktok-auth.ts: it refreshes
// the access token when near expiry and PERSISTS the rotated tokens, so the
// connection stays valid permanently (provided the OAuth app is in Production).
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encrypt, decrypt, logger, IntegrationError } from '@viralytic/shared';

export const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube'];
const REFRESH_BUFFER_MS = 60_000;

export interface YoutubeConnectionRow {
  id: string;
  channel_id: string;
  youtube_channel_id: string | null;
  refresh_token_encrypted: string;
  access_token_encrypted: string | null;
  token_expiry: string | null;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new IntegrationError('YOUTUBE_ENV_MISSING', `${name} is not set`);
  return v;
}

/** A bare OAuth2 client (no creds) — for building auth URLs / exchanging codes. */
export function oauthClient() {
  return new google.auth.OAuth2(
    env('YOUTUBE_CLIENT_ID'),
    env('YOUTUBE_CLIENT_SECRET'),
    env('YOUTUBE_REDIRECT_URI'),
  );
}

/** Consent URL. `state` should be an opaque, tamper-evident value (encrypt()). */
export function authUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // always return a refresh_token
    scope: YOUTUBE_SCOPES,
    state,
  });
}

/** Exchange an authorization code for tokens + resolve the authorized channel. */
export async function exchangeCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const yt = google.youtube({ version: 'v3', auth: client });
  const me = await yt.channels.list({ part: ['snippet'], mine: true });
  const ch = me.data.items?.[0];
  return {
    tokens,
    youtubeChannelId: ch?.id ?? null,
    youtubeTitle: ch?.snippet?.title ?? null,
  };
}

/**
 * Return an authed OAuth2 client for a stored connection, refreshing +
 * persisting the access token first if it is expired or about to expire.
 */
export async function getFreshConnection(
  db: SupabaseClient,
  conn: YoutubeConnectionRow,
) {
  const client = oauthClient();
  client.setCredentials({
    refresh_token: decrypt(conn.refresh_token_encrypted),
    access_token: conn.access_token_encrypted ? decrypt(conn.access_token_encrypted) : undefined,
    expiry_date: conn.token_expiry ? new Date(conn.token_expiry).getTime() : undefined,
  });

  // Persist any rotated tokens googleapis hands back.
  client.on('tokens', async (t) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (t.access_token) patch.access_token_encrypted = encrypt(t.access_token);
    if (t.expiry_date) patch.token_expiry = new Date(t.expiry_date).toISOString();
    if (t.refresh_token) patch.refresh_token_encrypted = encrypt(t.refresh_token);
    await db.from('mv_youtube_connections').update(patch).eq('id', conn.id);
    logger.info({ connectionId: conn.id }, 'youtube.token.persisted');
  });

  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  if (expiry - REFRESH_BUFFER_MS <= Date.now()) {
    try {
      await client.getAccessToken(); // triggers refresh + the 'tokens' listener above
    } catch (err) {
      // A failing refresh means the refresh_token is dead (revoked, or expired
      // because the OAuth app is still in "Testing"). Surface it on the dashboard
      // instead of failing silently inside the publisher.
      const message = err instanceof Error ? err.message : String(err);
      await db
        .from('mv_youtube_connections')
        .update({ connection_status: 'expired', last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
        .eq('id', conn.id);
      logger.warn({ connectionId: conn.id, message }, 'youtube.token.refresh_failed');
      throw new IntegrationError('YOUTUBE_TOKEN_EXPIRED', `connection ${conn.id} refresh failed: ${message}`);
    }
  }
  return client;
}

/**
 * Prove a stored connection still works by forcing a token refresh against
 * Google and reading the authorized channel. Updates connection_status to
 * 'connected' (with the resolved title) or 'expired' (with last_error), and
 * returns the verdict. Use this to AUDIT that every channel has a live,
 * permanent token (rather than trusting the last-known status).
 */
export async function verifyConnection(
  db: SupabaseClient,
  conn: YoutubeConnectionRow,
): Promise<{ ok: boolean; title?: string | null; error?: string }> {
  try {
    // Force a refresh regardless of the cached expiry, then hit the API for real.
    const client = oauthClient();
    client.setCredentials({ refresh_token: decrypt(conn.refresh_token_encrypted) });
    const fresh = await client.getAccessToken();
    if (!fresh.token) throw new IntegrationError('YOUTUBE_NO_ACCESS_TOKEN', 'refresh returned no access token');
    const yt = google.youtube({ version: 'v3', auth: client });
    const me = await yt.channels.list({ part: ['snippet'], mine: true });
    const ch = me.data.items?.[0];
    const creds = client.credentials;
    await db
      .from('mv_youtube_connections')
      .update({
        connection_status: 'connected',
        youtube_channel_id: ch?.id ?? conn.youtube_channel_id,
        youtube_title: ch?.snippet?.title ?? undefined,
        access_token_encrypted: creds.access_token ? encrypt(creds.access_token) : conn.access_token_encrypted,
        token_expiry: creds.expiry_date ? new Date(creds.expiry_date).toISOString() : conn.token_expiry,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conn.id);
    return { ok: true, title: ch?.snippet?.title ?? null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db
      .from('mv_youtube_connections')
      .update({ connection_status: 'expired', last_error: error.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', conn.id);
    return { ok: false, error };
  }
}

export interface UploadVideoInput {
  db: SupabaseClient;
  connection: YoutubeConnectionRow;
  /** A readable stream of the video file (resumable upload). */
  fileStream: Readable;
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string; // 10 = Music, 24 = Entertainment
  privacyStatus?: 'public' | 'private' | 'unlisted';
  /** ISO time → scheduled publish (forces privacyStatus 'private' until then). */
  publishAt?: string;
  defaultLanguage?: string;
  madeForKids?: boolean;
}

/** Upload a video via youtube.videos.insert (resumable). Returns the video id. */
export async function uploadVideo(input: UploadVideoInput): Promise<string> {
  const auth = await getFreshConnection(input.db, input.connection);
  const yt = google.youtube({ version: 'v3', auth });
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: input.title.slice(0, 100),
        description: input.description.slice(0, 5000),
        tags: input.tags,
        categoryId: input.categoryId ?? '10',
        defaultLanguage: input.defaultLanguage,
      },
      status: {
        privacyStatus: input.publishAt ? 'private' : (input.privacyStatus ?? 'private'),
        publishAt: input.publishAt,
        selfDeclaredMadeForKids: input.madeForKids ?? false,
      },
    },
    media: { body: input.fileStream },
  });
  const id = res.data.id;
  if (!id) throw new IntegrationError('YOUTUBE_UPLOAD_NO_ID', 'videos.insert returned no id');
  return id;
}

/**
 * Set the CHANNEL's branding metadata (description + keywords + country) via
 * channels.update(brandingSettings). The connection must already resolve a
 * youtube_channel_id. `keywords` is a single space-joined string (wrap
 * multi-word keywords in double quotes, per the YouTube API).
 */
export async function updateChannelBranding(
  db: SupabaseClient,
  connection: YoutubeConnectionRow,
  input: { description?: string; keywords?: string; country?: string; defaultLanguage?: string },
): Promise<void> {
  if (!connection.youtube_channel_id) {
    throw new IntegrationError('YOUTUBE_NO_CHANNEL_ID', 'connection has no youtube_channel_id');
  }
  const auth = await getFreshConnection(db, connection);
  const yt = google.youtube({ version: 'v3', auth });
  await yt.channels.update({
    part: ['brandingSettings'],
    requestBody: {
      id: connection.youtube_channel_id,
      brandingSettings: {
        channel: {
          description: input.description?.slice(0, 1000),
          keywords: input.keywords,
          country: input.country,
          defaultLanguage: input.defaultLanguage,
        },
      },
    },
  });
}

/** Add a video to a playlist. `auth` from getFreshConnection(). */
export async function addToPlaylist(
  auth: Awaited<ReturnType<typeof getFreshConnection>>,
  playlistId: string,
  videoId: string,
): Promise<void> {
  const yt = google.youtube({ version: 'v3', auth });
  await yt.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } },
    },
  });
}

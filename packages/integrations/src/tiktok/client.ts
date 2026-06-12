import { IntegrationError, logger } from '@viralytic/shared';

const OAUTH_BASE = 'https://www.tiktok.com/v2/auth';
const API_BASE = 'https://open.tiktokapis.com/v2';

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    scope: 'user.info.basic,video.publish,video.upload',
    response_type: 'code',
    redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    state,
  });
  return `${OAUTH_BASE}/authorize/?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  openId: string;
}> {
  const res = await fetch(`${API_BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    }),
  });
  if (!res.ok) throw new IntegrationError('TIKTOK_OAUTH', `Token exchange failed: ${res.status}`, { body: await res.text() });
  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    open_id: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    openId: data.open_id,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const res = await fetch(`${API_BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new IntegrationError('TIKTOK_REFRESH', `Refresh failed: ${res.status}`);
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
}

export interface PostVideoInput {
  accessToken: string;
  videoUrl: string;          // public URL from Supabase storage
  caption: string;           // includes hashtags
  privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

/** Post a video via the Content Posting API (requires approved app + scopes) */
export async function postVideo(input: PostVideoInput): Promise<{ publishId: string; tiktokPostId?: string }> {
  // Step 1: init the publish session
  const initRes = await fetch(`${API_BASE}/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: input.caption.slice(0, 2200),
        privacy_level: input.privacyLevel ?? 'PUBLIC_TO_EVERYONE',
        disable_comment: input.disableComment ?? false,
        disable_duet: input.disableDuet ?? false,
        disable_stitch: input.disableStitch ?? false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: input.videoUrl,
      },
    }),
  });

  if (!initRes.ok) {
    throw new IntegrationError('TIKTOK_INIT', `Publish init failed: ${initRes.status}`, { body: await initRes.text() });
  }
  const initData = await initRes.json() as { data: { publish_id: string } };
  logger.info({ publishId: initData.data.publish_id }, 'tiktok.publish.init');

  return { publishId: initData.data.publish_id };
}

export async function getPublishStatus(publishId: string, accessToken: string): Promise<{
  status: 'PROCESSING_UPLOAD' | 'PUBLISH_COMPLETE' | 'FAILED';
  postId?: string;
  failReason?: string;
}> {
  const res = await fetch(`${API_BASE}/post/publish/status/fetch/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  if (!res.ok) throw new IntegrationError('TIKTOK_STATUS', `Status check failed: ${res.status}`);
  const data = await res.json() as {
    data: { status: string; publicaly_available_post_id?: string[]; fail_reason?: string };
  };
  return {
    status: data.data.status as 'PROCESSING_UPLOAD' | 'PUBLISH_COMPLETE' | 'FAILED',
    postId: data.data.publicaly_available_post_id?.[0],
    failReason: data.data.fail_reason,
  };
}

export interface VideoMetrics {
  videoId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

/**
 * Fetch engagement metrics for the account's own posts via the Display API
 * `/video/query/` endpoint (requires the `video.list` scope). Returns one row
 * per resolvable video id.
 */
export async function getVideoMetrics(
  accessToken: string,
  videoIds: string[],
): Promise<VideoMetrics[]> {
  if (videoIds.length === 0) return [];

  const fields = 'id,view_count,like_count,comment_count,share_count';
  const res = await fetch(`${API_BASE}/video/query/?fields=${fields}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filters: { video_ids: videoIds } }),
  });
  if (!res.ok) {
    throw new IntegrationError('TIKTOK_METRICS', `Metrics query failed: ${res.status}`, {
      body: await res.text(),
    });
  }

  const data = (await res.json()) as {
    data?: {
      videos?: Array<{
        id: string;
        view_count?: number;
        like_count?: number;
        comment_count?: number;
        share_count?: number;
      }>;
    };
  };

  return (data.data?.videos ?? []).map((v) => ({
    videoId: v.id,
    views: v.view_count ?? 0,
    likes: v.like_count ?? 0,
    comments: v.comment_count ?? 0,
    shares: v.share_count ?? 0,
  }));
}

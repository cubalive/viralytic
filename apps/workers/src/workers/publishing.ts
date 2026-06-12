import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload, queues } from '../queues';
import { tiktok } from '@viralytic/integrations';
import { getServiceClient } from '@viralytic/db';
import { setStatus } from '../lib/orchestrator';
import { QUEUE_NAMES, logger, encrypt, decrypt, IntegrationError } from '@viralytic/shared';

// PULL_FROM_URL publishing is async on TikTok's side; poll the status endpoint
// until the post is live or fails.
const MAX_POLLS = 18;
const POLL_INTERVAL_MS = 10_000;
const TOKEN_REFRESH_BUFFER_MS = 60_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Step 7 — Publish the final video to TikTok via the Content Posting API.
 *
 * Refreshes the OAuth access token if it's expired, inits the PULL_FROM_URL
 * publish, polls until the post is live, persists the real post id/url, and
 * enqueues the first metrics collection. Idempotent: a publication already
 * marked `posted` is skipped.
 */
export const publishingWorker = new Worker<JobPayload['publishing']>(
  QUEUE_NAMES.publishing,
  async (job: Job<JobPayload['publishing']>) => {
    const { jobId, tiktokAccountId } = job.data;
    const db = getServiceClient();

    const { data: account } = await db
      .from('tiktok_accounts')
      .select('*')
      .eq('id', tiktokAccountId)
      .single();
    if (!account) throw new IntegrationError('ACCOUNT_NOT_FOUND', 'TikTok account not found', { tiktokAccountId });
    if (account.is_active === false) {
      throw new IntegrationError('ACCOUNT_INACTIVE', 'TikTok account is disconnected', { tiktokAccountId });
    }

    const { data: pub } = await db.from('publications').select('*').eq('job_id', jobId).single();
    if (!pub) throw new IntegrationError('NO_PUBLICATION', 'No publication record for job', { jobId });

    // Idempotency: don't double-post.
    if (pub.status === 'posted') {
      logger.info({ jobId, publicationId: pub.id }, 'publish.already_posted.skip');
      return { skipped: true };
    }

    // Final video must exist.
    const { data: asset } = await db
      .from('assets')
      .select('public_url, storage_path')
      .eq('job_id', jobId)
      .eq('type', 'final_video')
      .single();
    if (!asset) throw new IntegrationError('NO_FINAL_VIDEO', 'No final video asset to publish', { jobId });

    const videoUrl =
      asset.public_url ?? db.storage.from('assets').getPublicUrl(asset.storage_path).data.publicUrl;

    const accessToken = await getFreshAccessToken(db, account);

    await db.from('publications').update({ status: 'posting' }).eq('id', pub.id);

    // Init the publish session.
    const caption = buildCaption(pub.caption, pub.hashtags);
    const { publishId } = await tiktok.postVideo({ accessToken, videoUrl, caption });
    logger.info({ jobId, publishId }, 'publish.init.ok');

    // Poll until live or failed.
    let postId: string | undefined;
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      const status = await tiktok.getPublishStatus(publishId, accessToken);

      if (status.status === 'PUBLISH_COMPLETE') {
        postId = status.postId;
        break;
      }
      if (status.status === 'FAILED') {
        const reason = status.failReason ?? 'unknown';
        await db
          .from('publications')
          .update({ status: 'failed', error_message: reason })
          .eq('id', pub.id);
        await setStatus(jobId, 'failed', 'publishing', `TikTok publish failed: ${reason}`);
        throw new IntegrationError('PUBLISH_FAILED', `TikTok publish failed: ${reason}`, { jobId, publishId });
      }
      logger.info({ jobId, publishId, attempt }, 'publish.status.processing');
    }

    if (!postId) {
      // Still processing after the poll budget — leave it posting and retry later.
      throw new IntegrationError('PUBLISH_TIMEOUT', 'TikTok still processing after poll budget', {
        jobId,
        publishId,
      });
    }

    const postUrl = account.username
      ? `https://www.tiktok.com/@${account.username}/video/${postId}`
      : null;

    await db
      .from('publications')
      .update({
        status: 'posted',
        tiktok_post_id: postId,
        tiktok_post_url: postUrl,
        posted_at: new Date().toISOString(),
      })
      .eq('id', pub.id);

    await setStatus(jobId, 'posted');

    // Kick off the first metrics collection; the cron continues from there.
    await queues.metricsCollection.add('collect', { publicationId: pub.id });

    logger.info({ jobId, publishId, postId, postUrl }, 'publish.done');
    return { postId, postUrl };
  },
  WORKER_DEFAULTS,
);

publishingWorker.on('failed', async (job, err) => {
  if (job) {
    logger.error({ jobId: job.data.jobId, err }, 'publish.worker.failed');
  }
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Return a valid access token, refreshing + persisting it first if the stored
 * one is expired (or about to expire).
 */
async function getFreshAccessToken(
  db: ReturnType<typeof getServiceClient>,
  account: {
    id: string;
    access_token_encrypted: string;
    refresh_token_encrypted: string;
    expires_at: string | null;
  },
): Promise<string> {
  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;
  const stillValid = expiresAt - TOKEN_REFRESH_BUFFER_MS > Date.now();
  if (stillValid) return decrypt(account.access_token_encrypted);

  const refreshed = await tiktok.refreshAccessToken(decrypt(account.refresh_token_encrypted));
  await db
    .from('tiktok_accounts')
    .update({
      access_token_encrypted: encrypt(refreshed.accessToken),
      refresh_token_encrypted: encrypt(refreshed.refreshToken),
      expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
    })
    .eq('id', account.id);
  logger.info({ accountId: account.id }, 'publish.token.refreshed');
  return refreshed.accessToken;
}

/** Combine caption text with hashtags, capped to TikTok's title limit. */
function buildCaption(caption: string | null, hashtags: string[] | null): string {
  const tags = (hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  return `${caption ?? ''}${tags ? `\n\n${tags}` : ''}`.slice(0, 2200);
}

import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload, queues } from '../queues';
import { tiktok } from '@viralytic/integrations';
import { getServiceClient } from '@viralytic/db';
import { setStatus } from '../lib/orchestrator';
import { getFreshAccessToken } from '../lib/tiktok-auth';
import { signedUrl } from '../lib/storage';
import { QUEUE_NAMES, logger, IntegrationError } from '@viralytic/shared';

// TikTok pulls the video server-side; give it a comfortably long window.
const VIDEO_URL_TTL = 24 * 60 * 60;

// PULL_FROM_URL publishing is async on TikTok's side; poll the status endpoint
// until the post is live or fails.
const MAX_POLLS = 18;
const POLL_INTERVAL_MS = 10_000;

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
      .select('storage_path')
      .eq('job_id', jobId)
      .eq('type', 'final_video')
      .single();
    if (!asset) throw new IntegrationError('NO_FINAL_VIDEO', 'No final video asset to publish', { jobId });

    const videoUrl = await signedUrl(db, asset.storage_path, VIDEO_URL_TTL);

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

/** Combine caption text with hashtags, capped to TikTok's title limit. */
function buildCaption(caption: string | null, hashtags: string[] | null): string {
  const tags = (hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  return `${caption ?? ''}${tags ? `\n\n${tags}` : ''}`.slice(0, 2200);
}

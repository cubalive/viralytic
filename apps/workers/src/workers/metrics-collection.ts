import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload } from '../queues';
import { tiktok } from '@viralytic/integrations';
import { embedText } from '@viralytic/ai';
import { getServiceClient } from '@viralytic/db';
import { recordUsage } from '../lib/orchestrator';
import { getFreshAccessToken } from '../lib/tiktok-auth';
import { QUEUE_NAMES, logger, LEARNING } from '@viralytic/shared';

/**
 * Step 8 — Collect performance metrics for a published video (cron, every 6h).
 *
 * Queries TikTok for views/likes/comments/shares, appends a metrics row (time
 * series), and runs the learning loop: when a video clears the winner bar, its
 * selected script is embedded so future script generation can retrieve it as a
 * historical winner.
 */
export const metricsCollectionWorker = new Worker<JobPayload['metricsCollection']>(
  QUEUE_NAMES.metricsCollection,
  async (job: Job<JobPayload['metricsCollection']>) => {
    const { publicationId } = job.data;
    const db = getServiceClient();

    const { data: pub } = await db
      .from('publications')
      .select('id, status, tiktok_post_id, tiktok_account_id, job_id')
      .eq('id', publicationId)
      .single();
    if (!pub) {
      logger.warn({ publicationId }, 'metrics.no_publication.skip');
      return { skipped: true };
    }
    if (!pub.tiktok_post_id || !pub.tiktok_account_id) {
      logger.info({ publicationId }, 'metrics.not_posted_yet.skip');
      return { skipped: true };
    }

    const { data: account } = await db
      .from('tiktok_accounts')
      .select('id, access_token_encrypted, refresh_token_encrypted, expires_at')
      .eq('id', pub.tiktok_account_id)
      .single();
    if (!account) {
      logger.warn({ publicationId, accountId: pub.tiktok_account_id }, 'metrics.no_account.skip');
      return { skipped: true };
    }

    const accessToken = await getFreshAccessToken(db, account);
    const results = await tiktok.getVideoMetrics(accessToken, [pub.tiktok_post_id]);
    const m = results.find((r) => r.videoId === pub.tiktok_post_id) ?? results[0];
    if (!m) {
      logger.info({ publicationId, postId: pub.tiktok_post_id }, 'metrics.no_data.skip');
      return { skipped: true };
    }

    // Append a time-series metrics row.
    await db.from('metrics').insert({
      publication_id: pub.id,
      views: m.views,
      likes: m.likes,
      comments: m.comments,
      shares: m.shares,
    });

    logger.info({ publicationId, views: m.views, likes: m.likes }, 'metrics.collected');

    // Learning loop: embed the winning script so it grounds future generations.
    let embedded = false;
    if (m.views >= LEARNING.winnerMinViews && pub.job_id) {
      embedded = await embedWinningScript(db, pub.job_id);
    }

    return { views: m.views, likes: m.likes, comments: m.comments, shares: m.shares, embedded };
  },
  { ...WORKER_DEFAULTS, concurrency: 5 },
);

metricsCollectionWorker.on('failed', (job, err) => {
  if (job) logger.error({ publicationId: job.data.publicationId, err }, 'metrics.worker.failed');
});

/**
 * Embed the job's selected script (once) so future script generation can
 * retrieve it via pgvector as a historical winner. Returns whether it embedded.
 */
async function embedWinningScript(
  db: ReturnType<typeof getServiceClient>,
  jobId: string,
): Promise<boolean> {
  const { data: script } = await db
    .from('scripts')
    .select('id, full_text, embedding')
    .eq('job_id', jobId)
    .eq('selected', true)
    .maybeSingle();
  if (!script || script.embedding || !script.full_text) return false;

  try {
    const { vector, costCents } = await embedText(script.full_text);
    await db.from('scripts').update({ embedding: JSON.stringify(vector) }).eq('id', script.id);

    const { data: vj } = await db
      .from('video_jobs')
      .select('organization_id')
      .eq('id', jobId)
      .single();
    if (vj?.organization_id) {
      await recordUsage({
        organizationId: vj.organization_id,
        jobId,
        type: 'learning_embedding',
        quantity: 1,
        costCents,
      });
    }
    logger.info({ jobId, scriptId: script.id }, 'metrics.winner.embedded');
    return true;
  } catch (err) {
    logger.warn({ err, jobId }, 'metrics.winner.embed_failed');
    return false;
  }
}

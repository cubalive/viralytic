import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload } from '../queues';
import { tiktok } from '@viralytic/integrations';
import { getServiceClient } from '@viralytic/db';
import { setStatus } from '../lib/orchestrator';
import { QUEUE_NAMES, logger } from '@viralytic/shared';

export const publishingWorker = new Worker<JobPayload['publishing']>(
  QUEUE_NAMES.publishing,
  async (job: Job<JobPayload['publishing']>) => {
    const { jobId, tiktokAccountId } = job.data;
    const db = getServiceClient();

    const { data: account } = await db.from('tiktok_accounts').select('*').eq('id', tiktokAccountId).single();
    if (!account) throw new Error('TikTok account not found');

    const { data: pub } = await db.from('publications').select('*').eq('job_id', jobId).single();
    if (!pub) throw new Error('No publication record');

    // Get the final video URL from storage (public bucket)
    const { data: asset } = await db.from('assets')
      .select('public_url, storage_path')
      .eq('job_id', jobId).eq('type', 'final_video').single();
    if (!asset) throw new Error('No final video asset');

    const videoUrl = asset.public_url ?? db.storage.from('assets').getPublicUrl(asset.storage_path).data.publicUrl;

    // TODO: decrypt access_token_encrypted
    const accessToken = account.access_token_encrypted; // placeholder

    const { publishId } = await tiktok.postVideo({
      accessToken,
      videoUrl,
      caption: `${pub.caption}\n\n${(pub.hashtags ?? []).map((h: string) => `#${h}`).join(' ')}`,
    });

    await db.from('publications').update({
      status: 'posting',
      tiktok_post_id: publishId,
    }).eq('id', pub.id);

    await setStatus(jobId, 'posted');
    logger.info({ jobId, publishId }, 'tiktok.published');
  },
  WORKER_DEFAULTS,
);

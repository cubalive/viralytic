import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload } from '../queues';
import { QUEUE_NAMES, logger } from '@viralytic/shared';

export const metricsCollectionWorker = new Worker<JobPayload['metricsCollection']>(
  QUEUE_NAMES.metricsCollection,
  async (job: Job<JobPayload['metricsCollection']>) => {
    const { publicationId } = job.data;
    logger.info({ publicationId }, 'metrics.collect.stub');
    // TODO: TikTok GET /v2/research/video/query/ for views/likes/comments/shares
    // Write to metrics table. Feed into the learning loop (winners get embeddings).
  },
  { ...WORKER_DEFAULTS, concurrency: 5 },
);

import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload, queues } from '../queues';
import { getServiceClient } from '@viralytic/db';
import { setStatus } from '../lib/orchestrator';
import { logger, QUEUE_NAMES } from '@viralytic/shared';

/**
 * Find top viral TikToks for this product category, save with embeddings.
 * In production: uses TikTok scraper + OpenAI embeddings for the learning loop.
 * STUB: currently just enqueues script generation. Claude Code will flesh out.
 */
export const competitorResearchWorker = new Worker<JobPayload['competitorResearch']>(
  QUEUE_NAMES.competitorResearch,
  async (job: Job<JobPayload['competitorResearch']>) => {
    const { jobId, productId } = job.data;
    logger.info({ jobId, productId }, 'competitor.research.stub');

    // TODO: search top TikToks for this niche, save to competitor_videos with embeddings
    // For now, we proceed to script generation with whatever competitors exist
    await queues.scriptGeneration.add('generate', { jobId });
  },
  WORKER_DEFAULTS,
);

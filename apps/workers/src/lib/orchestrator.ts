import { queues } from '../queues';
import { getServiceClient } from '@viralytic/db';
import { logger } from '@viralytic/shared';

/**
 * Advance a video_job to its next step.
 *
 * Each worker, on success, calls this function. The orchestrator
 * reads the current state from DB, decides what's next, enqueues it,
 * and updates the job status. Workers don't make this decision.
 *
 * This keeps workers stateless and the pipeline order in ONE place.
 */
export async function advanceJob(jobId: string): Promise<void> {
  const db = getServiceClient();
  const { data: job, error } = await db
    .from('video_jobs').select('*').eq('id', jobId).single();

  if (error || !job) {
    logger.error({ jobId, error }, 'orchestrator.job.not_found');
    return;
  }

  const ctx = { jobId, status: job.status, mode: job.mode };
  logger.info(ctx, 'orchestrator.advance');

  switch (job.status) {
    case 'pending':
    case 'analyzing':
      await queues.productAnalysis.add('analyze', { jobId, productId: job.product_id });
      await setStatus(jobId, 'analyzing', 'product-analysis');
      break;

    case 'scripting': // moved to scripting after analysis
      await queues.competitorResearch.add('research', { jobId, productId: job.product_id });
      // when competitor research completes, it enqueues scriptGeneration itself
      break;

    case 'awaiting_script_selection':
      logger.info(ctx, 'orchestrator.waiting.user_select_script');
      break;

    case 'voicing':
      // scriptId is set when user picks variant; voice worker reads it
      await queues.voiceSynthesis.add('synthesize', { jobId, scriptId: 'selected' });
      break;

    case 'visualizing':
      await queues.visualGeneration.add('generate', { jobId });
      break;

    case 'awaiting_clips':
      logger.info(ctx, 'orchestrator.waiting.user_upload_clips');
      break;

    case 'assembling':
      await queues.videoAssembly.add('assemble', { jobId });
      break;

    case 'ready':
      // user can manually publish; or auto if scheduled
      if (job.scheduled_for) {
        const delay = new Date(job.scheduled_for).getTime() - Date.now();
        await queues.publishing.add('publish', { jobId, tiktokAccountId: job.tiktok_account_id }, { delay: Math.max(0, delay) });
        await setStatus(jobId, 'scheduled', 'publishing');
      }
      break;

    case 'scheduled':
    case 'posted':
    case 'failed':
    case 'cancelled':
      // terminal states
      break;
  }
}

export async function setStatus(jobId: string, status: string, currentStep?: string, errorMessage?: string) {
  const db = getServiceClient();
  await db.from('video_jobs').update({
    status,
    current_step: currentStep,
    error_message: errorMessage ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);
}

/** Record a usage event for billing/cost tracking */
export async function recordUsage(input: {
  organizationId: string;
  jobId?: string;
  type: string;
  quantity: number;
  costCents: number;
}) {
  const db = getServiceClient();
  await db.from('usage_events').insert({
    organization_id: input.organizationId,
    job_id: input.jobId,
    type: input.type,
    quantity: input.quantity,
    cost_cents: input.costCents,
  });
}

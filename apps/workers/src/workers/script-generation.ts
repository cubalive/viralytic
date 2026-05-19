import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload } from '../queues';
import { generateScripts } from '@viralytic/ai';
import { getServiceClient } from '@viralytic/db';
import { advanceJob, setStatus, recordUsage } from '../lib/orchestrator';
import { logger, QUEUE_NAMES, AIError } from '@viralytic/shared';

/**
 * Generates 3 ranked script variants for a job using the Claude+GPT+Judge ensemble.
 * On success, sets job to `awaiting_script_selection` so the user can pick.
 *
 * Idempotent: if scripts already exist for this job, returns early.
 */
export const scriptGenerationWorker = new Worker<JobPayload['scriptGeneration']>(
  QUEUE_NAMES.scriptGeneration,
  async (job: Job<JobPayload['scriptGeneration']>) => {
    const { jobId } = job.data;
    const db = getServiceClient();

    // Idempotency check
    const { count: existing } = await db
      .from('scripts').select('*', { count: 'exact', head: true }).eq('job_id', jobId);
    if (existing && existing > 0) {
      logger.info({ jobId, existing }, 'scripts.already_exist.skip');
      return { skipped: true };
    }

    // Load job + product + brand + competitor research
    const { data: videoJob } = await db.from('video_jobs').select(`
      id, organization_id, product_id, brand_id, voice_id, mode,
      products (*),
      brands (*)
    `).eq('id', jobId).single();

    if (!videoJob) throw new AIError('JOB_NOT_FOUND', 'Video job not found', { jobId });

    if (!videoJob.product_id) {
      throw new AIError('NO_PRODUCT', 'Video job has no product_id', { jobId });
    }

    const { data: competitors } = await db
      .from('competitor_videos')
      .select('*')
      .eq('product_id', videoJob.product_id)
      .order('views', { ascending: false })
      .limit(10);

    const { data: historicalWinners } = await db
      .from('scripts')
      .select('*, video_jobs!inner(organization_id, publications(metrics(views, conversions)))')
      .eq('video_jobs.organization_id', videoJob.organization_id)
      .eq('selected', true)
      .order('created_at', { ascending: false })
      .limit(5);

    const brand = (videoJob as any).brands;
    const product = (videoJob as any).products;

    await setStatus(jobId, 'scripting', 'script-generation');

    // === Run the ensemble ===
    const result = await generateScripts({
      product: {
        organizationId: videoJob.organization_id,
        sourceUrl: product.source_url,
        sourcePlatform: product.source_platform,
        title: product.title,
        price: product.price,
        currency: product.currency,
        description: product.description ?? '',
        features: product.features ?? [],
        painPoints: product.pain_points ?? [],
        positiveReviews: product.positive_reviews ?? [],
        images: product.images ?? [],
      },
      brand: {
        name: brand.name,
        tone: brand.tone ?? 'friendly',
        targetAudience: brand.target_audience ?? '',
        uniqueSellingPoints: brand.unique_selling_points ?? [],
        forbiddenWords: brand.forbidden_words ?? [],
        language: brand.language ?? 'es',
      },
      competitorScripts: (competitors ?? []).map(c => ({
        tiktokUrl: c.tiktok_url,
        hookText: c.hook_text ?? '',
        hookType: c.hook_type ?? 'curiosity_gap',
        transcript: c.transcript ?? '',
        durationSeconds: c.duration_seconds ?? 0,
        views: Number(c.views ?? 0),
        likes: Number(c.likes ?? 0),
        comments: Number(c.comments ?? 0),
        shares: Number(c.shares ?? 0),
        frameworkDetected: c.framework_detected ?? 'OTHER',
        viralityScore: 8,
      } as any)),
      historicalWinners: (historicalWinners ?? []).map(s => ({
        framework: s.framework,
        hook: s.hook,
        body: s.body,
        cta: s.cta,
        fullText: s.full_text,
        estimatedDurationSeconds: s.estimated_duration_seconds,
        emotionTags: s.emotion_tags ?? [],
        visualCues: s.visual_cues ?? [],
        predictedHookStrength: 8,
        whyThisWorks: '',
      } as any)),
    });

    // Save the top 3 ranked variants
    const rows = result.topVariants.map((v, i) => ({
      job_id: jobId,
      variant: i + 1,
      framework: v.framework,
      hook: v.hook,
      body: v.body,
      cta: v.cta,
      full_text: v.fullText,
      emotion_tags: v.emotionTags,
      visual_cues: v.visualCues,
      estimated_duration_seconds: v.estimatedDurationSeconds,
    }));
    await db.from('scripts').insert(rows);

    await recordUsage({
      organizationId: videoJob.organization_id,
      jobId,
      type: 'script_generation',
      quantity: 1,
      costCents: result.totalCostCents,
    });

    await setStatus(jobId, 'awaiting_script_selection');

    logger.info({ jobId, costCents: result.totalCostCents }, 'scripts.generated');
    return { variantCount: rows.length, costCents: result.totalCostCents };
  },
  WORKER_DEFAULTS,
);

scriptGenerationWorker.on('failed', async (job, err) => {
  if (job) {
    logger.error({ jobId: job.data.jobId, err }, 'script.worker.failed');
    await setStatus(job.data.jobId, 'failed', undefined, err.message);
  }
});

import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload } from '../queues';
import { generateVisualPlan, generateShotList } from '@viralytic/ai';
import { fal } from '@viralytic/integrations';
import { getServiceClient } from '@viralytic/db';
import { advanceJob, setStatus, recordUsage } from '../lib/orchestrator';
import { QUEUE_NAMES, logger } from '@viralytic/shared';

/**
 * For ai_full / hybrid: generate images & videos via fal.ai.
 * For user_filmed: generate a shot list and wait for user uploads.
 */
export const visualGenerationWorker = new Worker<JobPayload['visualGeneration']>(
  QUEUE_NAMES.visualGeneration,
  async (job: Job<JobPayload['visualGeneration']>) => {
    const { jobId } = job.data;
    const db = getServiceClient();

    const { data: videoJob } = await db.from('video_jobs').select(`
      *, products(*), brands(*)
    `).eq('id', jobId).single();
    if (!videoJob) throw new Error('Job not found');

    const { data: script } = await db.from('scripts')
      .select('*').eq('job_id', jobId).eq('selected', true).single();
    if (!script) throw new Error('No selected script');

    const product = (videoJob as any).products;
    const brand = (videoJob as any).brands;

    // ===== user_filmed mode: generate a shot list and stop =====
    if (videoJob.mode === 'user_filmed') {
      const shotList = await generateShotList({
        script: {
          framework: script.framework,
          hook: script.hook, body: script.body, cta: script.cta,
          fullText: script.full_text,
          estimatedDurationSeconds: script.estimated_duration_seconds,
          emotionTags: script.emotion_tags ?? [],
          visualCues: script.visual_cues ?? [],
          predictedHookStrength: 8,
          whyThisWorks: '',
        } as any,
        product: product as any,
        equipment: ['smartphone'],
        spaceDescription: 'home',
        skillLevel: 'beginner',
      });

      await db.from('shot_lists').insert({
        job_id: jobId,
        shots: shotList.data.shots,
        total_duration_seconds: shotList.data.totalDurationSeconds,
        notes: shotList.data.generalNotes,
      });

      await setStatus(jobId, 'awaiting_clips');
      logger.info({ jobId }, 'visual.shot_list.generated');
      return;
    }

    // ===== ai_full / hybrid: generate visuals =====
    const plan = await generateVisualPlan({
      script: script as any,
      product: product as any,
      visualMood: brand.tone ?? 'clean_premium',
      brandColors: brand.brand_colors?.colors ?? ['#000000', '#FFFFFF'],
      avoidList: brand.forbidden_words ?? [],
    });

    // Execute each asset generation in sequence (could be parallelized with care)
    let totalCost = 0;
    for (const asset of plan.data.assets) {
      if (asset.type === 'ai_image') {
        const img = await fal.generateImage({
          prompt: asset.prompt,
          negativePrompt: asset.negativePrompt,
          aspectRatio: '9:16',
          seed: asset.seed,
        });
        const buf = await fal.downloadAsset(img.url);
        const path = `jobs/${jobId}/visual_${asset.cueIndex}.png`;
        await db.storage.from('assets').upload(path, buf, { contentType: 'image/png', upsert: true });
        await db.from('assets').insert({
          organization_id: videoJob.organization_id,
          job_id: jobId, type: 'ai_image', provider: 'fal',
          storage_path: path, mime_type: 'image/png',
          width: img.width, height: img.height,
          metadata: { cueIndex: asset.cueIndex, timestamp: asset.timestampSeconds, prompt: asset.prompt },
        });
        totalCost += img.costCents;
      } else if (asset.type === 'ai_video') {
        const vid = await fal.generateVideo({
          prompt: asset.prompt,
          durationSeconds: asset.durationSeconds > 5 ? 10 : 5,
          aspectRatio: '9:16',
        });
        const buf = await fal.downloadAsset(vid.url);
        const path = `jobs/${jobId}/visual_${asset.cueIndex}.mp4`;
        await db.storage.from('assets').upload(path, buf, { contentType: 'video/mp4', upsert: true });
        await db.from('assets').insert({
          organization_id: videoJob.organization_id,
          job_id: jobId, type: 'ai_video', provider: 'fal',
          storage_path: path, mime_type: 'video/mp4',
          duration_seconds: vid.durationSeconds,
          metadata: { cueIndex: asset.cueIndex, timestamp: asset.timestampSeconds, prompt: asset.prompt },
        });
        totalCost += vid.costCents;
      }
    }

    await recordUsage({
      organizationId: videoJob.organization_id, jobId,
      type: 'visual_generation', quantity: plan.data.assets.length, costCents: totalCost,
    });

    await setStatus(jobId, 'assembling');
    await advanceJob(jobId);
  },
  { ...WORKER_DEFAULTS, concurrency: 2 },
);

import { Worker, Job } from 'bullmq';
import { promises as fs } from 'node:fs';
import { WORKER_DEFAULTS, type JobPayload } from '../queues';
import { renderTikTokVideo, type TikTokVideoProps } from '@viralytic/video';
import { getServiceClient } from '@viralytic/db';
import { advanceJob, setStatus, recordUsage } from '../lib/orchestrator';
import { QUEUE_NAMES, logger, VIDEO_CONFIG, PLAN_QUOTAS, IntegrationError } from '@viralytic/shared';

type Visual = TikTokVideoProps['visuals'][number];
type Caption = TikTokVideoProps['captions'][number];

/**
 * Step 6 — Assemble the final 9:16 MP4.
 *
 * Pulls the synthesized voiceover + generated visuals + selected script, builds
 * a Remotion timeline (visual track, evenly-timed captions, CTA, watermark for
 * free plans) and renders it via @viralytic/video. Uploads the result as a
 * `final_video` asset and advances the job to `ready`.
 *
 * Idempotent: if a final_video already exists, it advances without re-rendering.
 */
export const videoAssemblyWorker = new Worker<JobPayload['videoAssembly']>(
  QUEUE_NAMES.videoAssembly,
  async (job: Job<JobPayload['videoAssembly']>) => {
    const { jobId } = job.data;
    const db = getServiceClient();

    // Idempotency: already assembled?
    const { data: existingFinal } = await db
      .from('assets')
      .select('id')
      .eq('job_id', jobId)
      .eq('type', 'final_video')
      .maybeSingle();
    if (existingFinal) {
      logger.info({ jobId }, 'assembly.already_done.skip');
      await setStatus(jobId, 'ready');
      await advanceJob(jobId);
      return { skipped: true };
    }

    await setStatus(jobId, 'assembling', 'video-assembly');

    const { data: videoJob } = await db
      .from('video_jobs')
      .select('id, organization_id, organizations ( plan )')
      .eq('id', jobId)
      .single();
    if (!videoJob) throw new IntegrationError('JOB_NOT_FOUND', 'Video job not found', { jobId });
    const orgId = videoJob.organization_id;

    const { data: script } = await db
      .from('scripts')
      .select('*')
      .eq('job_id', jobId)
      .eq('selected', true)
      .single();
    if (!script) throw new IntegrationError('NO_SELECTED_SCRIPT', 'No selected script for assembly', { jobId });

    // Voice audio is required to assemble.
    const { data: voiceAsset } = await db
      .from('assets')
      .select('storage_path, public_url, duration_seconds')
      .eq('job_id', jobId)
      .eq('type', 'voice_audio')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!voiceAsset) throw new IntegrationError('NO_VOICE_ASSET', 'No voice audio to assemble', { jobId });

    // Visual assets, placed along the timeline.
    const { data: visualAssets } = await db
      .from('assets')
      .select('type, storage_path, public_url, duration_seconds, metadata')
      .eq('job_id', jobId)
      .in('type', ['ai_image', 'ai_video', 'user_clip']);

    const toPublicUrl = (storagePath: string, existing: string | null): string =>
      existing ?? db.storage.from('assets').getPublicUrl(storagePath).data.publicUrl;

    const durationSeconds =
      Number(script.estimated_duration_seconds) ||
      Number(voiceAsset.duration_seconds) ||
      VIDEO_CONFIG.optimalDurationSeconds;

    const visuals = buildVisualTrack(visualAssets ?? [], durationSeconds, toPublicUrl);
    const captions = buildCaptions(script.full_text ?? '', durationSeconds);

    const plan = ((videoJob as any).organizations?.plan ?? 'free') as keyof typeof PLAN_QUOTAS;
    const watermarkText = PLAN_QUOTAS[plan]?.watermark ? 'viralytic' : null;

    logger.info({ jobId, visuals: visuals.length, durationSeconds }, 'assembly.render.start');

    const outPath = await renderTikTokVideo({
      voiceUrl: toPublicUrl(voiceAsset.storage_path, voiceAsset.public_url),
      captions,
      visuals,
      ctaText: script.cta ?? 'Link in bio',
      durationSeconds,
      watermarkText,
    });

    // Upload the rendered MP4, then clean up the temp file.
    const buffer = await fs.readFile(outPath);
    const storagePath = `jobs/${jobId}/final.mp4`;
    const { error: upErr } = await db.storage
      .from('assets')
      .upload(storagePath, buffer, { contentType: 'video/mp4', upsert: true });
    if (upErr) throw new IntegrationError('UPLOAD_FAILED', upErr.message, { jobId, storagePath });
    await fs.unlink(outPath).catch(() => {});

    const publicUrl = db.storage.from('assets').getPublicUrl(storagePath).data.publicUrl;
    await db.from('assets').insert({
      organization_id: orgId,
      job_id: jobId,
      type: 'final_video',
      provider: 'remotion',
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: 'video/mp4',
      width: VIDEO_CONFIG.width,
      height: VIDEO_CONFIG.height,
      duration_seconds: durationSeconds,
      metadata: { script_id: script.id, visual_count: visuals.length },
    });

    await recordUsage({
      organizationId: orgId,
      jobId,
      type: 'video_assembly',
      quantity: 1,
      costCents: 0, // local Remotion render — compute only, no external API spend
    });

    await setStatus(jobId, 'ready');
    await advanceJob(jobId);
    logger.info({ jobId, sizeBytes: buffer.length }, 'assembly.done');
    return { storagePath, durationSeconds };
  },
  { ...WORKER_DEFAULTS, concurrency: 1 }, // rendering is heavy, serialize
);

videoAssemblyWorker.on('failed', async (job, err) => {
  if (job) {
    logger.error({ jobId: job.data.jobId, err }, 'assembly.worker.failed');
    await setStatus(job.data.jobId, 'failed', 'video-assembly', err.message);
  }
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

interface VisualAssetRow {
  type: string;
  storage_path: string;
  public_url: string | null;
  duration_seconds: number | null;
  metadata: any;
}

/** Order visuals by their planned timestamp and build a gapless timeline. */
function buildVisualTrack(
  assets: VisualAssetRow[],
  totalDuration: number,
  toPublicUrl: (storagePath: string, existing: string | null) => string,
): Visual[] {
  if (assets.length === 0) return [];
  const sorted = [...assets].sort(
    (a, b) => Number(a.metadata?.timestamp ?? 0) - Number(b.metadata?.timestamp ?? 0),
  );
  return sorted.map((a, i) => {
    const start = Number(a.metadata?.timestamp ?? (i * totalDuration) / sorted.length);
    const nextAsset = sorted[i + 1];
    const next = nextAsset
      ? Number(nextAsset.metadata?.timestamp ?? ((i + 1) * totalDuration) / sorted.length)
      : totalDuration;
    const durationSeconds = a.duration_seconds ? Number(a.duration_seconds) : Math.max(0.8, next - start);
    const type: Visual['type'] =
      a.type === 'ai_image' ? 'image' : a.type === 'user_clip' ? 'user_clip' : 'video';
    return {
      type,
      url: toPublicUrl(a.storage_path, a.public_url),
      startSeconds: start,
      durationSeconds,
    };
  });
}

/**
 * Evenly-timed ~3-word caption tokens across the voiceover. A Whisper-based
 * step can later replace this with true word-level timing; the Captions
 * component already consumes {text,start,end} tokens.
 */
function buildCaptions(fullText: string, totalDuration: number): Caption[] {
  const words = fullText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const groups: string[] = [];
  for (let i = 0; i < words.length; i += 3) groups.push(words.slice(i, i + 3).join(' '));
  const per = totalDuration / groups.length;
  return groups.map((text, i) => ({ text, start: i * per, end: (i + 1) * per }));
}

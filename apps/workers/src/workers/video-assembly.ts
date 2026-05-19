import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload } from '../queues';
import { logger, QUEUE_NAMES } from '@viralytic/shared';
import { setStatus, advanceJob } from '../lib/orchestrator';

/**
 * Assemble the final 9:16 video by invoking Remotion CLI / Lambda.
 * STUB: integrates with @viralytic/video package. Claude Code will wire CLI.
 */
export const videoAssemblyWorker = new Worker<JobPayload['videoAssembly']>(
  QUEUE_NAMES.videoAssembly,
  async (job: Job<JobPayload['videoAssembly']>) => {
    const { jobId } = job.data;
    logger.info({ jobId }, 'video.assembly.stub');

    // TODO: invoke `npx remotion render TikTokVideo out.mp4 --props=...`
    // OR call Remotion Lambda for parallel rendering
    // OR FFmpeg fallback (concat clips + add audio + burn subtitles)

    await setStatus(jobId, 'ready');
    await advanceJob(jobId);
  },
  { ...WORKER_DEFAULTS, concurrency: 1 }, // rendering is heavy, serialize
);

import { Worker, Job } from 'bullmq';
import { WORKER_DEFAULTS, type JobPayload } from '../queues';
import { elevenlabs } from '@viralytic/integrations';
import { getServiceClient } from '@viralytic/db';
import { advanceJob, setStatus, recordUsage } from '../lib/orchestrator';
import { logger, QUEUE_NAMES, IntegrationError } from '@viralytic/shared';

/**
 * Synthesize the selected script with the brand's cloned voice via ElevenLabs.
 * Uploads the audio to Supabase storage and writes an `assets` row.
 */
export const voiceSynthesisWorker = new Worker<JobPayload['voiceSynthesis']>(
  QUEUE_NAMES.voiceSynthesis,
  async (job: Job<JobPayload['voiceSynthesis']>) => {
    const { jobId } = job.data;
    const db = getServiceClient();

    const { data: videoJob } = await db.from('video_jobs').select(`
      id, organization_id, voice_id,
      voices(elevenlabs_voice_id, default_stability, default_similarity, default_style)
    `).eq('id', jobId).single();
    if (!videoJob) throw new IntegrationError('JOB_NOT_FOUND', '', { jobId });

    const { data: script } = await db.from('scripts')
      .select('*').eq('job_id', jobId).eq('selected', true).single();
    if (!script) throw new IntegrationError('NO_SELECTED_SCRIPT', 'No selected script', { jobId });

    await setStatus(jobId, 'voicing', 'voice-synthesis');

    const voice = (videoJob as any).voices;
    if (!voice?.elevenlabs_voice_id) {
      throw new IntegrationError('NO_VOICE', 'El job no tiene voz configurada', { jobId });
    }

    const result = await elevenlabs.synthesize({
      voiceId: voice.elevenlabs_voice_id,
      text: script.full_text,
      stability: voice.default_stability ?? 0.5,
      similarityBoost: voice.default_similarity ?? 0.75,
      style: voice.default_style ?? 0.3,
    });

    // Upload to Supabase storage
    const path = `jobs/${jobId}/voice.mp3`;
    const { error: upErr } = await db.storage.from('assets').upload(path, result.audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    });
    if (upErr) throw upErr;

    await db.from('assets').insert({
      organization_id: videoJob.organization_id,
      job_id: jobId,
      type: 'voice_audio',
      provider: 'elevenlabs',
      storage_path: path,
      mime_type: 'audio/mpeg',
      metadata: { script_id: script.id, characters: result.charactersUsed },
    });

    await recordUsage({
      organizationId: videoJob.organization_id,
      jobId, type: 'elevenlabs_chars',
      quantity: result.charactersUsed,
      costCents: result.costCents,
    });

    await setStatus(jobId, 'visualizing');
    await advanceJob(jobId);
    return { costCents: result.costCents };
  },
  WORKER_DEFAULTS,
);

voiceSynthesisWorker.on('failed', async (job, err) => {
  if (job) {
    logger.error({ jobId: job.data.jobId, err }, 'voice.worker.failed');
    await setStatus(job.data.jobId, 'failed', 'voice-synthesis', err.message);
  }
});

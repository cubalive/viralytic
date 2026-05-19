import { IntegrationError, logger, COSTS_CENTS } from '@viralytic/shared';

const API_BASE = 'https://www.revid.ai/api/public/v2';

export interface CreateRevidVideoInput {
  prompt: string;
  ratio?: '9 / 16' | '16 / 9' | '1 / 1';
  durationSeconds?: number;
  voiceUrl?: string;          // pre-generated voiceover URL
  captionPresetName?: 'BASIC' | 'REVID' | 'HORMOZI' | 'NOAH';
  hasVoiceover?: boolean;
  hasMusic?: boolean;
  generationPreset?: 'DEFAULT' | 'ANIME' | 'REALISTIC' | 'CARTOON' | 'CINEMATIC';
  webhookUrl?: string;
}

/**
 * Submit a video generation job to revid. Returns a project ID we poll for status.
 */
export async function createVideo(input: CreateRevidVideoInput): Promise<{ projectId: string }> {
  const body = {
    inputText: input.prompt,
    creationParams: {
      ratio: input.ratio ?? '9 / 16',
      generationPreset: input.generationPreset ?? 'CINEMATIC',
      hasVoiceover: input.hasVoiceover ?? !!input.voiceUrl,
      voiceUrl: input.voiceUrl,
      hasMusic: input.hasMusic ?? true,
      captionPresetName: input.captionPresetName ?? 'REVID',
      durationSeconds: input.durationSeconds,
    },
    webhook: input.webhookUrl,
  };

  const res = await fetch(`${API_BASE}/render`, {
    method: 'POST',
    headers: {
      'key': process.env.REVID_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new IntegrationError('REVID_CREATE', `revid create failed: ${res.status}`, { body: await res.text() });
  }

  const data = await res.json() as { pid: string };
  logger.info({ projectId: data.pid }, 'revid.video.created');
  return { projectId: data.pid };
}

export interface RevidStatusOutput {
  status: 'pending' | 'processing' | 'ready' | 'failed';
  videoUrl?: string;
  progress?: number;
  error?: string;
}

export async function getVideoStatus(projectId: string): Promise<RevidStatusOutput> {
  const res = await fetch(`${API_BASE}/status?pid=${projectId}`, {
    headers: { 'key': process.env.REVID_API_KEY! },
  });
  if (!res.ok) throw new IntegrationError('REVID_STATUS', `revid status failed: ${res.status}`);
  const data = await res.json() as {
    status: string;
    videoUrl?: string;
    progress?: number;
    error?: string;
  };
  return {
    status: data.status as RevidStatusOutput['status'],
    videoUrl: data.videoUrl,
    progress: data.progress,
    error: data.error,
  };
}

/** Poll until ready (with exponential backoff). Use webhooks in prod for efficiency. */
export async function waitForVideo(projectId: string, opts: { timeoutMs?: number } = {}): Promise<RevidStatusOutput> {
  const start = Date.now();
  const timeout = opts.timeoutMs ?? 10 * 60 * 1000;
  let delay = 5000;

  while (Date.now() - start < timeout) {
    const status = await getVideoStatus(projectId);
    if (status.status === 'ready' || status.status === 'failed') return status;
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 1.3, 30000);
  }
  throw new IntegrationError('REVID_TIMEOUT', `revid video ${projectId} timed out`);
}

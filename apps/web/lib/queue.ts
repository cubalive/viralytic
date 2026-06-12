// Web → workers bridge. The web app does NOT use BullMQ directly.
// Instead it POSTs to the internal /enqueue endpoint that workers expose.
// This keeps bullmq and ioredis out of Next.js bundles entirely.

async function postEnqueue(payload: Record<string, unknown>): Promise<void> {
  const workersUrl = process.env.WORKERS_URL ?? 'http://localhost:4001';
  const secret = process.env.ENQUEUE_SECRET;
  if (!secret) {
    throw new Error('ENQUEUE_SECRET is not set in the web environment');
  }

  const res = await fetch(`${workersUrl}/enqueue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-enqueue-secret': secret },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`workers enqueue failed: ${res.status} ${text}`);
  }
}

export async function enqueueProductAnalysis(payload: {
  jobId: string;
  productId: string;
}): Promise<void> {
  await postEnqueue({ queue: 'productAnalysis', jobId: payload.jobId, productId: payload.productId });
}

export async function enqueueVoiceSynthesis(payload: {
  jobId: string;
  scriptId: string;
}): Promise<void> {
  await postEnqueue({ queue: 'voiceSynthesis', jobId: payload.jobId, scriptId: payload.scriptId });
}

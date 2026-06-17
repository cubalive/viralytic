'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';

const MODES = ['tech', 'music', 'kids'] as const;
type Mode = (typeof MODES)[number];

/**
 * Create a reel and queue it for the reels-poll worker (status='generating').
 * No upload step — the topic/mood is all the engine needs. channel_id is
 * optional at creation; the cron only publishes once a connected channel is set.
 */
export async function createReel(formData: FormData): Promise<void> {
  const { orgId, db } = await requireAdmin();
  const mode = String(formData.get('mode') ?? 'tech') as Mode;
  const topic = String(formData.get('topic') ?? '').trim();
  const channelId = String(formData.get('channelId') ?? '').trim() || null;
  if (!MODES.includes(mode) || !topic) return;

  await db.from('mv_reels').insert({
    organization_id: orgId,
    mode,
    topic,
    channel_id: channelId,
    status: 'generating',
  });
  revalidatePath('/reels');
}

/** Delete a reel (any state) — org-scoped. */
export async function deleteReel(formData: FormData): Promise<void> {
  const { orgId, db } = await requireAdmin();
  const id = String(formData.get('reelId') ?? '');
  if (!id) return;
  await db.from('mv_reels').delete().eq('id', id).eq('organization_id', orgId);
  revalidatePath('/reels');
}

/** Re-queue a failed reel. */
export async function retryReel(formData: FormData): Promise<void> {
  const { orgId, db } = await requireAdmin();
  const id = String(formData.get('reelId') ?? '');
  if (!id) return;
  await db.from('mv_reels').update({ status: 'generating', error: null })
    .eq('id', id).eq('organization_id', orgId).eq('status', 'failed');
  revalidatePath('/reels');
}

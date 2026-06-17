'use server';

import { revalidatePath } from 'next/cache';
import { youtube } from '@viralytic/integrations';
import { requireAdmin } from '@/lib/admin';

/**
 * Audit every connected channel by forcing a real token refresh against Google.
 * Updates each connection_status to 'connected' or 'expired' (truthful, not
 * last-known) and returns a per-channel verdict so the admin can confirm that
 * ALL networks hold a live, permanent token.
 */
export async function verifyAllConnections(): Promise<{
  ok: number;
  expired: number;
  results: { channelId: string; handle: string | null; ok: boolean; title?: string | null; error?: string }[];
}> {
  const { db, orgId } = await requireAdmin();

  const { data: channels } = await db
    .from('mv_channels')
    .select(
      'id, youtube_handle, mv_projects!inner(organization_id), ' +
        'mv_youtube_connections(id, channel_id, youtube_channel_id, refresh_token_encrypted, access_token_encrypted, token_expiry)',
    )
    .eq('mv_projects.organization_id', orgId);

  const results: { channelId: string; handle: string | null; ok: boolean; title?: string | null; error?: string }[] = [];
  for (const c of (channels ?? []) as any[]) {
    const conn = Array.isArray(c.mv_youtube_connections) ? c.mv_youtube_connections[0] : c.mv_youtube_connections;
    if (!conn?.refresh_token_encrypted) {
      results.push({ channelId: c.id, handle: c.youtube_handle ?? null, ok: false, error: 'sin conexión' });
      continue;
    }
    const verdict = await youtube.verifyConnection(db as any, conn);
    results.push({ channelId: c.id, handle: c.youtube_handle ?? null, ...verdict });
  }

  revalidatePath('/connections');
  return {
    ok: results.filter((r) => r.ok).length,
    expired: results.filter((r) => !r.ok).length,
    results,
  };
}

import { getServiceClient } from '@viralytic/db';
import { IntegrationError } from '@viralytic/shared';

export const ASSETS_BUCKET = 'assets';

/**
 * Create a time-limited signed URL for an object in the private `assets`
 * bucket. Signed URLs expire, so callers generate them on demand (at render
 * and publish time) rather than persisting them.
 */
export async function signedUrl(
  db: ReturnType<typeof getServiceClient>,
  storagePath: string,
  expiresInSeconds: number,
): Promise<string> {
  const { data, error } = await db.storage
    .from(ASSETS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new IntegrationError(
      'SIGNED_URL_FAILED',
      error?.message ?? 'createSignedUrl returned no url',
      { storagePath },
    );
  }
  return data.signedUrl;
}

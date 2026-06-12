import { tiktok } from '@viralytic/integrations';
import { getServiceClient } from '@viralytic/db';
import { encrypt, decrypt, logger } from '@viralytic/shared';

const TOKEN_REFRESH_BUFFER_MS = 60_000;

export interface TikTokAccountTokens {
  id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at: string | null;
}

/**
 * Return a valid TikTok access token for an account, refreshing and persisting
 * the rotated tokens first if the stored one is expired (or about to expire).
 * Shared by the publishing and metrics-collection workers.
 */
export async function getFreshAccessToken(
  db: ReturnType<typeof getServiceClient>,
  account: TikTokAccountTokens,
): Promise<string> {
  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;
  const stillValid = expiresAt - TOKEN_REFRESH_BUFFER_MS > Date.now();
  if (stillValid) return decrypt(account.access_token_encrypted);

  const refreshed = await tiktok.refreshAccessToken(decrypt(account.refresh_token_encrypted));
  await db
    .from('tiktok_accounts')
    .update({
      access_token_encrypted: encrypt(refreshed.accessToken),
      refresh_token_encrypted: encrypt(refreshed.refreshToken),
      expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
    })
    .eq('id', account.id);
  logger.info({ accountId: account.id }, 'tiktok.token.refreshed');
  return refreshed.accessToken;
}

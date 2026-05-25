// Symmetric encryption for secrets at rest (e.g. TikTok OAuth tokens).
// AES-256-GCM (authenticated): tampering or a wrong key fails loudly on decrypt.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { BaseError } from './errors';

export class CryptoError extends BaseError {}

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96-bit nonce, recommended for GCM
const AUTH_TAG_BYTES = 16;
const SEPARATOR = ':';

/** Load + validate ENCRYPTION_KEY (32 bytes, base64). Throws if missing/wrong size. */
function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new CryptoError(
      'CRYPTO_KEY_MISSING',
      'ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32'
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new CryptoError(
      'CRYPTO_KEY_INVALID',
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes. Generate one with: openssl rand -base64 32`,
      { decodedBytes: key.length }
    );
  }
  return key;
}

/**
 * Encrypt UTF-8 plaintext with AES-256-GCM.
 * @returns `iv:authTag:ciphertext`, each segment base64-encoded.
 */
export function encrypt(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(SEPARATOR);
}

/**
 * Decrypt a value produced by {@link encrypt}.
 * Throws {@link CryptoError} if the format is malformed or auth fails (wrong key / tampered).
 */
export function decrypt(encrypted: string): string {
  const key = loadKey();
  const parts = encrypted.split(SEPARATOR);
  if (parts.length !== 3) {
    throw new CryptoError(
      'CRYPTO_FORMAT_INVALID',
      'Encrypted value must be "iv:authTag:ciphertext"'
    );
  }
  const iv = Buffer.from(parts[0]!, 'base64');
  const authTag = Buffer.from(parts[1]!, 'base64');
  const ciphertext = Buffer.from(parts[2]!, 'base64');
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new CryptoError('CRYPTO_FORMAT_INVALID', 'Malformed iv or authTag length');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    throw new CryptoError(
      'CRYPTO_DECRYPT_FAILED',
      'Decryption failed (wrong key or tampered ciphertext)',
      {},
      err instanceof Error ? err : undefined
    );
  }
}

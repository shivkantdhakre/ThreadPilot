import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;    // 96-bit IV for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag

/**
 * TokenEncryptionService — AES-256-GCM encryption for OAuth tokens.
 *
 * Storage format: "{keyVersion}:{base64(iv + authTag + ciphertext)}"
 * The keyVersion prefix enables key rotation: old tokens still decrypt
 * because we can look up the key by version.
 *
 * This is the only place encryption/decryption occurs.
 * Never import this class outside of packages/threads-client.
 */
export class TokenEncryptionService {
  private readonly key: Buffer;
  private readonly keyVersion: number;

  constructor(keyBase64: string, keyVersion: number) {
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be exactly 32 bytes (base64-encoded)');
    }
    this.keyVersion = keyVersion;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Concatenate: iv (12) + authTag (16) + ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return `${this.keyVersion}:${combined.toString('base64')}`;
  }

  decrypt(stored: string): string {
    const colonIdx = stored.indexOf(':');
    if (colonIdx === -1) throw new Error('Invalid encrypted token format');
    const version = parseInt(stored.slice(0, colonIdx), 10);
    const payload = stored.slice(colonIdx + 1);

    // Future: look up archived key by version for rotation
    if (version !== this.keyVersion) {
      throw new Error(
        `Token encrypted with key version ${version}, current version is ${this.keyVersion}. ` +
        `Key rotation not yet implemented — decrypt with the original key first.`,
      );
    }

    const combined = Buffer.from(payload, 'base64');
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  }
}

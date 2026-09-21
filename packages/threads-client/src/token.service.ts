import { TokenEncryptionService } from './token-encryption.service';
import { createLogger } from '@threadpilot/observability';
import type { PrismaClient } from '@threadpilot/database';

const logger = createLogger({ service: 'ThreadsTokenService' });
const REFRESH_THRESHOLD_DAYS = 7;
const LOCK_TTL_SECONDS = 30;

/**
 * ThreadsTokenService — lazy + proactive token refresh with concurrency protection.
 *
 * Redis lock (tp:token-refresh:{socialAccountId}) ensures only one process
 * refreshes a token at a time, preventing duplicate API calls.
 */
export class ThreadsTokenService {
  constructor(
    private readonly db: PrismaClient,
    private readonly encryption: TokenEncryptionService,
    private readonly redis: {
      set: (key: string, value: string, options: { nx: boolean; ex: number }) => Promise<string | null>;
      del: (key: string) => Promise<number>;
    },
    private readonly apiBaseUrl: string,
    public readonly appId: string = '',
    public readonly appSecret: string = '',
  ) {}

  /**
   * Returns a valid decrypted access token, refreshing if expiring within 7 days.
   * Acquires a Redis lock before refreshing to prevent concurrent refresh races.
   */
  async getValidToken(socialAccountId: string): Promise<string> {
    const token = await this.db.oAuthToken.findUniqueOrThrow({
      where: { socialAccountId },
    });

    if (token.revokedAt) {
      throw new Error(`Token for account ${socialAccountId} has been revoked`);
    }

    const daysUntilExpiry = (token.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    if (daysUntilExpiry > REFRESH_THRESHOLD_DAYS) {
      return this.encryption.decrypt(token.accessTokenEncrypted);
    }

    // Token expiring soon — acquire lock before refreshing
    const lockKey = `token-refresh:${socialAccountId}`;
    const acquired = await this.redis.set(lockKey, '1', { nx: true, ex: LOCK_TTL_SECONDS });

    if (!acquired) {
      // Another process holds the lock — read fresh token from DB
      logger.info({ socialAccountId }, 'Token refresh lock held by another process, reading DB');
      const freshToken = await this.db.oAuthToken.findUniqueOrThrow({
        where: { socialAccountId },
      });
      return this.encryption.decrypt(freshToken.accessTokenEncrypted);
    }

    try {
      await this.refresh(socialAccountId);
      const refreshed = await this.db.oAuthToken.findUniqueOrThrow({
        where: { socialAccountId },
      });
      return this.encryption.decrypt(refreshed.accessTokenEncrypted);
    } finally {
      await this.redis.del(lockKey);
    }
  }

  async refresh(socialAccountId: string): Promise<void> {
    const token = await this.db.oAuthToken.findUniqueOrThrow({
      where: { socialAccountId },
    });

    const currentAccessToken = this.encryption.decrypt(token.accessTokenEncrypted);
    if (!currentAccessToken) {
      throw new Error(`No access token available for account ${socialAccountId}`);
    }

    const refreshUrl = `${this.apiBaseUrl}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(
      currentAccessToken,
    )}`;

    const response = await fetch(refreshUrl, {
      method: 'GET',
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${body}`);
    }

    type RefreshResponse = { access_token: string; token_type?: string; expires_in?: number };
    const refreshed = (await response.json()) as RefreshResponse;

    const expiresAt = new Date(
      Date.now() + (refreshed.expires_in ?? 60 * 24 * 60 * 60) * 1000,
    );

    await this.db.oAuthToken.update({
      where: { socialAccountId },
      data: {
        accessTokenEncrypted: this.encryption.encrypt(refreshed.access_token),
        expiresAt,
        lastRefreshedAt: new Date(),
      },
    });

    logger.info({ socialAccountId }, 'Token refreshed successfully');
  }

  async revoke(socialAccountId: string): Promise<void> {
    await this.db.oAuthToken.update({
      where: { socialAccountId },
      data: { revokedAt: new Date() },
    });
  }
}

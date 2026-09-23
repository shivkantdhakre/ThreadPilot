import { TokenEncryptionService } from './token-encryption.service';
import { createLogger } from '@threadpilot/observability';
import type { PrismaClient } from '@threadpilot/database';

const logger = createLogger({ service: 'ThreadsTokenService' });
const REFRESH_THRESHOLD_DAYS = 7;
const LOCK_TTL_SECONDS = 30;
const POLL_INTERVAL_MS = 50;
const MAX_WAIT_MS = 10000;

export interface TokenServiceRedisAdapter {
  set: (
    key: string,
    value: string,
    options: { nx?: boolean; ex?: number },
  ) => Promise<string | null>;
  del: (key: string) => Promise<number>;
  get?: (key: string) => Promise<string | null>;
}

/**
 * ThreadsTokenService — lazy + proactive token refresh with concurrency protection.
 *
 * Redis lock (token-refresh:{socialAccountId}) ensures only one process
 * refreshes a token at a time, preventing duplicate API calls.
 * Concurrent callers wait for the active refresh to complete so all callers
 * receive the identical refreshed token rather than a stale token.
 */
export class ThreadsTokenService {
  constructor(
    private readonly db: PrismaClient,
    private readonly encryption: TokenEncryptionService,
    private readonly redis: TokenServiceRedisAdapter,
    private readonly apiBaseUrl: string,
    public readonly appId: string = '',
    public readonly appSecret: string = '',
  ) {}

  /**
   * Returns a valid decrypted access token, refreshing if expiring within 7 days.
   * Acquires a Redis lock before refreshing to prevent concurrent refresh races.
   * If another worker holds the lock, waits with bounded polling until the fresh token
   * is available, ensuring all concurrent callers receive the identical fresh token.
   */
  async getValidToken(socialAccountId: string): Promise<string> {
    const token = await this.db.oAuthToken.findUnique({
      where: { socialAccountId },
    });

    if (!token) {
      throw new Error(`No OAuth token found for account ${socialAccountId}`);
    }

    if (token.revokedAt) {
      throw new Error(`Token for account ${socialAccountId} has been revoked`);
    }

    const daysUntilExpiry = (token.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    if (daysUntilExpiry > REFRESH_THRESHOLD_DAYS) {
      return this.encryption.decrypt(token.accessTokenEncrypted);
    }

    // Token expiring soon — acquire lock before refreshing
    const lockKey = `token-refresh:${socialAccountId}`;
    const errorKey = `token-refresh-err:${socialAccountId}`;

    const acquired = await this.redis.set(lockKey, '1', { nx: true, ex: LOCK_TTL_SECONDS });

    if (!acquired) {
      // Another process holds the lock — wait bounded time for completion
      logger.info({ socialAccountId }, 'Token refresh lock held by another process, awaiting completion');
      const startTime = Date.now();

      while (Date.now() - startTime < MAX_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        // Check if an error was recorded by the refreshing worker
        if (this.redis.get) {
          const recordedError = await this.redis.get(errorKey);
          if (recordedError) {
            throw new Error(`Token refresh failed: ${recordedError}`);
          }
        }

        // Check if the lock was released
        const isLockHeld = this.redis.get
          ? (await this.redis.get(lockKey)) !== null
          : (await this.redis.set(lockKey, '1', { nx: true, ex: LOCK_TTL_SECONDS })) === null;

        if (!isLockHeld) {
          // Lock released! Re-check if an error was recorded right before release
          if (this.redis.get) {
            const recordedError = await this.redis.get(errorKey);
            if (recordedError) {
              throw new Error(`Token refresh failed: ${recordedError}`);
            }
          }

          // Re-read token from DB
          const candidateToken = await this.db.oAuthToken.findUnique({
            where: { socialAccountId },
          });
          if (!candidateToken) {
            throw new Error(`No OAuth token found for account ${socialAccountId}`);
          }
          if (candidateToken.revokedAt) {
            throw new Error(`Token for account ${socialAccountId} has been revoked`);
          }

          const candidateDays =
            (candidateToken.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          if (candidateDays > REFRESH_THRESHOLD_DAYS) {
            // Successfully refreshed by the other worker!
            return this.encryption.decrypt(candidateToken.accessTokenEncrypted);
          }

          // If lock was released but token was not refreshed (e.g. crash or expired lock),
          // attempt to acquire lock ourselves
          const retryAcquired = await this.redis.set(lockKey, '1', {
            nx: true,
            ex: LOCK_TTL_SECONDS,
          });
          if (retryAcquired) {
            break;
          }
        }
      }

      // Check whether token was refreshed during our wait
      const postWaitToken = await this.db.oAuthToken.findUnique({
        where: { socialAccountId },
      });
      if (postWaitToken) {
        const postWaitDays =
          (postWaitToken.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (postWaitDays > REFRESH_THRESHOLD_DAYS) {
          return this.encryption.decrypt(postWaitToken.accessTokenEncrypted);
        }
      }

      // Check if we hold the lock now from retryAcquired
      const weHoldLock = this.redis.get ? (await this.redis.get(lockKey)) !== null : false;
      if (!weHoldLock) {
        throw new Error(
          `Timed out waiting for concurrent token refresh for account ${socialAccountId}`,
        );
      }
    }

    // We hold the lock: clear any prior errorKey
    try {
      await this.redis.del(errorKey);
    } catch {
      // Non-blocking
    }

    try {
      await this.refresh(socialAccountId);
      const refreshed = await this.db.oAuthToken.findUniqueOrThrow({
        where: { socialAccountId },
      });
      return this.encryption.decrypt(refreshed.accessTokenEncrypted);
    } catch (err: any) {
      // Record error for concurrent waiting callers before releasing lock
      const errorMsg = err?.message || String(err);
      try {
        await this.redis.set(errorKey, errorMsg, { nx: false, ex: 5 });
      } catch {
        // Non-blocking
      }
      throw err;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  async refresh(socialAccountId: string): Promise<void> {
    const token = await this.db.oAuthToken.findUnique({
      where: { socialAccountId },
    });

    if (!token) {
      throw new Error(`No OAuth token found for account ${socialAccountId}`);
    }

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

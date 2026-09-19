import { ThreadsApiClient } from './threads-api.client';
import { createLogger } from '@threadpilot/observability';
import type { PrismaClient } from '@threadpilot/database';

const logger = createLogger({ service: 'ThreadsRateLimitService' });
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // sync live quota every 5 minutes

/**
 * ThreadsRateLimitService
 *
 * Primary: live Threads Publishing Limit endpoint (GET /me/threads_publishing_limit).
 * Secondary: local DB counters for concurrent worker coordination.
 *
 * Limits from env config are fallback only when live endpoint is unavailable.
 * Rate limit env vars (THREADS_POST_RATE_LIMIT_PER_24H) are soft config defaults,
 * not authoritative — the platform is authoritative.
 */
export class ThreadsRateLimitService {
  private readonly postLimitDefault: number;
  private readonly replyLimitDefault: number;

  constructor(
    private readonly db: PrismaClient,
    private readonly threadsApi: ThreadsApiClient,
    config: {
      postLimitDefault: number;   // THREADS_POST_RATE_LIMIT_PER_24H
      replyLimitDefault: number;  // THREADS_REPLY_RATE_LIMIT_PER_24H
    },
  ) {
    this.postLimitDefault = config.postLimitDefault;
    this.replyLimitDefault = config.replyLimitDefault;
  }

  /**
   * Sync live quota from Threads Publishing Limit endpoint.
   * Updates PlatformRateLimit row with authoritative values.
   */
  async syncLiveQuota(socialAccountId: string, accessToken: string): Promise<void> {
    try {
      const quota = await this.threadsApi.getPublishingLimit(accessToken);

      const windowDurationMs = quota.config.quota_duration * 1000;
      const resetAt = new Date(Date.now() + windowDurationMs);
      const lastSyncedAt = new Date();

      await this.db.platformRateLimit.upsert({
        where: { socialAccountId_category: { socialAccountId, category: 'post' } },
        update: {
          limitValue: quota.config.quota_total,
          used: quota.quota_usage,
          remaining: quota.config.quota_total - quota.quota_usage,
          resetAt,
          lastSyncedAt,
        },
        create: {
          socialAccountId,
          category: 'post',
          limitValue: quota.config.quota_total,
          used: quota.quota_usage,
          remaining: quota.config.quota_total - quota.quota_usage,
          resetAt,
          lastSyncedAt,
        },
      });

      if (quota.reply_quota_usage !== undefined && quota.reply_config) {
        await this.db.platformRateLimit.upsert({
          where: { socialAccountId_category: { socialAccountId, category: 'reply' } },
          update: {
            limitValue: quota.reply_config.quota_total,
            used: quota.reply_quota_usage,
            remaining: quota.reply_config.quota_total - quota.reply_quota_usage,
            resetAt,
            lastSyncedAt,
          },
          create: {
            socialAccountId,
            category: 'reply',
            limitValue: quota.reply_config.quota_total,
            used: quota.reply_quota_usage,
            remaining: quota.reply_config.quota_total - quota.reply_quota_usage,
            resetAt,
            lastSyncedAt,
          },
        });
      }

      logger.info({ socialAccountId }, 'Live quota synced from Threads API');
    } catch (error) {
      logger.warn({ socialAccountId, error }, 'Failed to sync live quota — using cached values');
    }
  }

  async checkAndConsume(
    socialAccountId: string,
    category: 'post' | 'reply',
    accessToken: string,
  ): Promise<{ allowed: boolean; remaining: number }> {
    // Sync if stale
    const existing = await this.db.platformRateLimit.findUnique({
      where: { socialAccountId_category: { socialAccountId, category } },
    });

    const isStale =
      !existing ||
      Date.now() - existing.lastSyncedAt.getTime() > SYNC_INTERVAL_MS;

    if (isStale) {
      await this.syncLiveQuota(socialAccountId, accessToken);
    }

    const limit = await this.db.platformRateLimit.findUnique({
      where: { socialAccountId_category: { socialAccountId, category } },
    });

    const remaining = limit?.remaining ?? this.getDefaultLimit(category);

    if (remaining <= 0) {
      return { allowed: false, remaining: 0 };
    }

    // Decrement remaining counter
    await this.db.platformRateLimit.update({
      where: { socialAccountId_category: { socialAccountId, category } },
      data: {
        used: { increment: 1 },
        remaining: { decrement: 1 },
      },
    });

    return { allowed: true, remaining: remaining - 1 };
  }

  private getDefaultLimit(category: 'post' | 'reply'): number {
    return category === 'post' ? this.postLimitDefault : this.replyLimitDefault;
  }
}

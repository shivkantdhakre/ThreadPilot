import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { prisma, PrismaClient } from '@threadpilot/database';
import {
  ENGAGEMENT_QUEUES,
  canonicalOutboundText,
} from '@threadpilot/types';
import { PublishingService } from './publishing.service';
import { EditorialPersonalizationService } from './editorial-personalization.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { randomUUID } from 'crypto';

@Injectable()
export class EngagementReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EngagementReconciliationService.name);
  private isRunning = false;
  private isDestroyed = false;
  private timer?: NodeJS.Timeout;
  private readonly leaderToken = randomUUID();
  private static readonly LEASE_KEY = 'tp:eng-reconcile-leader';
  private static readonly SCAN_INTERVAL_MS = 30_000;
  private static readonly LEADER_LEASE_MS = 60_000;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(ENGAGEMENT_QUEUES.REPLY_PUBLISH) private readonly publishQueue: Queue,
    @InjectQueue(ENGAGEMENT_QUEUES.ENGAGEMENT_CLASSIFY) private readonly classifyQueue: Queue,
    @InjectQueue(ENGAGEMENT_QUEUES.ENGAGEMENT_INGEST) private readonly ingestQueue: Queue,
    private readonly publishingService: PublishingService,
    @Optional() private readonly db: PrismaClient = prisma,
    @Optional() private readonly editorialService?: EditorialPersonalizationService,
  ) {}

  onModuleInit() {
    this.scheduleNext(5_000);
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext(delayMs: number = EngagementReconciliationService.SCAN_INTERVAL_MS) {
    if (this.isDestroyed) return;
    this.timer = setTimeout(async () => {
      try {
        await this.reconcile();
      } catch (err: any) {
        this.logger.error(`Engagement reconciliation scan failed: ${err.message}`, err.stack);
      } finally {
        this.scheduleNext();
      }
    }, delayMs);
  }

  private async heartbeatLease(): Promise<boolean> {
    const val = await this.redis.get(EngagementReconciliationService.LEASE_KEY);
    if (val === this.leaderToken) {
      await this.redis.pexpire(
        EngagementReconciliationService.LEASE_KEY,
        EngagementReconciliationService.LEADER_LEASE_MS,
      );
      return true;
    }
    return false;
  }

  async reconcile(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Previous engagement reconciliation scan still running. Skipping overlap.');
      return;
    }

    this.isRunning = true;
    const acquired = await this.redis.set(
      EngagementReconciliationService.LEASE_KEY,
      this.leaderToken,
      'PX',
      EngagementReconciliationService.LEADER_LEASE_MS,
      'NX',
    );
    if (!acquired) {
      this.isRunning = false;
      return;
    }

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // SCAN 0: Outbox Dispatcher (Pending REPLY_EXECUTION_DISPATCH)
      // ─────────────────────────────────────────────────────────────────────────
      await this.scan0OutboxDispatcher();

      // ─────────────────────────────────────────────────────────────────────────
      // SCAN 1: Stale Classification Reclaimer
      // ─────────────────────────────────────────────────────────────────────────
      await this.scan1StaleClassification();

      // ─────────────────────────────────────────────────────────────────────────
      // SCAN 2: Stale Execution Reclaimer & Missing Redis Job Reconstruction
      // ─────────────────────────────────────────────────────────────────────────
      await this.scan2StaleExecutionAndRedisLoss();

      // ─────────────────────────────────────────────────────────────────────────
      // SCAN 3: Retry Scanner (RETRYABLE_FAILURE with next_retry_at <= NOW())
      // ─────────────────────────────────────────────────────────────────────────
      await this.scan3RetryScanner();

      // ─────────────────────────────────────────────────────────────────────────
      // SCAN 4: Ambiguity Watchdog (Cadence polling & 45s deadline)
      // ─────────────────────────────────────────────────────────────────────────
      await this.scan4AmbiguityWatchdog();

      // ─────────────────────────────────────────────────────────────────────────
      // SCAN 5: Stale Sync Lease Reclaimer
      // ─────────────────────────────────────────────────────────────────────────
      await this.scan5StaleSyncLease();

      // ─────────────────────────────────────────────────────────────────────────
      // SCAN 6: Editorial Feedback Vector Indexing
      // ─────────────────────────────────────────────────────────────────────────
      if (this.editorialService) {
        await this.editorialService.processPendingEditorialFeedback();
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * SCAN 0: Dispatches pending execution outbox events older than 15s to BullMQ.
   */
  private async scan0OutboxDispatcher(): Promise<void> {
    const pendingEvents = await this.db.eventOutbox.findMany({
      where: {
        eventType: 'REPLY_EXECUTION_DISPATCH',
        status: 'PENDING',
        createdAt: { lt: new Date(Date.now() - 15 * 1000) },
      },
      take: 50,
      orderBy: { createdAt: 'asc' },
    });

    for (const event of pendingEvents) {
      const payload = event.payload as any;
      if (!payload?.replyExecutionId) continue;

      const jobId = `reply-publish_${payload.replyExecutionId}`;
      const existingJob = await this.publishQueue.getJob(jobId);

      if (!existingJob) {
        await this.publishQueue.add(
          'publish-reply',
          {
            requestId: randomUUID(),
            workspaceId: event.workspaceId,
            socialAccountId: payload.socialAccountId,
            replyExecutionId: payload.replyExecutionId,
            interactionId: payload.interactionId,
          },
          { jobId, removeOnComplete: true },
        );
        this.logger.log(`[Scan 0] Dispatched outbox job ${jobId} to reply-publish-queue`);
      }

      await this.db.eventOutbox.update({
        where: { id: event.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });
    }
  }

  /**
   * SCAN 1: Reclaims interactions stuck in CLASSIFYING for > 5 minutes.
   */
  private async scan1StaleClassification(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const stale = await this.db.interaction.findMany({
      where: {
        status: 'CLASSIFYING',
        updatedAt: { lt: fiveMinutesAgo },
      },
      take: 25,
    });

    for (const item of stale) {
      await this.db.interaction.update({
        where: { id: item.id },
        data: { status: 'NEW' },
      });

      const jobId = `classify_${item.id}`;
      await this.classifyQueue.add(
        'classify-interaction',
        {
          requestId: randomUUID(),
          workspaceId: item.workspaceId,
          socialAccountId: item.socialAccountId,
          interactionId: item.id,
        },
        { jobId, removeOnComplete: true },
      );
      this.logger.warn(`[Scan 1] Reclaimed stale CLASSIFYING interaction ${item.id}`);
    }
  }

  /**
   * SCAN 2: Stale Execution Reclaimer & Redis-Loss Reconstruction.
   */
  private async scan2StaleExecutionAndRedisLoss(): Promise<void> {
    const now = new Date();

    // 2.1 Reclaim expired CLAIMED executions
    const staleClaimed = await this.db.replyExecution.findMany({
      where: {
        status: 'CLAIMED',
        leaseUntil: { lt: now },
      },
      take: 25,
    });

    for (const exec of staleClaimed) {
      await this.db.replyExecution.update({
        where: { id: exec.id },
        data: {
          status: 'QUEUED',
          claimedBy: null,
          claimedAt: null,
          leaseUntil: null,
          attemptId: null,
        },
      });

      const jobId = `reply-publish_${exec.id}`;
      await this.publishQueue.add(
        'publish-reply',
        {
          requestId: randomUUID(),
          workspaceId: exec.workspaceId,
          socialAccountId: exec.socialAccountId,
          replyExecutionId: exec.id,
          interactionId: exec.interactionId,
        },
        { jobId, removeOnComplete: true },
      );
      this.logger.warn(`[Scan 2] Reset expired CLAIMED lease for execution ${exec.id}`);
    }

    // 2.2 Reclaim expired CREATING_CONTAINER (worker crashed during container create)
    const staleCreating = await this.db.replyExecution.findMany({
      where: {
        status: 'CREATING_CONTAINER',
        leaseUntil: { lt: now },
      },
      take: 25,
    });

    for (const exec of staleCreating) {
      await this.db.replyExecution.update({
        where: { id: exec.id },
        data: {
          status: 'RECOVERY_REQUIRED',
          hasExternalAmbiguity: true,
          ambiguityType: 'CONTAINER_CREATE',
          ambiguityDetectedAt: new Date(),
          recoveryDeadlineAt: new Date(Date.now() + 45 * 1000),
          lastError: 'Worker lease expired during container creation',
        },
      });
      await this.db.interaction.update({
        where: { id: exec.interactionId },
        data: { status: 'RECOVERY_REQUIRED' },
      });
      this.logger.warn(`[Scan 2] Moved expired CREATING_CONTAINER execution ${exec.id} to RECOVERY_REQUIRED`);
    }

    // 2.3 Reclaim expired PUBLISHING (worker crashed during publish request)
    const stalePublishing = await this.db.replyExecution.findMany({
      where: {
        status: 'PUBLISHING',
        leaseUntil: { lt: now },
      },
      take: 25,
    });

    for (const exec of stalePublishing) {
      await this.db.replyExecution.update({
        where: { id: exec.id },
        data: {
          status: 'RECOVERY_REQUIRED',
          hasExternalAmbiguity: true,
          ambiguityType: 'PUBLISH',
          ambiguityDetectedAt: new Date(),
          recoveryDeadlineAt: new Date(Date.now() + 45 * 1000),
          lastError: 'Worker lease expired during publication commit',
        },
      });
      await this.db.interaction.update({
        where: { id: exec.interactionId },
        data: { status: 'RECOVERY_REQUIRED' },
      });
      this.logger.warn(`[Scan 2] Moved expired PUBLISHING execution ${exec.id} to RECOVERY_REQUIRED`);
    }

    // 2.4 Redis-Loss Reconstruction: Ensure every CREATED / QUEUED execution has a live BullMQ job
    const queuedExecs = await this.db.replyExecution.findMany({
      where: {
        status: { in: ['CREATED', 'QUEUED'] },
      },
      take: 50,
      orderBy: { createdAt: 'asc' },
    });

    for (const exec of queuedExecs) {
      const jobId = `reply-publish_${exec.id}`;
      const job = await this.publishQueue.getJob(jobId);
      if (!job) {
        await this.publishQueue.add(
          'publish-reply',
          {
            requestId: randomUUID(),
            workspaceId: exec.workspaceId,
            socialAccountId: exec.socialAccountId,
            replyExecutionId: exec.id,
            interactionId: exec.interactionId,
          },
          { jobId, removeOnComplete: true },
        );
        this.logger.log(`[Scan 2] Reconstructed lost Redis job for execution ${exec.id}`);
      }
    }
  }

  /**
   * SCAN 3: Re-dispatches RETRYABLE_FAILURE executions when next_retry_at <= NOW().
   */
  private async scan3RetryScanner(): Promise<void> {
    const readyRetries = await this.db.replyExecution.findMany({
      where: {
        status: 'RETRYABLE_FAILURE',
        nextRetryAt: { lte: new Date() },
      },
      take: 50,
    });

    for (const exec of readyRetries) {
      await this.db.replyExecution.update({
        where: { id: exec.id },
        data: {
          status: 'QUEUED',
          claimedBy: null,
          claimedAt: null,
          leaseUntil: null,
          attemptId: null,
        },
      });

      const jobId = `reply-publish_${exec.id}`;
      await this.publishQueue.add(
        'publish-reply',
        {
          requestId: randomUUID(),
          workspaceId: exec.workspaceId,
          socialAccountId: exec.socialAccountId,
          replyExecutionId: exec.id,
          interactionId: exec.interactionId,
        },
        { jobId, removeOnComplete: true },
      );
      this.logger.log(`[Scan 3] Re-dispatched RETRYABLE_FAILURE execution ${exec.id} to QUEUED`);
    }
  }

  /**
   * SCAN 4: Ambiguity Watchdog with feed reconciliation and 45s deadline.
   */
  private async scan4AmbiguityWatchdog(): Promise<void> {
    const ambiguousExecs = await this.db.replyExecution.findMany({
      where: {
        status: 'RECOVERY_REQUIRED',
        recoveryResolution: { in: ['NONE', 'PENDING'] },
      },
      include: {
        interaction: true,
        replyDraftVersion: true,
        socialAccount: true,
      },
      take: 20,
    });

    for (const exec of ambiguousExecs) {
      const now = new Date();
      const deadlineExpired = exec.recoveryDeadlineAt ? exec.recoveryDeadlineAt <= now : false;

      if (exec.ambiguityType === 'PUBLISH') {
        try {
          const token = await this.publishingService.tokenService.getValidToken(exec.socialAccountId);
          if (!token) {
            if (deadlineExpired) {
              await this.markOperatorRequired(exec.id, 'OAuth token unavailable during reconciliation deadline');
            }
            continue;
          }

          // Query account's recent posts to reconcile if reply was committed externally
          const feed = await this.publishingService.threadsApi.getUserPosts(token, { limit: 10 });
          const posts = feed.data || [];

          const canonicalBody = canonicalOutboundText(exec.replyDraftVersion.body);
          const matches = posts.filter((p) => {
            const postText = canonicalOutboundText(p.text || '');
            return postText === canonicalBody;
          });

          if (matches.length === 1 && matches[0]) {
            const externalPost = matches[0];
            this.logger.log(
              `[Scan 4] Ambiguity MATCHED! Reply confirmed published externally. External ID: ${externalPost.id}`,
            );

            await this.db.replyExecution.update({
              where: { id: exec.id },
              data: {
                status: 'PUBLISHED',
                recoveryResolution: 'MATCHED',
                publishedThreadPostId: externalPost.id,
                publishedAt: new Date(),
                hasExternalAmbiguity: false,
              },
            });

            await this.db.interaction.update({
              where: { id: exec.interactionId },
              data: { status: 'REPLIED' },
            });
            continue;
          }

          if (deadlineExpired) {
            if (matches.length === 0 && exec.containerId) {
              // Confirmed 0 matches after 45s deadline; safe to retry publish against existing container
              this.logger.log(
                `[Scan 4] Ambiguity NOT_LANDED after 45s. Safe to retry against container ${exec.containerId}`,
              );

              await this.db.replyExecution.update({
                where: { id: exec.id },
                data: {
                  status: 'RETRYABLE_FAILURE',
                  recoveryResolution: 'NOT_LANDED',
                  nextRetryAt: new Date(), // Immediate retry
                  hasExternalAmbiguity: false,
                },
              });
            } else {
              // Inconclusive, multiple matches, or missing container -> requires operator confirmation
              await this.markOperatorRequired(
                exec.id,
                `Ambiguity inconclusive after 45s deadline (${matches.length} matches found)`,
              );
            }
          }
        } catch (err: any) {
          this.logger.warn(`[Scan 4] Reconciler feed query failed for ${exec.id}: ${err.message}`);
          if (deadlineExpired) {
            await this.markOperatorRequired(exec.id, `Feed reconciliation failed: ${err.message}`);
          }
        }
      } else if (exec.ambiguityType === 'CONTAINER_CREATE') {
        if (deadlineExpired) {
          await this.markOperatorRequired(
            exec.id,
            'Container creation ambiguity reached 45s deadline without deterministic container ID',
          );
        }
      }
    }
  }

  private async markOperatorRequired(executionId: string, notes: string): Promise<void> {
    this.logger.warn(`[Scan 4] Marking execution ${executionId} as OPERATOR_REQUIRED: ${notes}`);
    await this.db.replyExecution.update({
      where: { id: executionId },
      data: {
        recoveryResolution: 'OPERATOR_REQUIRED',
        lastError: notes,
      },
    });
  }

  /**
   * SCAN 5: Clears orphaned SYNCING leases on EngagementSyncState.
   */
  private async scan5StaleSyncLease(): Promise<void> {
    const now = new Date();
    const staleSyncs = await this.db.engagementSyncState.findMany({
      where: {
        syncStatus: 'SYNCING',
        leaseUntil: { lt: now },
      },
      take: 50,
    });

    for (const syncState of staleSyncs) {
      await this.db.engagementSyncState.update({
        where: { id: syncState.id },
        data: {
          syncStatus: 'IDLE',
          leaseUntil: null,
          leaseToken: null,
        },
      });
      this.logger.warn(
        `[Scan 5] Cleared orphaned sync lease for account ${syncState.socialAccountId} (rootPost: ${syncState.rootThreadsPostId})`,
      );
    }
  }
}

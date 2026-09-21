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
import { QUEUES, PublishJobPayload } from '@threadpilot/types';
import { PublishingService } from './publishing.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { randomUUID } from 'crypto';

const PUBLISH_JOB_OPTIONS = {
  removeOnComplete: 100,
  removeOnFail: 500,
} as const;

export type SafeEnqueueResult = 'ENQUEUED' | 'ALREADY_IN_FLIGHT' | 'SKIPPED_UNKNOWN';

@Injectable()
export class PublishingReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublishingReconciliationService.name);
  private isRunning = false;
  private isDestroyed = false;
  private timer?: NodeJS.Timeout;
  private readonly leaderToken = randomUUID();
  private static readonly LEASE_KEY = 'tp:pub-reconcile-leader';
  private static readonly SCAN_INTERVAL_MS = 60_000;
  private static readonly LEADER_LEASE_MS = 120_000;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(QUEUES.PUBLISH) private readonly publishQueue: Queue<PublishJobPayload>,
    private readonly publishingService: PublishingService,
    @Optional() private readonly db: PrismaClient = prisma,
  ) {}

  onModuleInit() {
    this.scheduleNext(10_000);
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext(delayMs: number = PublishingReconciliationService.SCAN_INTERVAL_MS) {
    if (this.isDestroyed) return;
    this.timer = setTimeout(async () => {
      try {
        await this.reconcile();
      } catch (err) {
        this.logger.error(`Reconciliation run failed: ${err}`);
      } finally {
        this.scheduleNext();
      }
    }, delayMs);
  }

  async reconcile(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Previous reconciliation scan still in progress. Skipping overlap.');
      return;
    }

    this.isRunning = true;
    const acquired = await this.redis.set(
      PublishingReconciliationService.LEASE_KEY,
      this.leaderToken,
      'PX',
      PublishingReconciliationService.LEADER_LEASE_MS,
      'NX',
    );
    if (!acquired) {
      this.isRunning = false;
      return;
    }

    try {
      // ── SCAN 1: Outbox Dispatch Recovery (True Composite Keyset Pagination) ──
      let lastCreatedAt: Date | null = null;
      let lastId: string | null = null;
      let outboxProcessed = 0;
      const MAX_OUTBOX_BATCH = 100;
      const OUTBOX_PAGE_SIZE = 25;

      while (outboxProcessed < MAX_OUTBOX_BATCH) {
        if (!(await this.heartbeatLease())) return;

        const pendingDispatches: Array<{
          id: string;
          scheduled_post_id: string;
          created_at: Date;
          workspace_id: string;
          scheduled_at: Date;
        }> = await this.db.$queryRaw`
          SELECT d.id, d.scheduled_post_id, d.created_at, sp.workspace_id, sp.scheduled_at
          FROM scheduled_post_dispatches d
          JOIN scheduled_posts sp ON sp.id = d.scheduled_post_id
          WHERE d.status = 'PENDING'
            AND d.created_at <= NOW() - INTERVAL '30 seconds'
            AND (
              ${lastCreatedAt}::timestamptz IS NULL
              OR d.created_at > ${lastCreatedAt}::timestamptz
              OR (d.created_at = ${lastCreatedAt}::timestamptz AND d.id > ${lastId}::uuid)
            )
          ORDER BY d.created_at ASC, d.id ASC
          LIMIT ${OUTBOX_PAGE_SIZE}
        `;

        if (pendingDispatches.length === 0) break;

        for (const d of pendingDispatches) {
          if (!(await this.heartbeatLease())) return;
          const bullJobId = `publish-${d.scheduled_post_id}`;
          const delayMs = Math.max(0, new Date(d.scheduled_at).getTime() - Date.now());
          const enqueueOutcome = await this.safeEnqueue(
            'PUBLISH',
            {
              requestId: randomUUID(),
              workspaceId: d.workspace_id,
              scheduledPostId: d.scheduled_post_id,
            },
            { jobId: bullJobId, delay: delayMs },
          );

          if (enqueueOutcome === 'ENQUEUED' || enqueueOutcome === 'ALREADY_IN_FLIGHT') {
            await this.db.$executeRaw`
              UPDATE scheduled_post_dispatches
              SET status = 'DISPATCHED', dispatched_at = NOW(), bull_job_id = ${bullJobId}
              WHERE id = ${d.id}::uuid
            `;
          } else {
            this.logger.warn(
              `Scan 1: Dispatch ${d.id} enqueue returned ${enqueueOutcome}. Leaving in PENDING for subsequent scan.`,
            );
          }
        }

        outboxProcessed += pendingDispatches.length;
        const lastItem = pendingDispatches[pendingDispatches.length - 1];
        if (lastItem) {
          lastCreatedAt = new Date(lastItem.created_at);
          lastId = lastItem.id;
        }
        if (pendingDispatches.length < OUTBOX_PAGE_SIZE) break;
      }

      // ── SCAN 2: Scheduled Execution Watchdog (True Composite Keyset Pagination) ──
      let lastScheduledAt: Date | null = null;
      let lastWatchdogId: string | null = null;
      let watchdogProcessed = 0;
      const MAX_WATCHDOG_BATCH = 200;
      const WATCHDOG_PAGE_SIZE = 50;

      while (watchdogProcessed < MAX_WATCHDOG_BATCH) {
        if (!(await this.heartbeatLease())) return;

        const duePosts: Array<{ id: string; workspace_id: string; scheduled_at: Date }> = await this.db.$queryRaw`
          SELECT id, workspace_id, scheduled_at
          FROM scheduled_posts
          WHERE status = 'SCHEDULED'
            AND scheduled_at <= NOW() + INTERVAL '5 minutes'
            AND (
              ${lastScheduledAt}::timestamptz IS NULL
              OR scheduled_at > ${lastScheduledAt}::timestamptz
              OR (scheduled_at = ${lastScheduledAt}::timestamptz AND id > ${lastWatchdogId}::uuid)
            )
          ORDER BY scheduled_at ASC, id ASC
          LIMIT ${WATCHDOG_PAGE_SIZE}
        `;

        if (duePosts.length === 0) break;

        for (const sp of duePosts) {
          if (!(await this.heartbeatLease())) return;
          const bullJobId = `publish-${sp.id}`;
          const delayMs = Math.max(0, new Date(sp.scheduled_at).getTime() - Date.now());
          await this.safeEnqueue(
            'PUBLISH',
            {
              requestId: randomUUID(),
              workspaceId: sp.workspace_id,
              scheduledPostId: sp.id,
            },
            { jobId: bullJobId, delay: delayMs },
          );
        }

        watchdogProcessed += duePosts.length;
        const lastItem = duePosts[duePosts.length - 1];
        if (lastItem) {
          lastScheduledAt = new Date(lastItem.scheduled_at);
          lastWatchdogId = lastItem.id;
        }
        if (duePosts.length < WATCHDOG_PAGE_SIZE) break;
      }

      // ── SCAN 3: Retry & Quota Due Schedules (True Composite Keyset Pagination) ──
      let lastRetryAt: Date | null = null;
      let lastRetryId: string | null = null;
      let retryProcessed = 0;
      const MAX_RETRY_BATCH = 100;
      const RETRY_PAGE_SIZE = 25;

      while (retryProcessed < MAX_RETRY_BATCH) {
        if (!(await this.heartbeatLease())) return;

        const retryDue: Array<{
          id: string;
          workspace_id: string;
          attempt_count: number;
          next_retry_at: Date;
        }> = await this.db.$queryRaw`
          SELECT id, workspace_id, attempt_count, next_retry_at
          FROM scheduled_posts
          WHERE status IN ('FAILED_RETRYABLE', 'QUOTA_BLOCKED')
            AND next_retry_at <= NOW()
            AND (
              status = 'QUOTA_BLOCKED'
              OR attempt_count < 5
              OR publish_requested_at IS NOT NULL
              OR ambiguity_detected_at IS NOT NULL
            )
            AND (
              ${lastRetryAt}::timestamptz IS NULL
              OR next_retry_at > ${lastRetryAt}::timestamptz
              OR (next_retry_at = ${lastRetryAt}::timestamptz AND id > ${lastRetryId}::uuid)
            )
          ORDER BY next_retry_at ASC, id ASC
          LIMIT ${RETRY_PAGE_SIZE}
        `;

        if (retryDue.length === 0) break;

        for (const sp of retryDue) {
          if (!(await this.heartbeatLease())) return;
          const retryJobId = `publish-${sp.id}-retry-${sp.attempt_count}`;
          await this.safeEnqueue(
            'PUBLISH',
            {
              requestId: randomUUID(),
              workspaceId: sp.workspace_id,
              scheduledPostId: sp.id,
            },
            { jobId: retryJobId, delay: 0 },
          );
        }

        retryProcessed += retryDue.length;
        const lastItem = retryDue[retryDue.length - 1];
        if (lastItem) {
          lastRetryAt = new Date(lastItem.next_retry_at);
          lastRetryId = lastItem.id;
        }
        if (retryDue.length < RETRY_PAGE_SIZE) break;
      }

      // ── SCAN 4: Stale Lease Recovery (True Composite Keyset Pagination) ──
      let lastLeaseUntil: Date | null = null;
      let lastLeaseId: string | null = null;
      let leaseProcessed = 0;
      const MAX_LEASE_BATCH = 100;
      const LEASE_PAGE_SIZE = 25;

      while (leaseProcessed < MAX_LEASE_BATCH) {
        if (!(await this.heartbeatLease())) return;

        const staleLeases: Array<{
          id: string;
          workspace_id: string;
          status: string;
          attempt_count: number;
          lease_until: Date;
          publish_requested_at: Date | null;
          ambiguity_detected_at: Date | null;
        }> = await this.db.$queryRaw`
          SELECT id, workspace_id, status, attempt_count, lease_until, publish_requested_at, ambiguity_detected_at
          FROM scheduled_posts
          WHERE status IN ('CLAIMED', 'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING')
            AND lease_until <= NOW()
            AND (
              ${lastLeaseUntil}::timestamptz IS NULL
              OR lease_until > ${lastLeaseUntil}::timestamptz
              OR (lease_until = ${lastLeaseUntil}::timestamptz AND id > ${lastLeaseId}::uuid)
            )
          ORDER BY lease_until ASC, id ASC
          LIMIT ${LEASE_PAGE_SIZE}
        `;

        if (staleLeases.length === 0) break;

        for (const sp of staleLeases) {
          if (!(await this.heartbeatLease())) return;

          const isAmbiguous =
            !!sp.publish_requested_at ||
            sp.status === 'PUBLISHING' ||
            !!sp.ambiguity_detected_at;
          if (sp.attempt_count >= 5 && !isAmbiguous) {
            this.logger.warn(
              `Stale lease on ${sp.id} reached attempt limit (${sp.attempt_count}) without publish ambiguity. Failing permanently.`,
            );
            await this.db.$executeRaw`
              UPDATE scheduled_posts
              SET status = 'FAILED_PERMANENT',
                  last_error_code = 'MAX_RETRIES_EXCEEDED',
                  last_error_msg = 'Stale lease expired after maximum execution attempts without external publish ambiguity.',
                  claimed_by = NULL,
                  lease_until = NULL,
                  attempt_id = NULL,
                  updated_at = NOW()
              WHERE id = ${sp.id}::uuid AND lease_until <= NOW() AND status IN ('CLAIMED', 'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING')
            `;
            continue;
          }

          this.logger.warn(
            `Stale lease detected on ${sp.id} (status: ${sp.status}, attempt: ${sp.attempt_count}). Enqueuing recovery job.`,
          );
          const reclaimJobId = `publish-${sp.id}-reclaim-${sp.attempt_count}`;
          await this.safeEnqueue(
            'PUBLISH',
            {
              requestId: randomUUID(),
              workspaceId: sp.workspace_id,
              scheduledPostId: sp.id,
            },
            { jobId: reclaimJobId, delay: 0 },
          );
        }

        leaseProcessed += staleLeases.length;
        const lastItem = staleLeases[staleLeases.length - 1];
        if (lastItem) {
          lastLeaseUntil = new Date(lastItem.lease_until);
          lastLeaseId = lastItem.id;
        }
        if (staleLeases.length < LEASE_PAGE_SIZE) break;
      }

      // ── SCAN 5: Platform Timestamp Backfill (True Composite Keyset Pagination) ──
      let lastBackfillCreatedAt: Date | null = null;
      let lastBackfillId: string | null = null;
      let backfillProcessed = 0;
      const MAX_BACKFILL_BATCH = 100;
      const BACKFILL_PAGE_SIZE = 25;

      while (backfillProcessed < MAX_BACKFILL_BATCH) {
        if (!(await this.heartbeatLease())) return;

        const missingTimestampPosts: Array<{
          id: string;
          social_account_id: string;
          published_post_id: string | null;
          threads_post_id: string | null;
          created_at: Date;
        }> = await this.db.$queryRaw`
          SELECT sp.id, sp.social_account_id, pp.id AS published_post_id, pp.threads_post_id, sp.created_at
          FROM scheduled_posts sp
          LEFT JOIN published_posts pp
            ON pp.draft_id = sp.draft_id
           AND pp.social_account_id = sp.social_account_id
          WHERE sp.status = 'PUBLISHED'
            AND sp.published_at IS NULL
            AND (
              ${lastBackfillCreatedAt}::timestamptz IS NULL
              OR sp.created_at > ${lastBackfillCreatedAt}::timestamptz
              OR (sp.created_at = ${lastBackfillCreatedAt}::timestamptz AND sp.id > ${lastBackfillId}::uuid)
            )
          ORDER BY sp.created_at ASC, sp.id ASC
          LIMIT ${BACKFILL_PAGE_SIZE}
        `;

        if (missingTimestampPosts.length === 0) break;

        for (const sp of missingTimestampPosts) {
          if (!(await this.heartbeatLease())) return;
          if (sp.threads_post_id && sp.published_post_id) {
            try {
              const token = await this.publishingService.tokenService.getValidToken(
                sp.social_account_id,
              );
              const details = await this.publishingService.threadsApi.getPost(
                token,
                sp.threads_post_id,
              );
              if (details.timestamp) {
                const platformDate = new Date(details.timestamp);
                if (Number.isFinite(platformDate.getTime())) {
                  await this.db.$transaction([
                    this.db.scheduledPost.update({
                      where: { id: sp.id },
                      data: { publishedAt: platformDate },
                    }),
                    this.db.publishedPost.update({
                      where: { id: sp.published_post_id },
                      data: { publishedAt: platformDate },
                    }),
                    this.db.threadPost.updateMany({
                      where: {
                        socialAccountId: sp.social_account_id,
                        threadsPostId: sp.threads_post_id,
                        postedAt: null,
                      },
                      data: { postedAt: platformDate },
                    }),
                  ]);
                }
              }
            } catch (fetchErr) {
              this.logger.warn(
                `Could not backfill platform timestamp for ${sp.id}: ${fetchErr}`,
              );
            }
          }
        }

        backfillProcessed += missingTimestampPosts.length;
        const lastItem = missingTimestampPosts[missingTimestampPosts.length - 1];
        if (lastItem) {
          lastBackfillCreatedAt = new Date(lastItem.created_at);
          lastBackfillId = lastItem.id;
        }
        if (missingTimestampPosts.length < BACKFILL_PAGE_SIZE) break;
      }

      // ── SCAN 6: Stale PROCESSING Event Outbox Recovery ──
      let lastOutboxReclaimCreatedAt: Date | null = null;
      let lastOutboxReclaimId: string | null = null;
      let outboxReclaimProcessed = 0;
      const MAX_OUTBOX_RECLAIM_BATCH = 100;
      const OUTBOX_RECLAIM_PAGE_SIZE = 25;

      while (outboxReclaimProcessed < MAX_OUTBOX_RECLAIM_BATCH) {
        if (!(await this.heartbeatLease())) return;

        const staleEvents: Array<{
          id: string;
          attempt_count: number;
          created_at: Date;
          lease_token: string | null;
        }> = await this.db.$queryRaw`
          SELECT id, attempt_count, created_at, lease_token
          FROM event_outbox
          WHERE status = 'PROCESSING'
            AND lease_until <= NOW()
            AND (
              ${lastOutboxReclaimCreatedAt}::timestamptz IS NULL
              OR created_at > ${lastOutboxReclaimCreatedAt}::timestamptz
              OR (created_at = ${lastOutboxReclaimCreatedAt}::timestamptz AND id > ${lastOutboxReclaimId}::uuid)
            )
          ORDER BY created_at ASC, id ASC
          LIMIT ${OUTBOX_RECLAIM_PAGE_SIZE}
        `;

        if (staleEvents.length === 0) break;

        for (const ev of staleEvents) {
          if (!(await this.heartbeatLease())) return;
          if (ev.attempt_count >= 5) {
            this.logger.error(
              `Event outbox ${ev.id} exceeded 5 attempts with stale lease. Marking FAILED.`,
            );
            await this.db.$executeRaw`
              UPDATE event_outbox
              SET status = 'FAILED',
                  last_error = 'Lease expired after maximum 5 processing attempts',
                  lease_until = NULL,
                  lease_token = NULL,
                  updated_at = NOW()
              WHERE id = ${ev.id}::uuid
                AND status = 'PROCESSING'
                AND lease_token = ${ev.lease_token}::uuid
                AND lease_until <= NOW()
            `;
          } else {
            this.logger.warn(
              `Stale PROCESSING lease on event outbox ${ev.id}. Resetting to PENDING for redelivery.`,
            );
            await this.db.$executeRaw`
              UPDATE event_outbox
              SET status = 'PENDING',
                  lease_until = NULL,
                  lease_token = NULL,
                  updated_at = NOW()
              WHERE id = ${ev.id}::uuid
                AND status = 'PROCESSING'
                AND lease_token = ${ev.lease_token}::uuid
                AND lease_until <= NOW()
            `;
          }
        }

        outboxReclaimProcessed += staleEvents.length;
        const lastItem = staleEvents[staleEvents.length - 1];
        if (lastItem) {
          lastOutboxReclaimCreatedAt = new Date(lastItem.created_at);
          lastOutboxReclaimId = lastItem.id;
        }
        if (staleEvents.length < OUTBOX_RECLAIM_PAGE_SIZE) break;
      }
    } finally {
      this.isRunning = false;
      const releaseScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await this.redis
        .eval(releaseScript, 1, PublishingReconciliationService.LEASE_KEY, this.leaderToken)
        .catch(() => {});
    }
  }

  private async heartbeatLease(): Promise<boolean> {
    const extendScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const res = await this.redis
      .eval(
        extendScript,
        1,
        PublishingReconciliationService.LEASE_KEY,
        this.leaderToken,
        PublishingReconciliationService.LEADER_LEASE_MS,
      )
      .catch(() => 0);

    const hasLease = res === 1;
    if (!hasLease) {
      this.logger.warn(
        'Reconciliation leader lease lost during execution. Halting scan immediately.',
      );
    }
    return hasLease;
  }

  private async safeEnqueue(
    jobName: string,
    payload: PublishJobPayload,
    opts: { jobId: string; delay?: number },
  ): Promise<SafeEnqueueResult> {
    try {
      const existingJob = await this.publishQueue.getJob(opts.jobId);
      if (existingJob) {
        const state = await existingJob.getState();
        const inFlightStates = ['waiting', 'delayed', 'active', 'prioritized', 'waiting-children'];
        if (inFlightStates.includes(state)) {
          this.logger.debug(
            `Job ${opts.jobId} already active in state: ${state}. Skipping duplicate enqueue.`,
          );
          return 'ALREADY_IN_FLIGHT';
        }
        if (state === 'completed' || state === 'failed') {
          this.logger.warn(
            `Job ${opts.jobId} found in terminal state (${state}). Removing to enqueue fresh job.`,
          );
          await existingJob.remove();
        } else {
          this.logger.error(
            `Job ${opts.jobId} is in unrecognized state (${state}). Failing closed without modification.`,
          );
          return 'SKIPPED_UNKNOWN';
        }
      }

      await this.publishQueue.add(jobName, payload, {
        ...PUBLISH_JOB_OPTIONS,
        ...opts,
      });
      return 'ENQUEUED';
    } catch (err: any) {
      if (err?.message?.includes('already exists') || err?.name === 'JobAlreadyExistsError') {
        this.logger.debug(
          `Job ${opts.jobId} concurrent enqueue detected. Treating as idempotent success.`,
        );
        return 'ALREADY_IN_FLIGHT';
      }
      throw err;
    }
  }
}

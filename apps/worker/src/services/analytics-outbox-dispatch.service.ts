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
import { PrismaClient, prisma } from '@threadpilot/database';
import { QUEUES } from '@threadpilot/types';
import { AnalyticsOutboxService } from './analytics-outbox.service';
import { ExpiredObservationSweeperService } from './expired-observation-sweeper.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { randomUUID } from 'crypto';

/**
 * AnalyticsOutboxDispatchService
 *
 * Continuously polls analytics_outbox_events and dispatches due events to the correct
 * BullMQ queues. This is the **scheduler** that closes the loop between:
 *   - Outbox event writes (done by sync/aggregate/insights/learning processors and the
 *     observation-scheduler service)
 *   - BullMQ queue ingestion (done by the analytics-sync/aggregate/insights/learning
 *     processors)
 *
 * Also runs periodic expired observation reconciliation (MISSED/RECOVERY) and the
 * observation sweeper to clean up overdue windows.
 */
@Injectable()
export class AnalyticsOutboxDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsOutboxDispatchService.name);
  private isDestroyed = false;
  private timer?: NodeJS.Timeout;
  private readonly leaderToken = randomUUID();

  /** Distributed leader-election Redis key — prevents multi-worker dual dispatch */
  private static readonly LEADER_LEASE_KEY = 'tp:analytics-outbox-leader';
  private static readonly LEADER_LEASE_MS = 30_000;
  /** Normal polling cadence (5 s is aggressive enough for near-real-time but safe for Redis) */
  private static readonly POLL_INTERVAL_MS = 5_000;
  /** Sweeper runs less frequently to avoid hammering the DB on missed window checks */
  private static readonly SWEEP_INTERVAL_TICKS = 12; // Every 12 × 5 s = 60 s

  private tickCount = 0;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(QUEUES.ANALYTICS_SYNC) private readonly analyticsSyncQueue: Queue,
    @InjectQueue(QUEUES.ANALYTICS_AGGREGATE) private readonly analyticsAggregateQueue: Queue,
    @InjectQueue(QUEUES.ANALYTICS_INSIGHTS) private readonly analyticsInsightsQueue: Queue,
    @InjectQueue(QUEUES.ANALYTICS_RECOMMENDATIONS) private readonly analyticsRecommendationsQueue: Queue,
    private readonly outboxService: AnalyticsOutboxService,
    private readonly sweeperService: ExpiredObservationSweeperService,
    @Optional() private readonly db: PrismaClient = prisma,
  ) {}

  onModuleInit() {
    this.logger.log('AnalyticsOutboxDispatchService started — polling every 5 s');
    this.scheduleNext(2_000); // first tick after short warm-up
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext(delayMs: number = AnalyticsOutboxDispatchService.POLL_INTERVAL_MS) {
    if (this.isDestroyed) return;
    this.timer = setTimeout(async () => {
      try {
        await this.tick();
      } catch (err: any) {
        this.logger.error(`Analytics outbox dispatch tick failed: ${err.message}`, err.stack);
      } finally {
        this.scheduleNext();
      }
    }, delayMs);
  }

  private async tick() {
    this.tickCount++;

    // Distributed leader election: only one worker dispatches at a time to avoid
    // duplicate BullMQ job IDs (which BullMQ dedupes anyway, but let's be tidy).
    const leaderAcquired = await this.redis
      .set(
        AnalyticsOutboxDispatchService.LEADER_LEASE_KEY,
        this.leaderToken,
        'PX',
        AnalyticsOutboxDispatchService.LEADER_LEASE_MS,
        'NX',
      )
      .catch(() => null);

    const isLeader = leaderAcquired === 'OK';

    // Fallback: check if WE already hold the lease (allow re-entry for single-process setups)
    let currentHolder: string | null = null;
    if (!isLeader) {
      currentHolder = await this.redis
        .get(AnalyticsOutboxDispatchService.LEADER_LEASE_KEY)
        .catch(() => null);
    }

    const canDispatch = isLeader || currentHolder === this.leaderToken;

    if (canDispatch) {
      if (isLeader) {
        // Extend TTL while we still hold the lease
        await this.redis
          .pexpire(AnalyticsOutboxDispatchService.LEADER_LEASE_KEY, AnalyticsOutboxDispatchService.LEADER_LEASE_MS)
          .catch(() => {});
      }

      const dispatched = await this.outboxService.dispatchOutboxEvents({
        analyticsSyncQueue: this.analyticsSyncQueue,
        analyticsAggregateQueue: this.analyticsAggregateQueue,
        analyticsInsightsQueue: this.analyticsInsightsQueue,
        analyticsRecommendationsQueue: this.analyticsRecommendationsQueue,
      });

      if (dispatched > 0) {
        this.logger.log(`Dispatched ${dispatched} analytics outbox events to BullMQ queues`);
      }
    }

    // Sweeper runs on all workers (idempotent SQL UPDATE) every 60 s
    if (this.tickCount % AnalyticsOutboxDispatchService.SWEEP_INTERVAL_TICKS === 0) {
      const sweepResult = await this.sweeperService.reconcileExpiredObservations();
      if (sweepResult.missedCount > 0 || sweepResult.recoveredCount > 0) {
        this.logger.log(
          `Observation sweeper: ${sweepResult.missedCount} MISSED, ${sweepResult.recoveredCount} recovered`,
        );
      }
    }
  }
}

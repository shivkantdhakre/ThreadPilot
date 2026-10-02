import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import {
  PrismaClient,
  AnalyticsOutboxEvent,
  AnalyticsOutboxType,
  OutboxEventStatus,
} from '@threadpilot/database';

export const MAX_OUTBOX_ATTEMPTS = 5;
export const OUTBOX_LEASE_SECONDS = 60;

export interface AnalyticsQueuesMap {
  analyticsSyncQueue?: Queue;
  analyticsAggregateQueue?: Queue;
  analyticsInsightsQueue?: Queue;
  analyticsRecommendationsQueue?: Queue;
}

@Injectable()
export class AnalyticsOutboxService {
  private readonly logger = new Logger(AnalyticsOutboxService.name);
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Dispatches pending outbox events to BullMQ with CAS execution fencing and delivery generation.
   */
  async dispatchOutboxEvents(queues: AnalyticsQueuesMap): Promise<number> {
    const leaseToken = randomUUID();

    // 1. Atomic claim with FOR UPDATE SKIP LOCKED & Lease Recovery
    const claimedEvents = await this.prisma.$queryRaw<AnalyticsOutboxEvent[]>`
      WITH claimable AS (
        SELECT id FROM analytics_outbox_events
        WHERE (status = 'PENDING' AND execute_at <= NOW())
           OR (status = 'PROCESSING' AND lease_until < NOW())
        ORDER BY execute_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 50
      )
      UPDATE analytics_outbox_events o
      SET status = 'PROCESSING'::"OutboxEventStatus",
          lease_token = ${leaseToken},
          lease_until = NOW() + INTERVAL '60 seconds',
          attempt_count = o.attempt_count + 1,
          updated_at = NOW()
      FROM claimable
      WHERE o.id = claimable.id
      RETURNING o.*;
    `;

    let dispatchedCount = 0;

    for (const event of claimedEvents) {
      try {
        const payload = event.payload as Record<string, any>;
        const genSuffix =
          event.deliveryGeneration > 1 ? `_delgen${event.deliveryGeneration}` : '';

        switch (event.eventType) {
          case AnalyticsOutboxType.TRIGGER_OBSERVATION:
          case AnalyticsOutboxType.RETRY_OBSERVATION: {
            if (queues.analyticsSyncQueue) {
              const delayMs = Math.max(0, event.executeAt.getTime() - Date.now());
              await queues.analyticsSyncQueue.add('analytics_sync', payload, {
                delay: delayMs,
                jobId: `analytics_sync_${event.dedupeKey.replace(/[:]/g, '_')}${genSuffix}`,
                removeOnComplete: 100,
              });
            }
            break;
          }

          case AnalyticsOutboxType.TRIGGER_AGGREGATION: {
            if (queues.analyticsAggregateQueue) {
              await queues.analyticsAggregateQueue.add('analytics_aggregate', payload, {
                jobId: `analytics_aggregate_${payload.socialAccountId}_gen${payload.ingestionGeneration}_${payload.slot}${genSuffix}`,
                removeOnComplete: 100,
              });
            }
            break;
          }

          case AnalyticsOutboxType.TRIGGER_INSIGHTS: {
            if (queues.analyticsInsightsQueue) {
              await queues.analyticsInsightsQueue.add('analytics_insights_generation', payload, {
                jobId: `analytics_insights_${payload.socialAccountId}_rev${payload.sourceRevision}_${payload.slot}${genSuffix}`,
                removeOnComplete: 100,
              });
            }
            break;
          }

          case AnalyticsOutboxType.TRIGGER_PROFILE_LEARNING: {
            if (queues.analyticsRecommendationsQueue) {
              await queues.analyticsRecommendationsQueue.add('analytics_profile_learning', payload, {
                jobId: `analytics_learning_${payload.socialAccountId}_rev${payload.sourceRevision}${genSuffix}`,
                removeOnComplete: 100,
              });
            }
            break;
          }

          case AnalyticsOutboxType.TRIGGER_RECOMMENDATIONS: {
            if (queues.analyticsRecommendationsQueue) {
              await queues.analyticsRecommendationsQueue.add('analytics_recommendations_generate', payload, {
                jobId: `analytics_recommendations_${payload.socialAccountId}_rev${payload.sourceRevision}${genSuffix}`,
                removeOnComplete: 100,
              });
            }
            break;
          }
        }

        // 3. CAS FENCING: update to COMPLETED ONLY if this worker still holds the lease
        const affected = await this.prisma.$executeRaw`
          UPDATE analytics_outbox_events
          SET status = 'COMPLETED'::"OutboxEventStatus",
              processed_at = NOW(),
              lease_token = NULL,
              lease_until = NULL,
              updated_at = NOW()
          WHERE id = ${event.id}::uuid
            AND status = 'PROCESSING'
            AND lease_token = ${leaseToken};
        `;

        if (affected > 0) {
          dispatchedCount++;
        } else {
          this.logger.warn(
            `Outbox event ${event.id} lease expired or reclaimed by another worker. Skipped COMPLETED update.`,
          );
        }
      } catch (err: any) {
        await this.prisma.$executeRaw`
          UPDATE analytics_outbox_events
          SET status = CASE WHEN attempt_count >= ${MAX_OUTBOX_ATTEMPTS} THEN 'FAILED'::"OutboxEventStatus" ELSE 'PENDING'::"OutboxEventStatus" END,
              error_message = ${err.message?.substring(0, 500)},
              execute_at = NOW() + INTERVAL '5 seconds',
              lease_token = NULL,
              lease_until = NULL,
              updated_at = NOW()
          WHERE id = ${event.id}::uuid
            AND status = 'PROCESSING'
            AND lease_token = ${leaseToken};
        `;
      }
    }

    return dispatchedCount;
  }

  /**
   * Replays failed outbox events with delivery generation bump to isolate from dead BullMQ queues.
   */
  async replayFailedOutboxEvents(
    eventIds: string[],
    adminUserId?: string,
    reason?: string,
  ): Promise<number> {
    const result = await this.prisma.$executeRaw`
      UPDATE analytics_outbox_events
      SET status = 'PENDING'::"OutboxEventStatus",
          delivery_generation = delivery_generation + 1,
          attempt_count = 0,
          lease_token = NULL,
          lease_until = NULL,
          error_message = NULL,
          execute_at = NOW(),
          updated_at = NOW()
      WHERE id = ANY(${eventIds}::uuid[])
        AND status = 'FAILED';
    `;
    return result;
  }
}

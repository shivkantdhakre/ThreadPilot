import { Injectable, Logger } from '@nestjs/common';
import {
  PrismaClient,
  ObservationStatus,
  AnalyticsOutboxType,
} from '@threadpilot/database';

export interface SweepResult {
  missedCount: number;
  recoveredCount: number;
}

@Injectable()
export class ExpiredObservationSweeperService {
  private readonly logger = new Logger(ExpiredObservationSweeperService.name);
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Periodic window reconciliation and dead worker recovery.
   * 1. Terminal window closure: Transitions observations with passed windowClosesAt to MISSED.
   * 2. Dead worker recovery: Recovers abandoned PROCESSING observations whose lease expired but window is open.
   */
  async reconcileExpiredObservations(): Promise<SweepResult> {
    // 1. Terminal window closure for closed windows (including expired PROCESSING leases)
    const missedCount = await this.prisma.$executeRaw`
      UPDATE analytics_observations
      SET status = 'MISSED'::"ObservationStatus",
          lease_token = NULL,
          lease_until = NULL,
          error_message = 'Observation window closed before capture could complete or worker lease expired after window closure',
          updated_at = NOW()
      WHERE (
          status IN ('SCHEDULED', 'FAILED', 'RATE_LIMITED')
          OR (status = 'PROCESSING' AND lease_until < NOW())
        )
        AND window_closes_at < NOW();
    `;

    // 2. Dead worker recovery for still-open windows: recover expired PROCESSING
    const expiredProcessing = await this.prisma.analyticsObservation.findMany({
      where: {
        status: ObservationStatus.PROCESSING,
        leaseUntil: { lt: new Date() },
        windowClosesAt: { gte: new Date() },
      },
      take: 50,
    });

    let recoveredCount = 0;
    for (const obs of expiredProcessing) {
      await this.prisma.$transaction(async (tx) => {
        const nextAttemptCount = obs.attemptCount + 1;
        const nextAttemptAt = new Date(); // Immediate recovery retry

        const affected = await tx.$executeRaw`
          UPDATE analytics_observations
          SET status = 'FAILED'::"ObservationStatus",
              attempt_count = attempt_count + 1,
              error_message = 'Worker lease expired without terminal resolution; recovered by sweeper',
              lease_token = NULL,
              lease_until = NULL,
              updated_at = NOW()
          WHERE id = ${obs.id}::uuid
            AND status = 'PROCESSING'
            AND lease_until < NOW()
            AND window_closes_at >= NOW();
        `;

        if (affected > 0) {
          recoveredCount++;
          const dedupeKey = `retry-observation:${obs.id}:recovered_${nextAttemptCount}`;
          await tx.analyticsOutboxEvent.upsert({
            where: { dedupeKey },
            create: {
              workspaceId: obs.workspaceId,
              socialAccountId: obs.socialAccountId,
              dedupeKey,
              eventType: AnalyticsOutboxType.RETRY_OBSERVATION,
              executeAt: nextAttemptAt,
              payload: {
                observationId: obs.id,
                publishedPostId: obs.publishedPostId,
                socialAccountId: obs.socialAccountId,
                slot: obs.observationSlot,
              },
            },
            update: {},
          });
        }
      }, { timeout: 30000, maxWait: 10000 });
    }

    if (missedCount > 0 || recoveredCount > 0) {
      this.logger.log(
        `Observation sweeper completed: ${missedCount} transitioned to MISSED, ${recoveredCount} recovered from dead workers.`,
      );
    }

    return { missedCount, recoveredCount };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  ObservationSlot,
  ObservationStatus,
  AnalyticsOutboxType,
  AnalyticsObservation,
} from '@threadpilot/database';

export interface ObservationSlotTiming {
  delayMs: number;
  windowMs: number;
}

export const OBSERVATION_SLOT_CONFIGS: Record<ObservationSlot, ObservationSlotTiming> = {
  [ObservationSlot.T_1H]: {
    delayMs: 1 * 3600 * 1000,        // +1 hour
    windowMs: 1 * 3600 * 1000,       // closes at +2 hours (window length: 1 hour)
  },
  [ObservationSlot.T_6H]: {
    delayMs: 6 * 3600 * 1000,        // +6 hours
    windowMs: 2 * 3600 * 1000,       // closes at +8 hours (window length: 2 hours)
  },
  [ObservationSlot.T_24H]: {
    delayMs: 24 * 3600 * 1000,       // +24 hours
    windowMs: 6 * 3600 * 1000,       // closes at +30 hours (window length: 6 hours)
  },
  [ObservationSlot.T_7D]: {
    delayMs: 7 * 24 * 3600 * 1000,   // +7 days
    windowMs: 24 * 3600 * 1000,      // closes at +8 days (window length: 24 hours)
  },
  [ObservationSlot.T_30D]: {
    delayMs: 30 * 24 * 3600 * 1000,  // +30 days
    windowMs: 48 * 3600 * 1000,      // closes at +32 days (window length: 48 hours)
  },
};

export const ORDERED_OBSERVATION_SLOTS: ObservationSlot[] = [
  ObservationSlot.T_1H,
  ObservationSlot.T_6H,
  ObservationSlot.T_24H,
  ObservationSlot.T_7D,
  ObservationSlot.T_30D,
];

export interface ScheduleObservationsParams {
  workspaceId: string;
  socialAccountId: string;
  publishedPostId: string;
  publishedAt?: Date | null;
  followerCount?: number | null;
}

@Injectable()
export class ObservationSchedulingService {
  private readonly logger = new Logger(ObservationSchedulingService.name);
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Schedules the 5 standard observation lifecycle slots (T_1H, T_6H, T_24H, T_7D, T_30D)
   * for a newly published post. Can run within an existing transaction or standalone.
   */
  async scheduleObservations(
    tx: Prisma.TransactionClient | PrismaClient,
    params: ScheduleObservationsParams,
  ): Promise<AnalyticsObservation[]> {
    const { workspaceId, socialAccountId, publishedPostId } = params;
    const publishedAt = params.publishedAt ?? new Date();

    // 1. Ensure AnalyticsSyncState row exists for account
    await tx.analyticsSyncState.upsert({
      where: { socialAccountId },
      create: {
        workspaceId,
        socialAccountId,
        analyticsRevision: 0,
        ingestionGeneration: 0,
      },
      update: {},
    });

    const scheduledObservations: AnalyticsObservation[] = [];

    // 2. Create the 5 observation slots and corresponding outbox events
    for (const slot of ORDERED_OBSERVATION_SLOTS) {
      const config = OBSERVATION_SLOT_CONFIGS[slot];
      const scheduledFor = new Date(publishedAt.getTime() + config.delayMs);
      const windowClosesAt = new Date(scheduledFor.getTime() + config.windowMs);

      const observation = await tx.analyticsObservation.upsert({
        where: {
          uq_observation_slot: {
            publishedPostId,
            observationSlot: slot,
          },
        },
        create: {
          workspaceId,
          socialAccountId,
          publishedPostId,
          observationSlot: slot,
          scheduledFor,
          windowClosesAt,
          status: ObservationStatus.SCHEDULED,
        },
        update: {},
      });

      // Outbox event to trigger worker execution at scheduledFor
      const dedupeKey = `obs:${observation.id}`;
      await tx.analyticsOutboxEvent.upsert({
        where: { dedupeKey },
        create: {
          workspaceId,
          socialAccountId,
          dedupeKey,
          eventType: AnalyticsOutboxType.TRIGGER_OBSERVATION,
          executeAt: scheduledFor,
          payload: {
            observationId: observation.id,
            workspaceId,
            socialAccountId,
            publishedPostId,
            slot,
          },
        },
        update: {},
      });

      scheduledObservations.push(observation);
    }

    this.logger.log(
      `Scheduled ${scheduledObservations.length} observation slots for published post ${publishedPostId}`,
    );

    return scheduledObservations;
  }
}

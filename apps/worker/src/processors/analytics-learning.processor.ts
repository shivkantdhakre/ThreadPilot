import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaClient } from '@threadpilot/database';
import { QUEUES } from '@threadpilot/types';
import { recomputeLearnedProfile } from '../services/learning-profile.service.js';
import { StaleRevisionError } from './analytics-insights.processor.js';
import { processRecommendationGenerationJob } from '../services/recommendation-engine.service.js';

export interface ProfileLearningJobData {
  workspaceId: string;
  socialAccountId: string;
  sourceRevision: number;
  asOf: string;
}

/**
 * Execute longitudinal profile learning with atomic revision guards (Test AW, Test BL).
 */
export async function processProfileLearningJob(
  prisma: PrismaClient,
  data: ProfileLearningJobData,
): Promise<{ success: boolean }> {
  const { socialAccountId, sourceRevision, asOf } = data;
  const logger = new Logger('processProfileLearningJob');

  // 1. P0 #1 FIX: Pre-check symmetric revision guard before expensive queries
  const syncState = await prisma.analyticsSyncState.findUniqueOrThrow({
    where: { socialAccountId },
    select: { analyticsRevision: true },
  });

  if (syncState.analyticsRevision !== sourceRevision) {
    logger.warn(
      `Aborting profile learning: job sourceRevision (${sourceRevision}) does not match current analyticsRevision (${syncState.analyticsRevision}).`,
    );
    return { success: false };
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        // 2. P0 #1 FIX: Strict atomic row lock on analytics_sync_states inside learning transaction
        const [lockedState] = await tx.$queryRaw<{ analytics_revision: number }[]>`
          SELECT analytics_revision
          FROM analytics_sync_states
          WHERE social_account_id = ${socialAccountId}::uuid
          FOR UPDATE;
        `;

        if (lockedState?.analytics_revision !== sourceRevision) {
          throw new StaleRevisionError(
            `Stale profile learning aborted: analyticsRevision changed from ${sourceRevision} to ${lockedState?.analytics_revision} during execution.`,
          );
        }

        // 3. Executes longitudinal profile learning across historical monthly buckets (Test AC, AF, AJ)
        await recomputeLearnedProfile(tx, socialAccountId, sourceRevision, new Date(asOf));
        // recomputeLearnedProfile transactionally creates TRIGGER_RECOMMENDATIONS outbox event!
      },
      { timeout: 30000, maxWait: 10000 },
    );
  } catch (err: any) {
    if (err instanceof StaleRevisionError) {
      logger.warn(err.message);
      return { success: false }; // Cleanly exit: newer aggregation revision is now authoritative (Test AW)
    }
    throw err;
  }

  return { success: true };
}

@Processor(QUEUES.ANALYTICS_RECOMMENDATIONS)
@Injectable()
export class AnalyticsLearningProcessor extends WorkerHost {
  private readonly logger: Logger = new Logger(AnalyticsLearningProcessor.name);
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
  }

  async process(job: Job<any>): Promise<any> {
    if (job.name === 'analytics_profile_learning') {
      this.logger.log(
        `Executing profile learning for account ${job.data.socialAccountId} rev ${job.data.sourceRevision}`,
      );
      return processProfileLearningJob(this.prisma, job.data);
    }
    if (job.name === 'analytics_recommendations_generate') {
      this.logger.log(
        `Executing recommendation generation for account ${job.data.socialAccountId} rev ${job.data.sourceRevision}`,
      );
      return processRecommendationGenerationJob(this.prisma, job.data);
    }
    return { skipped: true, jobName: job.name };
  }
}

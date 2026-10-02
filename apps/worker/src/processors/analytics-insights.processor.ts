import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  AggregationDimension,
  AggregationGranularity,
  AnalyticsOutboxType,
  EvidenceGrade,
  ObservationSlot,
  PrismaClient,
} from '@threadpilot/database';
import { QUEUES } from '@threadpilot/types';
import { deriveEvidenceGrade } from '../services/statistical-evidence.service.js';

export class StaleRevisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleRevisionError';
  }
}

export interface InsightJobData {
  workspaceId: string;
  socialAccountId: string;
  sourceRevision: number;
  slot: ObservationSlot;
  asOf: string;
}

export interface SynthesizedInsightData {
  aggregateId: string;
  dimension: AggregationDimension;
  dimensionValue: string;
  sampleSize: number;
  complementSize: number;
  subjectAvgEngagement: number | null;
  complementAvgEngagement: number | null;
  absoluteDelta: number | null;
  percentDelta: number | null;
  cohensD: number | null;
  ci95Lower: number | null;
  ci95Upper: number | null;
  welchPValue: number | null;
  evidenceGrade: EvidenceGrade;
  hypothesisFamilyKey: string;
  hypothesisFamilyRevision: number;
  hypothesisFamilySize: number;
  passesFDR: boolean;
  qValue: number | null;
  observationText: string;
  recommendationText: string;
  analysisWindowStart: Date;
  analysisWindowEnd: Date;
}

/**
 * Deterministic synthesis of insight wording using authoritative pre-computed evidence only (Invariant 11).
 */
export function synthesizeInsightWording(
  candidate: any,
  grade: EvidenceGrade,
): { observation: string; recommendation: string } {
  const dimName = candidate.dimension.toLowerCase().replace(/_/g, ' ');
  const deltaStr =
    candidate.percentDelta != null
      ? `${candidate.percentDelta >= 0 ? '+' : ''}${candidate.percentDelta.toFixed(1)}%`
      : 'distinct';
  const confStr =
    candidate.passesFDR === true
      ? 'High-confidence multiple-testing verified'
      : 'Directional indicator';

  const observation =
    `Posts with ${dimName} "${candidate.dimensionValue}" showed ${deltaStr} engagement relative to account baseline ` +
    `(n=${candidate.sampleSize} vs ${candidate.complementSize} complement posts, Cohen's d: ${candidate.cohensD?.toFixed(2) ?? 'N/A'}, ` +
    `p=${candidate.welchPValue != null ? candidate.welchPValue.toFixed(4) : 'N/A'}).`;

  const recommendation =
    grade === EvidenceGrade.HIGH_SIGNAL
      ? `Prioritize ${dimName} "${candidate.dimensionValue}" across upcoming editorial cycles. ${confStr}.`
      : `Test further iterations of ${dimName} "${candidate.dimensionValue}" to reinforce observed signal.`;

  return { observation, recommendation };
}

/**
 * Process insight generation with revision guards, row-locking transaction,
 * and downstream profile learning dispatching (P0 #2, P0 #3, Test AX, Test BL).
 */
export async function processInsightGeneration(
  prisma: PrismaClient,
  data: InsightJobData,
): Promise<{ insightsCreated: number }> {
  const { workspaceId, socialAccountId, sourceRevision, slot, asOf } = data;
  const logger = new Logger('processInsightGeneration');

  // 1. Symmetric revision guard: exact match required before processing
  const syncState = await prisma.analyticsSyncState.findUniqueOrThrow({
    where: { socialAccountId },
  });

  if (syncState.analyticsRevision !== sourceRevision) {
    logger.warn(
      `Aborting insight generation: job sourceRevision (${sourceRevision}) does not match current analyticsRevision (${syncState.analyticsRevision}).`,
    );
    return { insightsCreated: 0 };
  }

  // 2. Fetch robust statistical evidence for this slot and revision
  const qualifyingAggregates = await prisma.performanceAggregate.findMany({
    where: {
      socialAccountId,
      observationSlot: slot,
      granularity: AggregationGranularity.MONTHLY,
      sampleSize: { gte: 5 },
      complementSize: { gte: 5 },
      subjectAvgEngagementByViews: { not: null },
      welchPValue: { not: null },
      analyticsRevision: sourceRevision,
    },
  });

  // Filter to Directional or High Signal evidence grades only
  const candidatesForInsights: SynthesizedInsightData[] = [];
  for (const agg of qualifyingAggregates) {
    const grade = deriveEvidenceGrade({
      sampleSize: agg.sampleSize,
      complementSize: agg.complementSize,
      cohensD: agg.cohensD,
      pValue: agg.welchPValue,
      ci95Lower: agg.ci95Lower,
      ci95Upper: agg.ci95Upper,
      passesFDR: agg.passesFDR ?? false,
    });

    if (grade === EvidenceGrade.DIRECTIONAL || grade === EvidenceGrade.HIGH_SIGNAL) {
      const { observation, recommendation } = synthesizeInsightWording(agg, grade);
      const windowStart = new Date(agg.bucketDate);
      const windowEnd = new Date(windowStart.getTime() + 30 * 86400000);

      candidatesForInsights.push({
        aggregateId: agg.id,
        dimension: agg.dimension,
        dimensionValue: agg.dimensionValue,
        sampleSize: agg.sampleSize,
        complementSize: agg.complementSize,
        subjectAvgEngagement: agg.subjectAvgEngagementByViews,
        complementAvgEngagement: agg.complementAvgEngagement,
        absoluteDelta: agg.absoluteDelta,
        percentDelta: agg.percentDelta,
        cohensD: agg.cohensD,
        ci95Lower: agg.ci95Lower,
        ci95Upper: agg.ci95Upper,
        welchPValue: agg.welchPValue,
        evidenceGrade: grade,
        hypothesisFamilyKey: agg.hypothesisFamilyKey,
        hypothesisFamilyRevision: agg.hypothesisFamilyRevision,
        hypothesisFamilySize: agg.hypothesisFamilySize,
        passesFDR: agg.passesFDR ?? false,
        qValue: agg.qValue,
        observationText: observation,
        recommendationText: recommendation,
        analysisWindowStart: windowStart,
        analysisWindowEnd: windowEnd,
      });
    }
  }

  let insightsCreated = 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        // 3. P0 #1 FIX: Strict atomic row lock on analytics_sync_states (Test AX)
        const [lockedState] = await tx.$queryRaw<{ analytics_revision: number }[]>`
          SELECT analytics_revision
          FROM analytics_sync_states
          WHERE social_account_id = ${socialAccountId}::uuid
          FOR UPDATE;
        `;

        if (lockedState?.analytics_revision !== sourceRevision) {
          throw new StaleRevisionError(
            `Aborting insight commit: analyticsRevision changed from ${sourceRevision} to ${lockedState?.analytics_revision} during generation.`,
          );
        }

        // 4. Persist insights with exact source revision and idempotency
        for (const insightData of candidatesForInsights) {
          const idempotencyKey = `insight:${socialAccountId}:rev${sourceRevision}:${insightData.dimension}:${insightData.dimensionValue}:${slot}`;
          await tx.insight.upsert({
            where: { idempotencyKey },
            create: {
              workspaceId,
              socialAccountId,
              dimension: insightData.dimension,
              dimensionValue: insightData.dimensionValue,
              observationSlot: slot,
              sampleSize: insightData.sampleSize,
              complementSize: insightData.complementSize,
              subjectAvgEngagement: insightData.subjectAvgEngagement,
              complementAvgEngagement: insightData.complementAvgEngagement,
              absoluteDelta: insightData.absoluteDelta,
              percentDelta: insightData.percentDelta,
              cohensD: insightData.cohensD,
              ci95Lower: insightData.ci95Lower,
              ci95Upper: insightData.ci95Upper,
              welchPValue: insightData.welchPValue,
              evidenceGrade: insightData.evidenceGrade,
              hypothesisFamilyKey: insightData.hypothesisFamilyKey,
              hypothesisFamilyRevision: insightData.hypothesisFamilyRevision,
              hypothesisFamilySize: insightData.hypothesisFamilySize,
              passesFDR: insightData.passesFDR,
              qValue: insightData.qValue,
              observation: insightData.observationText,
              recommendation: insightData.recommendationText,
              generationModel: 'gemini-1.5-pro',
              promptVersion: 'v1',
              aggregationVersion: 'v1',
              metricFormulaVersion: 'v1',
              analyticsRevisionAtGeneration: sourceRevision,
              analysisWindowStart: insightData.analysisWindowStart,
              analysisWindowEnd: insightData.analysisWindowEnd,
              idempotencyKey,
              sourceAggregates: {
                connect: { id: insightData.aggregateId },
              },
            },
            update: {},
          });
          insightsCreated++;
        }

        // 5. P0 #3 FIX: Authoritative downstream trigger for Profile Learning with unchanged asOf (Test BL)
        const dedupeKey = `learning:${socialAccountId}:rev${sourceRevision}`;
        await tx.analyticsOutboxEvent.upsert({
          where: { dedupeKey },
          create: {
            workspaceId,
            socialAccountId,
            dedupeKey,
            eventType: AnalyticsOutboxType.TRIGGER_PROFILE_LEARNING,
            executeAt: new Date(),
            payload: {
              workspaceId,
              socialAccountId,
              sourceRevision,
              asOf, // Canonical asOf propagated bit-for-bit unchanged!
            },
          },
          update: {},
        });
      },
      { timeout: 30000, maxWait: 10000 },
    );
  } catch (err: any) {
    if (err instanceof StaleRevisionError) {
      logger.warn(err.message);
      return { insightsCreated: 0 };
    }
    throw err;
  }

  return { insightsCreated };
}

@Processor(QUEUES.ANALYTICS_INSIGHTS)
@Injectable()
export class AnalyticsInsightsProcessor extends WorkerHost {
  private readonly logger: Logger = new Logger(AnalyticsInsightsProcessor.name);
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
  }

  async process(job: Job<InsightJobData>): Promise<{ insightsCreated: number }> {
    this.logger.log(
      `Processing insights for account ${job.data.socialAccountId} rev ${job.data.sourceRevision}`,
    );
    return processInsightGeneration(this.prisma, job.data);
  }
}

import {
  AggregationDimension,
  AggregationGranularity,
  AnalyticsOutboxType,
  EvidenceGrade,
  ObservationSlot,
} from '@threadpilot/database';
import {
  deriveEvidenceGrade,
  PrismaTransactionClient,
} from './statistical-evidence.service.js';

const LEARNING_GRANULARITY = AggregationGranularity.MONTHLY;

const EVIDENCE_GRADE_WEIGHTS: Record<EvidenceGrade, number> = {
  [EvidenceGrade.HIGH_SIGNAL]: 1.0,
  [EvidenceGrade.DIRECTIONAL]: 0.6,
  [EvidenceGrade.LOW_SIGNAL]: 0.0,
  [EvidenceGrade.INSUFFICIENT_DATA]: 0.0,
  [EvidenceGrade.ACTION_PROPOSED]: 0.0,
};

export interface RecomputeLearnedProfileResult {
  updatedWeightsCount: number;
  deactivatedWeightsCount: number;
}

/**
 * Recompute learned dimension weights and profile longitudinally across historical MONTHLY buckets (Test AC & Test AF).
 * Enforces:
 * - Invariant 31: Profile learning is strictly MONTHLY and evidence-gated (DIRECTIONAL & HIGH_SIGNAL).
 * - Invariant 32: Uses mandatory canonical asOf timestamp for decay calculations (Test BL).
 * - Invariant 33: Stale learned weights from earlier revisions are deactivated (Test AJ).
 * - Step 5: Enqueues TRIGGER_RECOMMENDATIONS outbox event with canonical asOf.
 */
export async function recomputeLearnedProfile(
  tx: PrismaTransactionClient,
  socialAccountId: string,
  currentRevision: number,
  asOf: Date,
): Promise<RecomputeLearnedProfileResult> {
  // 1. Revision guard: syncState.analyticsRevision must match currentRevision exactly
  const syncState = await tx.analyticsSyncState.findUniqueOrThrow({
    where: { socialAccountId },
    select: { analyticsRevision: true, workspaceId: true },
  });

  if (syncState.analyticsRevision !== currentRevision) {
    throw new Error(
      `Cannot recompute learned profile: syncState.analyticsRevision (${syncState.analyticsRevision}) !== currentRevision (${currentRevision}).`,
    );
  }

  // Ensure LearnedPerformanceProfile exists or create default
  let profile = await tx.learnedPerformanceProfile.findUnique({
    where: { socialAccountId },
  });

  if (!profile) {
    profile = await tx.learnedPerformanceProfile.create({
      data: {
        workspaceId: syncState.workspaceId,
        socialAccountId,
        analyticsRevisionAtComputation: currentRevision,
        lastComputedAt: asOf,
      },
    });
  }

  const halfLifeDays = 30.0;
  const minObs = 5;

  // 2. Query strictly canonical MONTHLY aggregates with non-null metrics (Test AF, Test AK)
  const historicalAggregates = await tx.performanceAggregate.findMany({
    where: {
      socialAccountId,
      observationSlot: ObservationSlot.T_24H,
      granularity: LEARNING_GRANULARITY,
      sampleSize: { gte: minObs },
      complementSize: { gte: minObs },
      subjectAvgEngagementByViews: { not: null },
    },
    orderBy: { bucketDate: 'asc' },
  });

  const groups = new Map<string, typeof historicalAggregates>();
  for (const agg of historicalAggregates) {
    const key = `${agg.dimension}:${agg.dimensionValue}`;
    let list = groups.get(key);
    if (!list) {
      list = [];
      groups.set(key, list);
    }
    list.push(agg);
  }

  let updatedWeightsCount = 0;

  // 3. Process each dimension identity across ALL historical monthly buckets
  for (const [key, buckets] of groups.entries()) {
    const [dimensionStr, dimensionValue] = key.split(':');
    if (!dimensionStr || !dimensionValue) continue;
    const dimension = dimensionStr as AggregationDimension;

    let numerator = 0;
    let denominator = 0;
    let cumulativeSampleSize = 0;
    let contributingBuckets = 0;
    let highestGrade: EvidenceGrade = EvidenceGrade.INSUFFICIENT_DATA;

    for (const b of buckets) {
      if (b.subjectAvgEngagementByViews == null) continue;

      cumulativeSampleSize += b.sampleSize;

      const grade = deriveEvidenceGrade({
        sampleSize: b.sampleSize,
        complementSize: b.complementSize,
        cohensD: b.cohensD,
        pValue: b.welchPValue,
        ci95Lower: b.ci95Lower,
        ci95Upper: b.ci95Upper,
        passesFDR: b.passesFDR ?? false,
      });

      if (grade === EvidenceGrade.HIGH_SIGNAL) {
        highestGrade = EvidenceGrade.HIGH_SIGNAL;
      } else if (
        grade === EvidenceGrade.DIRECTIONAL &&
        highestGrade !== EvidenceGrade.HIGH_SIGNAL
      ) {
        highestGrade = EvidenceGrade.DIRECTIONAL;
      }

      const evidenceWeight = EVIDENCE_GRADE_WEIGHTS[grade];
      if (evidenceWeight <= 0) continue;

      contributingBuckets++;

      // Age in days relative to canonical analytical asOf
      const ageDays = Math.max(
        0,
        (asOf.getTime() - b.bucketDate.getTime()) / (1000 * 86400),
      );
      const decayFactor = Math.pow(0.5, ageDays / halfLifeDays);

      const sampleWeight = Math.min(50, b.sampleSize);
      const metric = b.subjectAvgEngagementByViews;

      const combinedWeight = sampleWeight * decayFactor * evidenceWeight;
      numerator += metric * combinedWeight;
      denominator += combinedWeight;
    }

    if (denominator <= 0) continue;

    const rawWeight = numerator / denominator;
    const decayedWeight = Math.min(5.0, Math.max(0.0, rawWeight));

    await tx.learnedDimensionWeight.upsert({
      where: {
        uq_learned_dim_weight: {
          socialAccountId,
          dimension,
          dimensionValue,
          observationSlot: ObservationSlot.T_24H,
        },
      },
      create: {
        profileId: profile.id,
        workspaceId: profile.workspaceId,
        socialAccountId,
        dimension,
        dimensionValue,
        observationSlot: ObservationSlot.T_24H,
        rawWeight,
        decayedWeight,
        totalSampleSize: cumulativeSampleSize,
        eligibleBucketCount: buckets.length,
        evidenceBucketCount: contributingBuckets,
        highestEvidenceGrade: highestGrade,
        isActive: true,
        analyticsRevision: currentRevision,
        computedAt: asOf,
      },
      update: {
        rawWeight,
        decayedWeight,
        totalSampleSize: cumulativeSampleSize,
        eligibleBucketCount: buckets.length,
        evidenceBucketCount: contributingBuckets,
        highestEvidenceGrade: highestGrade,
        isActive: true,
        analyticsRevision: currentRevision,
        computedAt: asOf,
      },
    });

    updatedWeightsCount++;
  }

  // 4. Deactivate stale learned weights scoped to (socialAccountId, T_24H) (Test AJ)
  const deactivationResult = await tx.learnedDimensionWeight.updateMany({
    where: {
      socialAccountId,
      observationSlot: ObservationSlot.T_24H,
      analyticsRevision: { lt: currentRevision },
      isActive: true,
    },
    data: { isActive: false },
  });

  // 5. Update optimal window recommendations from active weights
  const bestHour = await tx.learnedDimensionWeight.findFirst({
    where: {
      socialAccountId,
      dimension: AggregationDimension.PUBLISH_HOUR_UTC,
      isActive: true,
      highestEvidenceGrade: {
        in: [EvidenceGrade.DIRECTIONAL, EvidenceGrade.HIGH_SIGNAL],
      },
    },
    orderBy: { decayedWeight: 'desc' },
  });

  const bestDay = await tx.learnedDimensionWeight.findFirst({
    where: {
      socialAccountId,
      dimension: AggregationDimension.PUBLISH_DAY_OF_WEEK,
      isActive: true,
      highestEvidenceGrade: {
        in: [EvidenceGrade.DIRECTIONAL, EvidenceGrade.HIGH_SIGNAL],
      },
    },
    orderBy: { decayedWeight: 'desc' },
  });

  const bestTopic = await tx.learnedDimensionWeight.findFirst({
    where: {
      socialAccountId,
      dimension: AggregationDimension.TOPIC,
      isActive: true,
      highestEvidenceGrade: {
        in: [EvidenceGrade.DIRECTIONAL, EvidenceGrade.HIGH_SIGNAL],
      },
    },
    orderBy: { decayedWeight: 'desc' },
  });

  const bestFormat = await tx.learnedDimensionWeight.findFirst({
    where: {
      socialAccountId,
      dimension: AggregationDimension.FORMAT,
      isActive: true,
      highestEvidenceGrade: {
        in: [EvidenceGrade.DIRECTIONAL, EvidenceGrade.HIGH_SIGNAL],
      },
    },
    orderBy: { decayedWeight: 'desc' },
  });

  const bestLengthBucket = await tx.learnedDimensionWeight.findFirst({
    where: {
      socialAccountId,
      dimension: AggregationDimension.POST_LENGTH_BUCKET,
      isActive: true,
      highestEvidenceGrade: {
        in: [EvidenceGrade.DIRECTIONAL, EvidenceGrade.HIGH_SIGNAL],
      },
    },
    orderBy: { decayedWeight: 'desc' },
  });

  await tx.learnedPerformanceProfile.update({
    where: { id: profile.id },
    data: {
      bestHourUtc: bestHour ? parseInt(bestHour.dimensionValue, 10) : null,
      bestHourWeight: bestHour?.decayedWeight ?? null,
      bestHourSampleSize: bestHour?.totalSampleSize ?? null,
      bestHourRevision: bestHour?.analyticsRevision ?? null,

      bestDay: bestDay ? parseInt(bestDay.dimensionValue, 10) : null,
      bestDayWeight: bestDay?.decayedWeight ?? null,
      bestDaySampleSize: bestDay?.totalSampleSize ?? null,
      bestDayRevision: bestDay?.analyticsRevision ?? null,

      bestTopic: bestTopic?.dimensionValue ?? null,
      bestTopicWeight: bestTopic?.decayedWeight ?? null,
      bestTopicSampleSize: bestTopic?.totalSampleSize ?? null,
      bestTopicRevision: bestTopic?.analyticsRevision ?? null,

      bestFormat: bestFormat?.dimensionValue ?? null,
      bestFormatWeight: bestFormat?.decayedWeight ?? null,
      bestFormatSampleSize: bestFormat?.totalSampleSize ?? null,
      bestFormatRevision: bestFormat?.analyticsRevision ?? null,

      bestLengthBucket: bestLengthBucket?.dimensionValue ?? null,
      bestLengthBucketWeight: bestLengthBucket?.decayedWeight ?? null,
      bestLengthBucketSampleSize: bestLengthBucket?.totalSampleSize ?? null,
      bestLengthBucketRevision: bestLengthBucket?.analyticsRevision ?? null,

      analyticsRevisionAtComputation: currentRevision,
      lastComputedAt: asOf,
    },
  });

  // 6. Trigger recommendations outbox event with canonical asOf (Invariant 32, Test BL)
  const dedupeKey = `recommendations:${socialAccountId}:rev${currentRevision}`;
  await tx.analyticsOutboxEvent.upsert({
    where: { dedupeKey },
    create: {
      workspaceId: profile.workspaceId,
      socialAccountId,
      dedupeKey,
      eventType: AnalyticsOutboxType.TRIGGER_RECOMMENDATIONS,
      payload: {
        workspaceId: profile.workspaceId,
        socialAccountId,
        sourceRevision: currentRevision,
        asOf: asOf.toISOString(),
      },
    },
    update: {},
  });

  return {
    updatedWeightsCount,
    deactivatedWeightsCount: deactivationResult.count,
  };
}

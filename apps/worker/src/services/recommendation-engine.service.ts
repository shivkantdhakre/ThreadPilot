import {
  AggregationDimension,
  ObservationSlot,
  Prisma,
  PrismaClient,
  RecommendationAttributionStatus,
  RecommendationProvenanceType,
} from '@threadpilot/database';
import { Logger } from '@nestjs/common';

export type PrismaTransactionClient = Prisma.TransactionClient;

const logger = new Logger('RecommendationEngineService');

export class StaleRevisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleRevisionError';
  }
}

export class MissingProvenanceSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingProvenanceSourceError';
  }
}

export class ConfigurationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationIntegrityError';
  }
}

export class TenantIsolationViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantIsolationViolationError';
  }
}

export class InvalidExposureTransitionError extends Error {
  constructor(
    from: RecommendationAttributionStatus | null,
    to: RecommendationAttributionStatus,
  ) {
    super(
      `Invalid RecommendationExposure transition: cannot transition from ${from ?? 'INITIAL'} to ${to}.`,
    );
    this.name = 'InvalidExposureTransitionError';
  }
}

export const VALID_EXPOSURE_TRANSITIONS: Record<
  RecommendationAttributionStatus,
  RecommendationAttributionStatus[]
> = {
  [RecommendationAttributionStatus.EXPOSED]: [
    RecommendationAttributionStatus.ACCEPTED,
    RecommendationAttributionStatus.DISMISSED,
  ],
  [RecommendationAttributionStatus.ACCEPTED]: [
    RecommendationAttributionStatus.PUBLISHED,
    RecommendationAttributionStatus.DISMISSED,
  ],
  [RecommendationAttributionStatus.DISMISSED]: [], // Terminal state
  [RecommendationAttributionStatus.PUBLISHED]: [
    RecommendationAttributionStatus.EVALUATED,
  ],
  [RecommendationAttributionStatus.EVALUATED]: [], // Terminal state
};

/**
 * Asserts that all linked entities in an attribution or observation chain resolve to the
 * identical workspace and social account (Test BD, Test BH).
 */
export function assertMatchingTenantScope(
  exposure: { workspaceId: string; socialAccountId: string },
  entity: { workspaceId: string; socialAccountId?: string },
  entityName: string,
): void {
  if (exposure.workspaceId !== entity.workspaceId) {
    throw new TenantIsolationViolationError(
      `Multi-tenant isolation violation: cross-workspace linkage between exposure (${exposure.workspaceId}) and ${entityName} (${entity.workspaceId}) rejected.`,
    );
  }
  if (entity.socialAccountId && exposure.socialAccountId !== entity.socialAccountId) {
    throw new TenantIsolationViolationError(
      `Multi-tenant isolation violation: cross-account linkage between exposure (${exposure.socialAccountId}) and ${entityName} (${entity.socialAccountId}) rejected.`,
    );
  }
}

/**
 * Strict Recommendation Attribution FSM & Stage-Mandatory Validation (Test BC).
 */
export function validateRecommendationExposureTransition(
  currentStatus: RecommendationAttributionStatus | null,
  nextStatus: RecommendationAttributionStatus,
  record: {
    contentIdeaId?: string | null;
    draftId?: string | null;
    acceptedAt?: Date | null;
    publishedPostId?: string | null;
    publishedAt?: Date | null;
    evaluatedPostMetricId?: string | null;
    observedLift?: number | null;
    evaluatedAt?: Date | null;
  },
): void {
  // 1. Initial creation must enter EXPOSED state
  if (currentStatus === null) {
    if (nextStatus !== RecommendationAttributionStatus.EXPOSED) {
      throw new InvalidExposureTransitionError(null, nextStatus);
    }
    if (!record.contentIdeaId) {
      throw new Error('Initial RecommendationExposure in EXPOSED state requires contentIdeaId.');
    }
    return;
  }

  // 2. Validate legal transition graph
  const allowed = VALID_EXPOSURE_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new InvalidExposureTransitionError(currentStatus, nextStatus);
  }

  // 3. Stage-mandatory field validation for target status
  switch (nextStatus) {
    case RecommendationAttributionStatus.ACCEPTED:
      if (!record.contentIdeaId || !record.draftId || !record.acceptedAt) {
        throw new Error(
          'RecommendationExposure transition to ACCEPTED requires contentIdeaId, draftId, and acceptedAt.',
        );
      }
      break;
    case RecommendationAttributionStatus.DISMISSED:
      if (!record.contentIdeaId) {
        throw new Error('RecommendationExposure transition to DISMISSED requires contentIdeaId.');
      }
      break;
    case RecommendationAttributionStatus.PUBLISHED:
      if (!record.contentIdeaId || !record.draftId || !record.publishedPostId || !record.publishedAt) {
        throw new Error(
          'RecommendationExposure transition to PUBLISHED requires contentIdeaId, draftId, publishedPostId, and publishedAt.',
        );
      }
      break;
    case RecommendationAttributionStatus.EVALUATED:
      if (
        !record.contentIdeaId ||
        !record.draftId ||
        !record.publishedPostId ||
        !record.evaluatedPostMetricId ||
        record.observedLift == null ||
        !record.evaluatedAt
      ) {
        throw new Error(
          'RecommendationExposure transition to EVALUATED requires contentIdeaId, draftId, publishedPostId, evaluatedPostMetricId, observedLift, and evaluatedAt.',
        );
      }
      break;
  }
}

export interface ExplicitPreferenceLookup {
  preferredTopics?: string[];
  preferredFormats?: string[];
  preferredHookStyles?: string[];
  avoidedTopics?: string[];
  excludedTopics?: string[];
}

/**
 * Deterministic explicit preference score calculation (Test BJ).
 * Returns:
 * - 1.00 for explicitly preferred dimension values
 * - 0.10 for explicitly avoided dimension values
 * - 0.50 for neutral baseline (unconfigured / default)
 */
export function computeExplicitPreferenceScore(
  dimension: AggregationDimension,
  dimensionValue: string,
  preferences?: ExplicitPreferenceLookup | null,
): number {
  if (!preferences) {
    return 0.50; // Documented neutral baseline prior when no explicit preferences exist
  }

  if (dimension === AggregationDimension.TOPIC) {
    if (preferences.preferredTopics?.includes(dimensionValue)) return 1.0;
    if (
      preferences.avoidedTopics?.includes(dimensionValue) ||
      preferences.excludedTopics?.includes(dimensionValue)
    ) {
      return 0.10;
    }
  } else if (dimension === AggregationDimension.FORMAT) {
    if (preferences.preferredFormats?.includes(dimensionValue)) return 1.0;
  }

  return 0.50; // Neutral baseline for neutral dimension values
}

export interface CandidateRecommendation {
  dimension: AggregationDimension;
  dimensionValue: string;
  topic: string;
  hookStyle: string;
  suggestedPrompt: string;
  strategy: 'EXPLOITATION' | 'EXPLORATION';
  provenanceType: RecommendationProvenanceType;
  sourceWeightId?: string | undefined;
  sourceInsightId?: string | undefined;
  score: number;
}

/**
 * Configuration-driven recommendation candidate generation executing OUTSIDE database transactions.
 * Enforces:
 * 1. Fail-closed scoring configuration: throws ConfigurationIntegrityError if active RecommendationScoringConfig is missing (Test BK).
 * 2. Deterministic temporal reference: uses caller-provided asOf date for freshness and cooldown (Test BK, Test BL).
 * 3. Dynamic preference scoring: incorporates computeExplicitPreferenceScore (Test BJ).
 * 4. Approximate integer exploration allocation: round(cycleBudget * explorationFraction).
 * 5. Preservation of native dimension identities without collapsing to 'general_insight'.
 * 6. True under-sampled exploration & 7-day cooldown (Test BK).
 */
export async function generateContentRecommendations(
  prisma: PrismaClient | PrismaTransactionClient,
  workspaceId: string,
  socialAccountId: string,
  profile: any,
  sourceRevision: number,
  asOf: Date,
  userPreferences?: ExplicitPreferenceLookup | null,
): Promise<CandidateRecommendation[]> {
  // 1. Fetch active scoring configuration (Fail-Closed: zero implicit fallback) (Test BK)
  const scoringConfig = await prisma.recommendationScoringConfig.findFirst({
    where: { isActive: true },
  });
  if (!scoringConfig) {
    throw new ConfigurationIntegrityError(
      'Recommendation generation halted: exactly one active RecommendationScoringConfig is required in PostgreSQL, but none was found.',
    );
  }

  // Budget pre-check (advisory outside transaction; strictly enforced under row lock during persistence)
  const maxCycle = profile?.maxRecommendationsPerCycle ?? scoringConfig.maxCandidatesPerCycle ?? 4;
  const maxPending = profile?.maxPendingRecommendations ?? 10;

  const pendingExposuresCount = await prisma.recommendationExposure.count({
    where: {
      socialAccountId,
      attributionStatus: {
        in: [
          RecommendationAttributionStatus.EXPOSED,
          RecommendationAttributionStatus.ACCEPTED,
        ],
      },
    },
  });

  const remainingBudget = Math.max(0, maxPending - pendingExposuresCount);
  const cycleBudget = Math.min(maxCycle, remainingBudget);

  if (cycleBudget <= 0) {
    logger.log(
      `Recommendation budget exhausted for account ${socialAccountId}: pending=${pendingExposuresCount}, maxPending=${maxPending}. Generation skipped.`,
    );
    return [];
  }

  const explorationFraction = scoringConfig.explorationFraction ?? profile.explorationFraction ?? 0.20;
  const halfLifeDays = scoringConfig.halfLifeDays ?? profile.decayHalfLifeDays ?? 30.0;

  // 3. Deterministic cooldown check using asOf reference timestamp (Test BK)
  const sevenDaysAgo = new Date(asOf.getTime() - 7 * 86400000);
  const recentExposures = await prisma.recommendationExposure.findMany({
    where: {
      socialAccountId,
      exposedAt: { gte: sevenDaysAgo, lte: asOf },
    },
    select: {
      explorationDimension: true,
      explorationValue: true,
      learnedWeight: {
        select: { dimension: true, dimensionValue: true },
      },
      insight: {
        select: { dimension: true, dimensionValue: true },
      },
    },
  });

  const cooledDownKeys = new Set<string>();
  for (const exp of recentExposures) {
    if (exp.explorationDimension && exp.explorationValue) {
      cooledDownKeys.add(`${exp.explorationDimension}:${exp.explorationValue}`);
    }
    if (exp.learnedWeight) {
      cooledDownKeys.add(`${exp.learnedWeight.dimension}:${exp.learnedWeight.dimensionValue}`);
    }
    if (exp.insight) {
      cooledDownKeys.add(`${exp.insight.dimension}:${exp.insight.dimensionValue}`);
    }
  }

  // 4. Fetch available high-signal insights to link explicit provenance (Test BF)
  const activeInsights = await prisma.insight.findMany({
    where: {
      socialAccountId,
      isActive: true,
      passesFDR: true,
    },
    select: {
      id: true,
      dimension: true,
      dimensionValue: true,
      absoluteDelta: true,
    },
  });
  const insightByDimKey = new Map<string, string>();
  for (const ins of activeInsights) {
    insightByDimKey.set(`${ins.dimension}:${ins.dimensionValue}`, ins.id);
  }

  // 5. Integer exploration allocation rule:
  // explorationCount = Math.round(cycleBudget * explorationFraction)
  // exploitationCount = cycleBudget - explorationCount
  const targetExploration = Math.round(cycleBudget * explorationFraction);
  const targetExploitation = cycleBudget - targetExploration;

  const candidates: CandidateRecommendation[] = [];
  const dimensionCounts: Record<string, number> = {};

  const incrementDim = (dim: AggregationDimension): boolean => {
    const current = dimensionCounts[dim] ?? 0;
    if (current >= 2) return false; // Diversity constraint: max 2 per dimension type
    dimensionCounts[dim] = current + 1;
    return true;
  };

  // 6. Exploitation selection (from active learned weights)
  const activeWeights = (profile.weights && profile.weights.length > 0)
    ? (profile.weights as any[])
    : await prisma.learnedDimensionWeight.findMany({
        where: {
          socialAccountId,
          isActive: true,
          observationSlot: ObservationSlot.T_24H,
        },
        orderBy: { decayedWeight: 'desc' },
      });

  const rankedExploitationWeights = activeWeights
    .filter((w) => !cooledDownKeys.has(`${w.dimension}:${w.dimensionValue}`))
    .map((w) => {
      // Deterministic freshness decay calculation relative to asOf (Test BK)
      const daysSinceComputed = Math.max(0, (asOf.getTime() - new Date(w.computedAt).getTime()) / 86400000);
      const freshnessScore = Math.exp(-daysSinceComputed / halfLifeDays);
      const learnedScore = Math.max(0, Math.min(1.0, w.decayedWeight));
      // Dynamic preference-derived deterministic score (Test BJ)
      const explicitScore = computeExplicitPreferenceScore(w.dimension, w.dimensionValue, userPreferences);
      const compositeScore =
        scoringConfig.weightLearnedWeight * learnedScore +
        scoringConfig.weightFreshness * freshnessScore +
        scoringConfig.weightExplicitPref * explicitScore;
      return { weight: w, compositeScore };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);

  for (const item of rankedExploitationWeights) {
    if (candidates.length >= targetExploitation) break;
    const w = item.weight;
    if (!incrementDim(w.dimension)) continue; // Respect diversity

    const matchingInsightId = insightByDimKey.get(`${w.dimension}:${w.dimensionValue}`);
    const provenanceType = matchingInsightId
      ? RecommendationProvenanceType.INSIGHT
      : RecommendationProvenanceType.LEARNED_WEIGHT;

    let topic = 'strategic_content';
    let hookStyle = 'QUESTION';
    let promptGuidance = `Leverage proven performance on ${w.dimension} (${w.dimensionValue})`;

    if (w.dimension === AggregationDimension.TOPIC) {
      topic = w.dimensionValue;
    } else if (w.dimension === AggregationDimension.FORMAT) {
      promptGuidance = `Deliver content using top-performing format structure: ${w.dimensionValue}`;
    } else if (
      w.dimension === AggregationDimension.PUBLISH_DAY_OF_WEEK ||
      w.dimension === AggregationDimension.PUBLISH_HOUR_UTC
    ) {
      promptGuidance = `Optimize publishing schedule for peak engagement window: ${w.dimensionValue}`;
    }

    candidates.push({
      dimension: w.dimension,
      dimensionValue: w.dimensionValue,
      topic,
      hookStyle,
      suggestedPrompt: `${promptGuidance}. Predicted composite score: ${(item.compositeScore * 100).toFixed(1)}%.`,
      strategy: 'EXPLOITATION',
      provenanceType,
      sourceInsightId: matchingInsightId ?? undefined,
      sourceWeightId: matchingInsightId ? undefined : w.id,
      score: item.compositeScore,
    });
  }

  // 7. Exploration selection (query true under-sampled dimensions)
  const remainingExplorationSlots = cycleBudget - candidates.length;
  if (remainingExplorationSlots > 0) {
    const existingWeightKeys = new Set(activeWeights.map((w: any) => `${w.dimension}:${w.dimensionValue}`));
    const underSampledAggregates = await prisma.performanceAggregate.findMany({
      where: {
        socialAccountId,
        observationSlot: ObservationSlot.T_24H,
        sampleSize: { lt: profile.minimumObservationsForLearning ?? 5 },
      },
      orderBy: { sampleSize: 'asc' },
      take: 10,
    });

    const eligibleExploration = underSampledAggregates.filter(
      (agg) =>
        !cooledDownKeys.has(`${agg.dimension}:${agg.dimensionValue}`) &&
        !existingWeightKeys.has(`${agg.dimension}:${agg.dimensionValue}`) &&
        (dimensionCounts[agg.dimension] ?? 0) < 2,
    );

    for (const agg of eligibleExploration) {
      if (candidates.length >= cycleBudget) break;
      if (!incrementDim(agg.dimension)) continue;

      candidates.push({
        dimension: agg.dimension,
        dimensionValue: agg.dimensionValue,
        topic: agg.dimension === AggregationDimension.TOPIC ? agg.dimensionValue : 'exploratory_topic',
        hookStyle: 'CONTRARIAN',
        suggestedPrompt: `Exploratory test on under-sampled dimension ${agg.dimension}:${agg.dimensionValue} to expand performance frontier.`,
        strategy: 'EXPLORATION',
        provenanceType: RecommendationProvenanceType.EXPLORATION,
        score: 0.50, // Neutral exploration prior
      });
    }

    // Default fallback exploration candidate if no historical aggregate exists
    if (candidates.length < cycleBudget && incrementDim(AggregationDimension.TOPIC)) {
      candidates.push({
        dimension: AggregationDimension.TOPIC,
        dimensionValue: 'emerging_discussion',
        topic: 'emerging_discussion',
        hookStyle: 'CONTRARIAN',
        suggestedPrompt: 'Exploratory hypothesis on emerging conversational theme without historical bias.',
        strategy: 'EXPLORATION',
        provenanceType: RecommendationProvenanceType.EXPLORATION,
        score: 0.50,
      });
    }
  }

  return candidates;
}

/**
 * Fast atomic persistence executing inside the row-locked transaction (Test BI, Test BF, Test BH).
 * Creates ContentIdea and initializes RecommendationExposure with attributionStatus = EXPOSED.
 */
export async function persistContentRecommendations(
  tx: PrismaTransactionClient,
  workspaceId: string,
  socialAccountId: string,
  candidates: CandidateRecommendation[],
  sourceRevision: number,
  asOf: Date,
  maxPendingRecommendations: number = 10,
): Promise<number> {
  // Re-verify pending exposures under row lock to prevent concurrent budget overruns (Test BI)
  const currentPendingCount = await tx.recommendationExposure.count({
    where: {
      socialAccountId,
      attributionStatus: {
        in: [
          RecommendationAttributionStatus.EXPOSED,
          RecommendationAttributionStatus.ACCEPTED,
        ],
      },
    },
  });

  const remainingPendingBudget = Math.max(0, maxPendingRecommendations - currentPendingCount);
  if (remainingPendingBudget <= 0) {
    logger.log(
      `Pending recommendation budget exhausted under row lock for account ${socialAccountId} (pending=${currentPendingCount}, maxPending=${maxPendingRecommendations}). 0 candidates persisted.`,
    );
    return 0;
  }

  let persistedCount = 0;
  for (const cand of candidates) {
    if (persistedCount >= remainingPendingBudget) {
      logger.log(
        `Reached pending recommendation limit (${maxPendingRecommendations}) during persistence. Truncating candidate batch.`,
      );
      break;
    }

    // 1. Cycle idempotency key: deterministic for this cycle/revision/dimension
    const cycleIdempotencyKey = `${workspaceId}_${socialAccountId}_rev${sourceRevision}_${cand.dimension}_${cand.dimensionValue}`;

    // Skip if already generated during this cycle (idempotency guard)
    const existing = await tx.recommendationExposure.findUnique({
      where: { cycleIdempotencyKey },
      select: { id: true },
    });
    if (existing) {
      logger.log(`Recommendation for key ${cycleIdempotencyKey} already exists. Skipping.`);
      continue;
    }

    // 2. Explicit provenance source validation (zero arbitrary fallbacks) (Test BF)
    if (cand.provenanceType === RecommendationProvenanceType.INSIGHT) {
      if (!cand.sourceInsightId) {
        throw new MissingProvenanceSourceError(
          `Recommendation candidate for ${cand.dimension}:${cand.dimensionValue} declared INSIGHT provenance but has null sourceInsightId.`,
        );
      }
      const insight = await tx.insight.findUniqueOrThrow({
        where: { id: cand.sourceInsightId },
        select: { id: true, workspaceId: true, socialAccountId: true },
      });
      assertMatchingTenantScope({ workspaceId, socialAccountId }, insight, 'Insight');
    } else if (cand.provenanceType === RecommendationProvenanceType.LEARNED_WEIGHT) {
      if (!cand.sourceWeightId) {
        throw new MissingProvenanceSourceError(
          `Recommendation candidate for ${cand.dimension}:${cand.dimensionValue} declared LEARNED_WEIGHT provenance but has null sourceWeightId.`,
        );
      }
      const weight = await tx.learnedDimensionWeight.findUniqueOrThrow({
        where: { id: cand.sourceWeightId },
        select: { id: true, workspaceId: true, socialAccountId: true },
      });
      assertMatchingTenantScope({ workspaceId, socialAccountId }, weight, 'LearnedDimensionWeight');
    } else if (cand.provenanceType === RecommendationProvenanceType.EXPLORATION) {
      if (!cand.dimension || !cand.dimensionValue) {
        throw new MissingProvenanceSourceError(
          `Recommendation candidate declared EXPLORATION provenance without valid dimension or dimensionValue.`,
        );
      }
    }

    // 3. Create ContentIdea with tenant scope
    const idea = await tx.contentIdea.create({
      data: {
        workspaceId,
        socialAccountId,
        title: cand.topic,
        concept: cand.suggestedPrompt,
        reason: `Generated by intelligence loop for ${cand.dimension}:${cand.dimensionValue}`,
        format: cand.dimension === AggregationDimension.FORMAT ? cand.dimensionValue : 'SINGLE_POST',
        topic: cand.topic,
        confidence: cand.score,
        sources: ['analytics_engine'],
        hookStyle: cand.hookStyle,
        suggestedPrompt: cand.suggestedPrompt,
        predictedScore: cand.score,
        status: 'SUGGESTED',
      },
    });

    assertMatchingTenantScope({ workspaceId, socialAccountId }, idea, 'ContentIdea');

    // 4. Validate initial transition to EXPOSED state (Test BC)
    validateRecommendationExposureTransition(null, RecommendationAttributionStatus.EXPOSED, {
      contentIdeaId: idea.id,
    });

    // 5. Create RecommendationExposure with explicit provenance and composite tenant keys (Test BF, Test BH)
    await tx.recommendationExposure.create({
      data: {
        workspaceId,
        socialAccountId,
        provenanceType: cand.provenanceType,
        insightId: cand.provenanceType === RecommendationProvenanceType.INSIGHT ? (cand.sourceInsightId ?? null) : null,
        learnedWeightId: cand.provenanceType === RecommendationProvenanceType.LEARNED_WEIGHT ? (cand.sourceWeightId ?? null) : null,
        explorationDimension: cand.provenanceType === RecommendationProvenanceType.EXPLORATION ? (cand.dimension ?? null) : null,
        explorationValue: cand.provenanceType === RecommendationProvenanceType.EXPLORATION ? (cand.dimensionValue ?? null) : null,
        contentIdeaId: idea.id,
        attributionStatus: RecommendationAttributionStatus.EXPOSED,
        analyticsRevisionAtGeneration: sourceRevision,
        cycleIdempotencyKey,
        exposedAt: asOf,
      },
    });

    persistedCount++;
  }

  return persistedCount;
}

export interface RecommendationGenerationJobData {
  workspaceId: string;
  socialAccountId: string;
  sourceRevision: number;
  asOf: string;
}

/**
 * Execute recommendation generation job with symmetric revision guard & row-locked budget enforcement (Test BB, BI, BK, BL).
 */
export async function processRecommendationGenerationJob(
  prisma: PrismaClient,
  data: RecommendationGenerationJobData,
): Promise<{ success: boolean; persistedCount: number }> {
  const { workspaceId, socialAccountId, sourceRevision, asOf } = data;
  const asOfDate = new Date(asOf);

  // 1. Pre-check current analyticsRevision against sourceRevision (Test BB)
  const syncState = await prisma.analyticsSyncState.findUniqueOrThrow({
    where: { socialAccountId },
    select: { analyticsRevision: true },
  });

  if (syncState.analyticsRevision !== sourceRevision) {
    logger.warn(
      `Skipping recommendation generation: current analyticsRevision (${syncState.analyticsRevision}) != sourceRevision (${sourceRevision}).`,
    );
    return { success: false, persistedCount: 0 };
  }

  const profile = await prisma.learnedPerformanceProfile.findUniqueOrThrow({
    where: { socialAccountId },
    include: {
      weights: {
        where: { isActive: true, observationSlot: ObservationSlot.T_24H },
        orderBy: { decayedWeight: 'desc' },
      },
    },
  });

  if (profile.analyticsRevisionAtComputation !== sourceRevision) {
    logger.warn(
      `Skipping recommendation generation: profile revision (${profile.analyticsRevisionAtComputation}) != sourceRevision (${sourceRevision}).`,
    );
    return { success: false, persistedCount: 0 };
  }

  // Fetch optional user preferences for workspace (Test BJ)
  const userPrefs = await prisma.userPreferences.findUnique({
    where: { workspaceId },
  });

  // 2. Expensive generation executes OUTSIDE transaction with deterministic asOf reference
  const candidateRecommendations = await generateContentRecommendations(
    prisma,
    workspaceId,
    socialAccountId,
    profile,
    sourceRevision,
    asOfDate,
    userPrefs,
  );

  let persisted = 0;
  try {
    await prisma.$transaction(
      async (tx) => {
        // 3. Atomic row lock on analytics_sync_states fences the brief persistence step (Test BB)
        const [lockedState] = await tx.$queryRaw<{ analytics_revision: number }[]>`
          SELECT analytics_revision
          FROM analytics_sync_states
          WHERE social_account_id = ${socialAccountId}::uuid
          FOR UPDATE;
        `;

        if (lockedState?.analytics_revision !== sourceRevision) {
          throw new StaleRevisionError(
            `Stale recommendation generation aborted: current revision ${lockedState?.analytics_revision} != source ${sourceRevision}`,
          );
        }

        // 4. Persist ideas with locked budget enforcement (Test BI)
        persisted = await persistContentRecommendations(
          tx,
          workspaceId,
          socialAccountId,
          candidateRecommendations,
          sourceRevision,
          asOfDate,
          (profile as any)?.maxPendingRecommendations ?? 10,
        );
      },
      { timeout: 30000, maxWait: 10000 },
    );
  } catch (err: any) {
    if (err instanceof StaleRevisionError) {
      logger.warn(err.message);
      return { success: false, persistedCount: 0 }; // Cleanly exit: newer aggregation revision is now authoritative (Test BB)
    }
    throw err;
  }

  return { success: true, persistedCount: persisted };
}

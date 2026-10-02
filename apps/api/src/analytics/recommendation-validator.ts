import { RecommendationAttributionStatus } from '@threadpilot/database';

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
  [RecommendationAttributionStatus.DISMISSED]: [],
  [RecommendationAttributionStatus.PUBLISHED]: [
    RecommendationAttributionStatus.EVALUATED,
  ],
  [RecommendationAttributionStatus.EVALUATED]: [],
};

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

export class TenantIsolationViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantIsolationViolationError';
  }
}

export function assertMatchingTenantScope(
  exposure: { workspaceId: string; socialAccountId?: string },
  entity: { workspaceId: string; socialAccountId?: string },
  entityName: string,
): void {
  if (exposure.workspaceId !== entity.workspaceId) {
    throw new TenantIsolationViolationError(
      `Multi-tenant isolation violation: cross-workspace linkage between exposure (${exposure.workspaceId}) and ${entityName} (${entity.workspaceId}) rejected.`,
    );
  }
  if (entity.socialAccountId && exposure.socialAccountId && exposure.socialAccountId !== entity.socialAccountId) {
    throw new TenantIsolationViolationError(
      `Multi-tenant isolation violation: cross-account linkage between exposure (${exposure.socialAccountId}) and ${entityName} (${entity.socialAccountId}) rejected.`,
    );
  }
}

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
  if (currentStatus === null) {
    if (nextStatus !== RecommendationAttributionStatus.EXPOSED) {
      throw new InvalidExposureTransitionError(null, nextStatus);
    }
    if (!record.contentIdeaId) {
      throw new Error('Initial RecommendationExposure in EXPOSED state requires contentIdeaId.');
    }
    return;
  }

  const allowed = VALID_EXPOSURE_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new InvalidExposureTransitionError(currentStatus, nextStatus);
  }

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

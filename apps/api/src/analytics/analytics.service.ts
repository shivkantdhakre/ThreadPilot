import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  prisma,
  PrismaClient,
  AggregationDimension,
  ObservationSlot,
  AggregationGranularity,
  EvidenceGrade,
  RecommendationAttributionStatus,
} from '@threadpilot/database';
import { ContentService } from '../content/content.service';
import {
  assertMatchingTenantScope,
  validateRecommendationExposureTransition,
} from './recommendation-validator';

export interface OverviewQueryDto {
  socialAccountId?: string | undefined;
}

export interface AggregatesQueryDto {
  socialAccountId?: string | undefined;
  dimension?: AggregationDimension | undefined;
  slot?: ObservationSlot | undefined;
  granularity?: AggregationGranularity | undefined;
}

export interface InsightsQueryDto {
  socialAccountId?: string | undefined;
  isActive?: boolean | undefined;
  evidenceGrade?: EvidenceGrade | undefined;
  limit?: number | undefined;
}

export interface RecommendationsQueryDto {
  socialAccountId?: string | undefined;
  status?: RecommendationAttributionStatus | undefined;
  limit?: number | undefined;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly db: PrismaClient = prisma;

  constructor(private readonly contentService: ContentService) {}

  async getOverview(workspaceId: string, socialAccountId?: string | undefined) {
    const [
      publishedPostsCount,
      metricsAgg,
      recentObservations,
      learnedProfile,
      recentExposures,
    ] = await Promise.all([
      this.db.publishedPost.count({
        where: { workspaceId, ...(socialAccountId ? { socialAccountId } : {}) },
      }),
      this.db.postMetric.aggregate({
        where: { workspaceId, ...(socialAccountId ? { socialAccountId } : {}) },
        _count: { id: true },
        _sum: {
          views: true,
          likes: true,
          replies: true,
          reposts: true,
          quotes: true,
        },
        _avg: {
          engagementRateByViews: true,
          engagementRateByFollowers: true,
          replyRate: true,
          likeRate: true,
          repostRate: true,
          quoteRate: true,
        },
      }),
      this.db.analyticsObservation.groupBy({
        by: ['status'],
        where: { workspaceId, ...(socialAccountId ? { socialAccountId } : {}) },
        _count: { id: true },
      }),
      socialAccountId
        ? this.db.learnedPerformanceProfile.findUnique({
            where: { socialAccountId },
          })
        : this.db.learnedPerformanceProfile.findFirst({
            where: { workspaceId },
          }),
      this.db.recommendationExposure.groupBy({
        by: ['attributionStatus'],
        where: { workspaceId, ...(socialAccountId ? { socialAccountId } : {}) },
        _count: { id: true },
      }),
    ]);

    const observationStatusCounts: Record<string, number> = {};
    for (const obs of recentObservations) {
      observationStatusCounts[obs.status] = obs._count.id;
    }

    const attributionStatusCounts: Record<string, number> = {};
    for (const exp of recentExposures) {
      attributionStatusCounts[exp.attributionStatus] = exp._count.id;
    }

    return {
      publishedPostsCount,
      totalMetricsCaptured: metricsAgg._count.id,
      totals: {
        views: metricsAgg._sum.views ?? 0,
        likes: metricsAgg._sum.likes ?? 0,
        replies: metricsAgg._sum.replies ?? 0,
        reposts: metricsAgg._sum.reposts ?? 0,
        quotes: metricsAgg._sum.quotes ?? 0,
      },
      averages: {
        engagementRateByViews: metricsAgg._avg.engagementRateByViews ?? 0,
        engagementRateByFollowers: metricsAgg._avg.engagementRateByFollowers ?? 0,
        replyRate: metricsAgg._avg.replyRate ?? 0,
        likeRate: metricsAgg._avg.likeRate ?? 0,
        repostRate: metricsAgg._avg.repostRate ?? 0,
        quoteRate: metricsAgg._avg.quoteRate ?? 0,
      },
      observationHealth: {
        captured: observationStatusCounts['CAPTURED'] ?? 0,
        pending: observationStatusCounts['PENDING'] ?? 0,
        processing: observationStatusCounts['PROCESSING'] ?? 0,
        failed: observationStatusCounts['FAILED'] ?? 0,
        missed: observationStatusCounts['MISSED'] ?? 0,
        rateLimited: observationStatusCounts['RATE_LIMITED'] ?? 0,
      },
      attributionOverview: attributionStatusCounts,
      optimalWindows: learnedProfile
        ? {
            bestTopic: learnedProfile.bestTopic,
            bestFormat: learnedProfile.bestFormat,
            bestHourUtc: learnedProfile.bestHourUtc,
            bestDay: learnedProfile.bestDay,
            lastComputedAt: learnedProfile.lastComputedAt,
            analyticsRevisionAtComputation: learnedProfile.analyticsRevisionAtComputation,
          }
        : null,
    };
  }

  async getAggregates(workspaceId: string, params: AggregatesQueryDto) {
    const where: any = { workspaceId };
    if (params.socialAccountId) where.socialAccountId = params.socialAccountId;
    if (params.dimension) where.dimension = params.dimension;
    if (params.slot) where.observationSlot = params.slot;
    if (params.granularity) where.granularity = params.granularity;

    const aggregates = await this.db.performanceAggregate.findMany({
      where,
      orderBy: [{ bucketDate: 'desc' }, { subjectAvgEngagementByViews: 'desc' }],
      take: 100,
    });

    return {
      count: aggregates.length,
      data: aggregates,
    };
  }

  async getInsights(workspaceId: string, params: InsightsQueryDto) {
    const where: any = { workspaceId };
    if (params.socialAccountId) where.socialAccountId = params.socialAccountId;
    if (params.isActive !== undefined) where.isActive = params.isActive;
    if (params.evidenceGrade) where.evidenceGrade = params.evidenceGrade;

    const limit = Math.min(params.limit || 50, 100);

    const insights = await this.db.insight.findMany({
      where,
      include: {
        sourceAggregates: {
          take: 3,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      count: insights.length,
      data: insights,
    };
  }

  async getLearningProfile(workspaceId: string, socialAccountId?: string | undefined) {
    const profile = socialAccountId
      ? await this.db.learnedPerformanceProfile.findUnique({
          where: { socialAccountId },
          include: {
            weights: {
              where: { isActive: true, observationSlot: ObservationSlot.T_24H },
              orderBy: { decayedWeight: 'desc' },
            },
          },
        })
      : await this.db.learnedPerformanceProfile.findFirst({
          where: { workspaceId },
          include: {
            weights: {
              where: { isActive: true, observationSlot: ObservationSlot.T_24H },
              orderBy: { decayedWeight: 'desc' },
            },
          },
        });

    if (!profile) {
      return {
        profile: null,
        weights: [],
      };
    }

    return {
      profile: {
        id: profile.id,
        socialAccountId: profile.socialAccountId,
        bestTopic: profile.bestTopic,
        bestFormat: profile.bestFormat,
        bestLengthBucket: profile.bestLengthBucket,
        bestHourUtc: profile.bestHourUtc,
        bestDay: profile.bestDay,
        lastComputedAt: profile.lastComputedAt,
        analyticsRevisionAtComputation: profile.analyticsRevisionAtComputation,
      },
      weights: profile.weights,
    };
  }

  async getRecommendations(workspaceId: string, params: RecommendationsQueryDto) {
    const where: any = { workspaceId };
    if (params.socialAccountId) where.socialAccountId = params.socialAccountId;
    if (params.status) {
      where.attributionStatus = params.status;
    } else {
      where.attributionStatus = {
        in: [
          RecommendationAttributionStatus.EXPOSED,
          RecommendationAttributionStatus.ACCEPTED,
        ],
      };
    }

    const limit = Math.min(params.limit || 20, 50);

    const exposures = await this.db.recommendationExposure.findMany({
      where,
      include: {
        contentIdea: true,
        insight: {
          select: {
            id: true,
            dimension: true,
            dimensionValue: true,
            evidenceGrade: true,
            absoluteDelta: true,
            percentDelta: true,
            passesFDR: true,
            welchPValue: true,
            cohensD: true,
            observation: true,
            recommendation: true,
          },
        },
        learnedWeight: {
          select: {
            id: true,
            dimension: true,
            dimensionValue: true,
            decayedWeight: true,
            rawWeight: true,
            highestEvidenceGrade: true,
          },
        },
        draft: {
          select: {
            id: true,
            status: true,
          },
        },
        publishedPost: {
          select: {
            id: true,
            threadsPostId: true,
            publishedAt: true,
          },
        },
      },
      orderBy: { exposedAt: 'desc' },
      take: limit,
    });

    return {
      count: exposures.length,
      data: exposures,
    };
  }

  async acceptRecommendation(workspaceId: string, userId: string, exposureId: string) {
    const exposure = await this.db.recommendationExposure.findUnique({
      where: { id: exposureId },
      include: { contentIdea: true },
    });

    if (!exposure) {
      throw new NotFoundException(`Recommendation exposure ${exposureId} not found.`);
    }

    assertMatchingTenantScope({ workspaceId }, exposure, 'RecommendationExposure');

    if (exposure.attributionStatus !== RecommendationAttributionStatus.EXPOSED) {
      throw new BadRequestException(
        `Cannot accept recommendation: current status is ${exposure.attributionStatus}, expected EXPOSED.`,
      );
    }

    const draftData: { body: string; hook?: string; ideaId?: string } = {
      body: exposure.contentIdea?.suggestedPrompt || 'Draft based on recommendation',
    };
    if (exposure.contentIdeaId) {
      draftData.ideaId = exposure.contentIdeaId;
    }
    if (exposure.contentIdea?.hookStyle) {
      draftData.hook = exposure.contentIdea.hookStyle;
    }

    const draft = await this.contentService.createDraft(workspaceId, userId, draftData);

    validateRecommendationExposureTransition(
      RecommendationAttributionStatus.EXPOSED,
      RecommendationAttributionStatus.ACCEPTED,
      {
        contentIdeaId: exposure.contentIdeaId,
        draftId: draft.id,
        acceptedAt: new Date(),
      },
    );

    const updated = await this.db.recommendationExposure.update({
      where: { id: exposure.id },
      data: {
        draftId: draft.id,
        acceptedAt: new Date(),
        attributionStatus: RecommendationAttributionStatus.ACCEPTED,
      },
    });

    return {
      exposure: updated,
      draft,
    };
  }

  async dismissRecommendation(workspaceId: string, exposureId: string) {
    const exposure = await this.db.recommendationExposure.findUnique({
      where: { id: exposureId },
    });

    if (!exposure) {
      throw new NotFoundException(`Recommendation exposure ${exposureId} not found.`);
    }

    assertMatchingTenantScope({ workspaceId }, exposure, 'RecommendationExposure');

    validateRecommendationExposureTransition(
      exposure.attributionStatus,
      RecommendationAttributionStatus.DISMISSED,
      {
        contentIdeaId: exposure.contentIdeaId,
      },
    );

    const updated = await this.db.recommendationExposure.update({
      where: { id: exposure.id },
      data: {
        attributionStatus: RecommendationAttributionStatus.DISMISSED,
      },
    });

    return {
      exposure: updated,
    };
  }

  async replayOutboxEvents(
    workspaceId: string,
    userId: string,
    eventIds: string[],
    reason: string,
  ) {
    if (!eventIds || eventIds.length === 0) {
      throw new BadRequestException('eventIds array cannot be empty.');
    }

    const result = await this.db.$executeRaw`
      UPDATE analytics_outbox_events
      SET status = 'PENDING',
          delivery_generation = delivery_generation + 1,
          previous_attempt_count = attempt_count,
          attempt_count = 0,
          lease_token = NULL,
          lease_until = NULL,
          error_message = NULL,
          execute_at = NOW(),
          updated_at = NOW()
      WHERE id = ANY(${eventIds}::uuid[])
        AND workspace_id = ${workspaceId}::uuid
        AND status = 'FAILED';
    `;

    return {
      replayedCount: result,
      eventIds,
    };
  }
}

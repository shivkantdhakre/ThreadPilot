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
  ObservationStatus,
  AnalyticsOutboxType,
} from '@threadpilot/database';
import { ContentService } from '../content/content.service';
import {
  assertMatchingTenantScope,
  validateRecommendationExposureTransition,
} from './recommendation-validator';

// Observation slot configurations for backfill (immediate capture)
const BACKFILL_SLOTS = [
  ObservationSlot.T_24H,
  ObservationSlot.T_7D,
  ObservationSlot.T_30D,
];

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

  /**
   * Returns a summary of the analytics pipeline state so the UI can
   * explain why analytics might be empty (no published posts via ThreadPilot,
   * pending observations, etc.)
   */
  async getAnalyticsPipelineStatus(workspaceId: string, socialAccountId?: string) {
    const where = {
      workspaceId,
      ...(socialAccountId ? { socialAccountId } : {}),
    };

    const [
      ingestedPostCount,
      publishedPostCount,
      pendingObsCount,
      capturedObsCount,
      metricCount,
      aggregateCount,
      insightCount,
      recommendationCount,
      outboxPendingCount,
      outboxFailedCount,
    ] = await Promise.all([
      this.db.threadPost.count({
        where: socialAccountId
          ? { socialAccountId, sourceType: 'INGESTED' }
          : {
              socialAccount: { workspaceId },
              sourceType: 'INGESTED',
            },
      }),
      this.db.publishedPost.count({ where }),
      this.db.analyticsObservation.count({
        where: { ...where, status: { in: ['SCHEDULED', 'PROCESSING'] } },
      }),
      this.db.analyticsObservation.count({
        where: { ...where, status: 'CAPTURED' },
      }),
      this.db.postMetric.count({ where }),
      this.db.performanceAggregate.count({ where }),
      this.db.insight.count({ where }),
      this.db.recommendationExposure.count({ where }),
      this.db.analyticsOutboxEvent.count({
        where: { ...where, status: { in: ['PENDING', 'PROCESSING'] } },
      }),
      this.db.analyticsOutboxEvent.count({
        where: { ...where, status: 'FAILED' },
      }),
    ]);

    const isPopulated = metricCount > 0;
    const hasPendingWork = pendingObsCount > 0 || outboxPendingCount > 0;

    return {
      ingestedPostCount,
      publishedPostCount,
      pendingObsCount,
      capturedObsCount,
      metricCount,
      aggregateCount,
      insightCount,
      recommendationCount,
      outboxPendingCount,
      outboxFailedCount,
      isPopulated,
      hasPendingWork,
    };
  }

  /**
   * Backfills analytics data by creating PublishedPost records from
   * ingested ThreadPost records that don't have analytics yet.
   * Also creates immediate observation windows and outbox events to
   * trigger the analytics sync worker.
   */
  async backfillAnalytics(
    workspaceId: string,
    socialAccountId: string,
    limit = 50,
  ): Promise<{ backfilledCount: number; alreadyTracked: number; message: string }> {
    // 1. Find ingested ThreadPosts that have no corresponding PublishedPost
    const ingestedPosts = await this.db.threadPost.findMany({
      where: {
        socialAccount: { workspaceId },
        socialAccountId,
        sourceType: 'INGESTED',
        publishedPostId: null, // no PublishedPost yet
      },
      orderBy: { postedAt: 'desc' },
      take: limit,
    });

    if (ingestedPosts.length === 0) {
      // Check how many already have analytics
      const alreadyTracked = await this.db.publishedPost.count({
        where: { workspaceId, socialAccountId },
      });
      return {
        backfilledCount: 0,
        alreadyTracked,
        message:
          alreadyTracked > 0
            ? `All ${alreadyTracked} published posts are already being tracked for analytics.`
            : 'No ingested posts found. Run ingestion first via the Profile > Train Voice Model section.',
      };
    }

    // 2. Ensure AnalyticsSyncState exists
    await this.db.analyticsSyncState.upsert({
      where: { socialAccountId },
      create: { workspaceId, socialAccountId, analyticsRevision: 0, ingestionGeneration: 0 },
      update: {},
    });

    let backfilledCount = 0;

    for (const tp of ingestedPosts) {
      try {
        await this.db.$transaction(async (tx) => {
          const postText = tp.text || `Threads post from ${tp.postedAt?.toISOString() ?? 'unknown date'}`;

          // 3. Create synthetic ContentDraft + ContentVersion (tagged as BACKFILL)
          const draft = await tx.contentDraft.create({
            data: {
              workspaceId,
              status: 'PUBLISHED',
              generatedBy: 'BACKFILL',
            },
          });

          const version = await tx.contentVersion.create({
            data: {
              draftId: draft.id,
              version: 1,
              body: postText.slice(0, 500),
              hook: postText.split('\n')[0]?.slice(0, 100) ?? null,
              editedBy: 'BACKFILL',
            },
          });

          // 4. Create PublishedPost record
          const publishedPost = await tx.publishedPost.create({
            data: {
              workspaceId,
              socialAccountId,
              draftId: draft.id,
              publishedVersionId: version.id,
              threadsPostId: tp.threadsPostId,
              publishedAt: tp.postedAt ?? new Date(),
              publishedObservedAt: new Date(),
            },
          });

          // 5. Update ThreadPost to link back to PublishedPost
          await tx.threadPost.update({
            where: { id: tp.id },
            data: { publishedPostId: publishedPost.id },
          });

          // 6. Schedule immediate observation windows (backdated — capturable now)
          const publishedAt = tp.postedAt ?? new Date();
          for (const slot of BACKFILL_SLOTS) {
            const dedupeKey = `backfill_obs:${publishedPost.id}:${slot}`;
            const obs = await tx.analyticsObservation.upsert({
              where: {
                uq_observation_slot: { publishedPostId: publishedPost.id, observationSlot: slot },
              },
              create: {
                workspaceId,
                socialAccountId,
                publishedPostId: publishedPost.id,
                observationSlot: slot,
                scheduledFor: publishedAt,
                windowClosesAt: new Date(publishedAt.getTime() + 24 * 3600 * 1000),
                status: ObservationStatus.SCHEDULED,
              },
              update: {},
            });

            // 7. Add outbox event to trigger analytics sync
            await tx.analyticsOutboxEvent.upsert({
              where: { dedupeKey },
              create: {
                workspaceId,
                socialAccountId,
                dedupeKey,
                eventType: AnalyticsOutboxType.TRIGGER_OBSERVATION,
                executeAt: new Date(), // immediately
                payload: {
                  observationId: obs.id,
                  workspaceId,
                  socialAccountId,
                  publishedPostId: publishedPost.id,
                  slot,
                },
              },
              update: {},
            });
          }

          backfilledCount++;
        });
      } catch (err: any) {
        // Log and continue: skip posts that can't be backfilled (e.g. duplicate threadsPostId)
        this.logger.warn(
          `Skipping backfill for ThreadPost ${tp.id} (${tp.threadsPostId}): ${err?.message}`,
        );
      }
    }

    const alreadyTracked = await this.db.publishedPost.count({
      where: { workspaceId, socialAccountId },
    });

    return {
      backfilledCount,
      alreadyTracked,
      message:
        backfilledCount > 0
          ? `Successfully backfilled ${backfilledCount} posts. Analytics sync will run within the next few minutes.`
          : 'No new posts were backfilled. All ingested posts may already be tracked.',
    };
  }
}

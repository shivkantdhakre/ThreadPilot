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
        scheduled: observationStatusCounts['SCHEDULED'] ?? 0,
        processing: observationStatusCounts['PROCESSING'] ?? 0,
        failed: observationStatusCounts['FAILED'] ?? 0,
        missed: observationStatusCounts['MISSED'] ?? 0,
        rateLimited: observationStatusCounts['RATE_LIMITED'] ?? 0,
      },
      attributionOverview: attributionStatusCounts,
      optimalWindows: (learnedProfile && (learnedProfile.bestHourUtc != null || learnedProfile.bestDay != null || learnedProfile.bestTopic != null || learnedProfile.bestFormat != null))
        ? {
            bestTopic: learnedProfile.bestTopic,
            bestFormat: learnedProfile.bestFormat,
            bestHourUtc: learnedProfile.bestHourUtc,
            bestDay: learnedProfile.bestDay,
            lastComputedAt: learnedProfile.lastComputedAt,
            analyticsRevisionAtComputation: learnedProfile.analyticsRevisionAtComputation,
            isEmpirical: false,
          }
        : await this.getEmpiricalOptimalWindows(workspaceId, socialAccountId),
    };
  }

  private async getEmpiricalOptimalWindows(
    workspaceId: string,
    socialAccountId?: string | undefined,
  ) {
    const where: any = { workspaceId };
    if (socialAccountId) where.socialAccountId = socialAccountId;

    try {
      const [bestHour, bestDay, bestLength, bestTopic] = await Promise.all([
        this.db.performanceAggregate.findFirst({
          where: { ...where, dimension: 'PUBLISH_HOUR_UTC', sampleSize: { gte: 1 } },
          orderBy: { subjectAvgEngagementByViews: 'desc' },
        }),
        this.db.performanceAggregate.findFirst({
          where: { ...where, dimension: 'PUBLISH_DAY_OF_WEEK', sampleSize: { gte: 1 } },
          orderBy: { subjectAvgEngagementByViews: 'desc' },
        }),
        this.db.performanceAggregate.findFirst({
          where: { ...where, dimension: 'POST_LENGTH_BUCKET', sampleSize: { gte: 1 } },
          orderBy: { subjectAvgEngagementByViews: 'desc' },
        }),
        this.db.performanceAggregate.findFirst({
          where: { ...where, dimension: 'TOPIC', sampleSize: { gte: 1 } },
          orderBy: { subjectAvgEngagementByViews: 'desc' },
        }),
      ]);

      if (!bestHour && !bestDay && !bestLength && !bestTopic) {
        return null;
      }

      return {
        bestTopic: bestTopic?.dimensionValue ?? 'General Discussion',
        bestFormat: bestLength?.dimensionValue ? `${bestLength.dimensionValue} Post` : 'Single Post',
        bestHourUtc: bestHour ? parseInt(bestHour.dimensionValue, 10) : null,
        bestDay: bestDay ? parseInt(bestDay.dimensionValue, 10) : null,
        isEmpirical: true,
        lastComputedAt: new Date(),
        analyticsRevisionAtComputation: null,
      };
    } catch {
      return null;
    }
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

    const isUuid = (id: string): boolean =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (!eventIds.every(isUuid)) {
      throw new BadRequestException('All eventIds must be valid UUID strings');
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
      unbackfilledPostCount,
      postsMissingObsCount,
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
      this.db.threadPost.count({
        where: socialAccountId
          ? { socialAccountId, publishedPostId: null }
          : {
              socialAccount: { workspaceId },
              publishedPostId: null,
            },
      }),
      this.db.publishedPost.count({
        where: {
          ...where,
          analyticsObservations: { none: {} },
        },
      }),
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

    // Check if connected account is missing the threads_manage_insights scope
    let missingInsightsPermission = false;
    try {
      const activeAccount = socialAccountId
        ? await this.db.socialAccount.findUnique({
            where: { id: socialAccountId },
            include: { oauthToken: true },
          })
        : await this.db.socialAccount.findFirst({
            where: { workspaceId, isConnected: true },
            include: { oauthToken: true },
          });

      const targetAccountId = activeAccount?.id || socialAccountId;
      if (targetAccountId) {
        const unavailableCount = await this.db.analyticsObservation.count({
          where: {
            socialAccountId: targetAccountId,
            status: 'UNAVAILABLE',
          },
        });

        if (unavailableCount > 0) {
          missingInsightsPermission = true;
        } else if (metricCount === 0 && activeAccount?.oauthToken?.scopes) {
          missingInsightsPermission = !activeAccount.oauthToken.scopes.includes('threads_manage_insights');
        }
      }
    } catch {
      // Ignore scope check errors
    }

    const isPopulated = metricCount > 0;
    const hasPendingWork = pendingObsCount > 0 || outboxPendingCount > 0;

    return {
      ingestedPostCount,
      publishedPostCount,
      unbackfilledPostCount,
      postsMissingObsCount,
      missingInsightsPermission,
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
   * Backfills analytics data by:
   * 1. Scheduling observations for existing PublishedPosts that lack them (e.g. published prior to Phase 4).
   * 2. Creating PublishedPost + observation records from unlinked ThreadPosts (e.g. historical posts posted before connection).
   * All observation windows are given a valid future windowClosesAt (now + 7 days) and immediate outbox trigger events.
   */
  async backfillAnalytics(
    workspaceId: string,
    socialAccountId: string,
    limit = 500,
  ): Promise<{ backfilledCount: number; alreadyTracked: number; message: string }> {
    // 1. Ensure AnalyticsSyncState exists
    await this.db.analyticsSyncState.upsert({
      where: { socialAccountId },
      create: { workspaceId, socialAccountId, analyticsRevision: 0, ingestionGeneration: 0 },
      update: {},
    });

    let backfilledCount = 0;
    const now = new Date();
    // Window must be open in the future so workers and sweepers do not mark it MISSED
    const windowClosesAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    // 2. Schedule missing observations for existing PublishedPost records that have none
    const publishedWithoutObs = await this.db.publishedPost.findMany({
      where: {
        workspaceId,
        socialAccountId,
        analyticsObservations: { none: {} },
      },
    });

    for (const pp of publishedWithoutObs) {
      try {
        await this.db.$transaction(async (tx) => {
          for (const slot of BACKFILL_SLOTS) {
            const dedupeKey = `backfill_obs:${pp.id}:${slot}`;
            const obs = await tx.analyticsObservation.upsert({
              where: {
                uq_observation_slot: { publishedPostId: pp.id, observationSlot: slot },
              },
              create: {
                workspaceId,
                socialAccountId,
                publishedPostId: pp.id,
                observationSlot: slot,
                scheduledFor: now,
                windowClosesAt,
                status: ObservationStatus.SCHEDULED,
              },
              update: {
                scheduledFor: now,
                windowClosesAt,
                status: ObservationStatus.SCHEDULED,
              },
            });

            await tx.analyticsOutboxEvent.upsert({
              where: { dedupeKey },
              create: {
                workspaceId,
                socialAccountId,
                dedupeKey,
                eventType: AnalyticsOutboxType.TRIGGER_OBSERVATION,
                executeAt: now,
                payload: {
                  observationId: obs.id,
                  workspaceId,
                  socialAccountId,
                  publishedPostId: pp.id,
                  slot,
                },
              },
              update: {
                status: 'PENDING',
                executeAt: now,
                errorMessage: null,
              },
            });
          }
          backfilledCount++;
        });
      } catch (err: any) {
        this.logger.warn(`Skipping observation schedule for PublishedPost ${pp.id}: ${err?.message}`);
      }
    }

    // 3. Find unlinked ThreadPosts (historical posts posted before account was connected)
    const unlinkedPosts = await this.db.threadPost.findMany({
      where: {
        socialAccount: { workspaceId },
        socialAccountId,
        publishedPostId: null,
      },
      orderBy: { postedAt: 'desc' },
      take: limit,
    });

    for (const tp of unlinkedPosts) {
      try {
        await this.db.$transaction(async (tx) => {
          const postText = tp.text || `Threads post from ${tp.postedAt?.toISOString() ?? 'unknown date'}`;

          // Create synthetic ContentDraft + ContentVersion (tagged as BACKFILL)
          const draft = await tx.contentDraft.create({
            data: {
              workspaceId,
              status: 'READY',
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

          // Create PublishedPost record
          const publishedPost = await tx.publishedPost.create({
            data: {
              workspaceId,
              socialAccountId,
              draftId: draft.id,
              publishedVersionId: version.id,
              threadsPostId: tp.threadsPostId,
              publishedAt: tp.postedAt ?? now,
              publishedObservedAt: now,
            },
          });

          // Update ThreadPost to link back to PublishedPost
          await tx.threadPost.update({
            where: { id: tp.id },
            data: { publishedPostId: publishedPost.id },
          });

          // Schedule immediate observation windows with FUTURE windowClosesAt
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
                scheduledFor: now,
                windowClosesAt,
                status: ObservationStatus.SCHEDULED,
              },
              update: {
                scheduledFor: now,
                windowClosesAt,
                status: ObservationStatus.SCHEDULED,
              },
            });

            // Add outbox event to trigger analytics sync
            await tx.analyticsOutboxEvent.upsert({
              where: { dedupeKey },
              create: {
                workspaceId,
                socialAccountId,
                dedupeKey,
                eventType: AnalyticsOutboxType.TRIGGER_OBSERVATION,
                executeAt: now, // immediately
                payload: {
                  observationId: obs.id,
                  workspaceId,
                  socialAccountId,
                  publishedPostId: publishedPost.id,
                  slot,
                },
              },
              update: {
                status: 'PENDING',
                executeAt: now,
                errorMessage: null,
              },
            });
          }

          backfilledCount++;
        });
      } catch (err: any) {
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
          ? `Successfully synced ${backfilledCount} posts for analytics tracking. Metric sync queued.`
          : `All ${alreadyTracked} published posts are already tracked for analytics.`,
    };
  }
}

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsService } from '../dist/analytics/analytics.service.js';
import {
  AggregationDimension,
  ObservationSlot,
  AggregationGranularity,
  EvidenceGrade,
  RecommendationAttributionStatus,
} from '@threadpilot/database';

describe('Analytics Pipeline & Empirical Discovery Invariant Tests', () => {
  const mockContentService: any = {
    createDraft: async (_ws: string, _user: string, data: any) => ({
      id: 'draft-gen-1',
      ...data,
    }),
  };

  describe('Empirical Optimal Windows Discovery (Early Signal Fallback)', () => {
    it('computes empirical optimal parameters from top-performing aggregates when learned profile is empty', async () => {
      const service = new AnalyticsService(mockContentService);

      (service as any).db = {
        publishedPost: {
          count: async () => 10,
        },
        postMetric: {
          aggregate: async () => ({
            _count: { id: 25 },
            _sum: { views: 5000, likes: 250, replies: 30, reposts: 15, quotes: 5 },
            _avg: {
              engagementRateByViews: 6.0,
              engagementRateByFollowers: 12.0,
              replyRate: 0.6,
              likeRate: 5.0,
              repostRate: 0.3,
              quoteRate: 0.1,
            },
          }),
        },
        analyticsObservation: {
          groupBy: async () => [{ status: 'CAPTURED', _count: { id: 25 } }],
        },
        learnedPerformanceProfile: {
          findFirst: async () => null, // No longitudinal learned profile yet
        },
        recommendationExposure: {
          groupBy: async () => [],
        },
        performanceAggregate: {
          findFirst: async ({ where }: any) => {
            if (where.dimension === 'PUBLISH_HOUR_UTC') {
              return { dimensionValue: '16', subjectAvgEngagementByViews: 8.5 };
            }
            if (where.dimension === 'PUBLISH_DAY_OF_WEEK') {
              return { dimensionValue: '6', subjectAvgEngagementByViews: 9.2 }; // Saturday
            }
            if (where.dimension === 'POST_LENGTH_BUCKET') {
              return { dimensionValue: 'MEDIUM', subjectAvgEngagementByViews: 7.8 };
            }
            if (where.dimension === 'TOPIC') {
              return { dimensionValue: 'AI Engineering', subjectAvgEngagementByViews: 10.4 };
            }
            return null;
          },
        },
      };

      const overview = await service.getOverview('ws-emp-1');

      assert.equal(overview.publishedPostsCount, 10);
      assert.equal(overview.totalMetricsCaptured, 25);
      assert.equal(overview.totals.views, 5000);
      assert.equal(overview.totals.likes, 250);

      // Verify empirical fallback was activated
      assert.ok(overview.optimalWindows, 'Optimal windows must be present via empirical fallback');
      assert.equal(overview.optimalWindows.isEmpirical, true, 'Must be marked as empirical early signal');
      assert.equal(overview.optimalWindows.bestHourUtc, 16);
      assert.equal(overview.optimalWindows.bestDay, 6);
      assert.equal(overview.optimalWindows.bestTopic, 'AI Engineering');
      assert.equal(overview.optimalWindows.bestFormat, 'MEDIUM Post');
    });

    it('prefers longitudinal learnedPerformanceProfile over empirical fallback when validated profile exists', async () => {
      const service = new AnalyticsService(mockContentService);

      (service as any).db = {
        publishedPost: { count: async () => 50 },
        postMetric: {
          aggregate: async () => ({
            _count: { id: 100 },
            _sum: { views: 20000, likes: 1000, replies: 100, reposts: 50, quotes: 10 },
            _avg: { engagementRateByViews: 5.8 },
          }),
        },
        analyticsObservation: { groupBy: async () => [] },
        learnedPerformanceProfile: {
          findFirst: async () => ({
            bestTopic: 'Deep Learning',
            bestFormat: 'THREAD',
            bestHourUtc: 14,
            bestDay: 2,
            lastComputedAt: new Date('2026-09-30T12:00:00Z'),
            analyticsRevisionAtComputation: 4,
          }),
        },
        recommendationExposure: { groupBy: async () => [] },
      };

      const overview = await service.getOverview('ws-prof-1');

      assert.ok(overview.optimalWindows);
      assert.equal(overview.optimalWindows.isEmpirical, false, 'Must be marked as statistically validated');
      assert.equal(overview.optimalWindows.bestTopic, 'Deep Learning');
      assert.equal(overview.optimalWindows.bestHourUtc, 14);
      assert.equal(overview.optimalWindows.bestDay, 2);
    });
  });

  describe('Dynamic Permission Detection & Warning Semantics', () => {
    it('reports missingInsightsPermission = false when metricCount > 0 even if token scopes lack insight string', async () => {
      const service = new AnalyticsService(mockContentService);

      (service as any).db = {
        threadPost: { count: async () => 20 },
        publishedPost: { count: async () => 20 },
        postMetric: { count: async () => 65 }, // Captured metrics exist!
        analyticsObservation: {
          count: async ({ where }: any) => {
            if (where?.status === 'UNAVAILABLE') return 0; // No unauthorized errors!
            if (where?.status === 'CAPTURED') return 65;
            return 0;
          },
        },
        performanceAggregate: { count: async () => 120 },
        insight: { count: async () => 5 },
        recommendationExposure: { count: async () => 2 },
        analyticsOutboxEvent: { count: async () => 0 },
        socialAccount: {
          findFirst: async () => ({
            id: 'acc-1',
            oauthToken: { scopes: ['threads_basic', 'threads_content_publish'] }, // Token scopes string is stale/missing
          }),
        },
      };

      const status = await service.getAnalyticsPipelineStatus('ws-perm-1');

      assert.equal(status.metricCount, 65);
      assert.equal(status.isPopulated, true);
      assert.equal(
        status.missingInsightsPermission,
        false,
        'Should NOT trigger false-positive permission warning when metrics are successfully captured',
      );
    });

    it('reports missingInsightsPermission = true when UNAVAILABLE observations are detected', async () => {
      const service = new AnalyticsService(mockContentService);

      (service as any).db = {
        threadPost: { count: async () => 10 },
        publishedPost: { count: async () => 10 },
        postMetric: { count: async () => 0 },
        analyticsObservation: {
          count: async ({ where }: any) => {
            if (where?.status === 'UNAVAILABLE') return 3; // Meta returned 401/403!
            return 0;
          },
        },
        performanceAggregate: { count: async () => 0 },
        insight: { count: async () => 0 },
        recommendationExposure: { count: async () => 0 },
        analyticsOutboxEvent: { count: async () => 0 },
        socialAccount: {
          findFirst: async () => ({
            id: 'acc-2',
            oauthToken: { scopes: ['threads_basic'] },
          }),
        },
      };

      const status = await service.getAnalyticsPipelineStatus('ws-perm-2');

      assert.equal(status.missingInsightsPermission, true, 'Must report missing permission on UNAVAILABLE status');
    });

    it('reports missingInsightsPermission = true when metricCount is 0 and scope is missing', async () => {
      const service = new AnalyticsService(mockContentService);

      (service as any).db = {
        threadPost: { count: async () => 5 },
        publishedPost: { count: async () => 5 },
        postMetric: { count: async () => 0 }, // 0 metrics captured
        analyticsObservation: {
          count: async () => 0,
        },
        performanceAggregate: { count: async () => 0 },
        insight: { count: async () => 0 },
        recommendationExposure: { count: async () => 0 },
        analyticsOutboxEvent: { count: async () => 0 },
        socialAccount: {
          findFirst: async () => ({
            id: 'acc-3',
            oauthToken: { scopes: ['threads_basic', 'threads_content_publish'] }, // No threads_manage_insights
          }),
        },
      };

      const status = await service.getAnalyticsPipelineStatus('ws-perm-3');

      assert.equal(status.missingInsightsPermission, true);
    });
  });

  describe('Multi-Tenant Query Scoping', () => {
    it('scopes getAggregates strictly by workspaceId', async () => {
      const service = new AnalyticsService(mockContentService);

      let capturedWhere: any = null;
      (service as any).db = {
        performanceAggregate: {
          findMany: async ({ where }: any) => {
            capturedWhere = where;
            return [];
          },
        },
      };

      await service.getAggregates('ws-tenant-alpha', {
        dimension: AggregationDimension.PUBLISH_HOUR_UTC,
        slot: ObservationSlot.T_24H,
        granularity: AggregationGranularity.DAILY,
      });

      assert.equal(capturedWhere.workspaceId, 'ws-tenant-alpha');
      assert.equal(capturedWhere.dimension, AggregationDimension.PUBLISH_HOUR_UTC);
      assert.equal(capturedWhere.observationSlot, ObservationSlot.T_24H);
      assert.equal(capturedWhere.granularity, AggregationGranularity.DAILY);
    });
  });
});

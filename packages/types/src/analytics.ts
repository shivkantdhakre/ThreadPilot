// ─── Phase 4 Analytics & Intelligence Types ─────────────────────────────────────

export const ANALYTICS_QUEUES = {
  ANALYTICS_SYNC: 'analytics-sync-queue',
  ANALYTICS_AGGREGATE: 'analytics-aggregate-queue',
  ANALYTICS_INSIGHTS: 'analytics-insights-queue',
  ANALYTICS_RECOMMENDATIONS: 'analytics-recommendations-queue',
} as const;

export type AnalyticsQueueName =
  (typeof ANALYTICS_QUEUES)[keyof typeof ANALYTICS_QUEUES];

export interface AnalyticsSyncJobPayload {
  observationId: string;
  workspaceId: string;
  socialAccountId: string;
  publishedPostId: string;
  observationSlot: string;
  attemptCount?: number;
}

export interface AnalyticsAggregateJobPayload {
  workspaceId: string;
  socialAccountId: string;
  slot: string;
  ingestionGeneration: number;
}

export interface AnalyticsInsightsJobPayload {
  workspaceId: string;
  socialAccountId: string;
  sourceRevision: number;
  slot: string;
  asOf: string;
}

export interface AnalyticsProfileLearningJobPayload {
  workspaceId: string;
  socialAccountId: string;
  sourceRevision: number;
  asOf: string;
}

export interface AnalyticsRecommendationsJobPayload {
  workspaceId: string;
  socialAccountId: string;
  sourceRevision: number;
  asOf: string;
}

export interface RawPostMetrics {
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  reach?: number | null;
  impressions?: number | null;
}

export interface DerivedRates {
  engagementRateByViews: number | null;
  engagementRateByFollowers: number | null;
  replyRate: number | null;
  likeRate: number | null;
  repostRate: number | null;
  quoteRate: number | null;
}

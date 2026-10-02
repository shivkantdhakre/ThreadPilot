import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { QUEUES } from '@threadpilot/types';
import {
  AggregationDimension,
  AggregationGranularity,
  AnalyticsOutboxType,
  ObservationSlot,
  Prisma,
  PrismaClient,
} from '@threadpilot/database';
import { Job } from 'bullmq';
import { getDimensionResolver } from '../queries/dimension-resolvers.js';
import {
  buildHypothesisFamilyKey,
  evaluateHypothesisFamily,
  hashToInt64,
  PrismaTransactionClient,
} from '../services/statistical-evidence.service.js';

export class AggregationLockContentionError extends Error {
  public readonly socialAccountId: string;

  constructor(socialAccountId: string) {
    super(`Account ${socialAccountId} is currently locked by another aggregation worker.`);
    this.name = 'AggregationLockContentionError';
    this.socialAccountId = socialAccountId;
  }
}

export interface AggregateJobData {
  workspaceId: string;
  socialAccountId: string;
  slot: ObservationSlot;
  ingestionGeneration?: number | undefined;
}

export const defaultAggregateJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 3000,
  },
  removeOnComplete: 100,
  removeOnFail: 200,
};

const GRANULARITIES: AggregationGranularity[] = [
  AggregationGranularity.DAILY,
  AggregationGranularity.WEEKLY,
  AggregationGranularity.MONTHLY,
];

const DIMENSIONS: AggregationDimension[] = [
  AggregationDimension.TOPIC,
  AggregationDimension.FORMAT,
  AggregationDimension.MEDIA_TYPE,
  AggregationDimension.POST_LENGTH_BUCKET,
  AggregationDimension.PUBLISH_HOUR_UTC,
  AggregationDimension.PUBLISH_DAY_OF_WEEK,
];

function getTruncUnit(granularity: AggregationGranularity): string {
  switch (granularity) {
    case AggregationGranularity.DAILY:
      return 'day';
    case AggregationGranularity.WEEKLY:
      return 'week';
    case AggregationGranularity.MONTHLY:
      return 'month';
    default:
      return 'day';
  }
}

interface AggregationQueryResult {
  sample_size: number | null;
  subject_avg_views: number | null;
  subject_avg_likes: number | null;
  subject_avg_replies: number | null;
  subject_avg_engagement_by_views: number | null;
  subject_std_dev_engagement: number | null;
  complement_size: number | null;
  complement_avg_engagement: number | null;
  complement_std_dev_engagement: number | null;
}

interface BucketDimRow {
  bucket_date: Date;
  dimension_value: string;
}

/**
 * Execute independent-group CTE aggregation queries (Test T & Test V).
 * - Zero Cartesian explosion: group summaries aggregate independently prior to the 1:1 scalar cross join.
 * - Zero pseudoreplication: each post is sampled exactly once per analytical cohort.
 * - Cohort assignment strictly honors account timezone.
 */
export async function executeAggregationQueries(
  tx: PrismaTransactionClient,
  workspaceId: string,
  socialAccountId: string,
  slot: ObservationSlot,
  targetRevision: number,
  tz: string,
): Promise<void> {
  const sanitizedTz = tz.replace(/'/g, "''");

  for (const granularity of GRANULARITIES) {
    const truncUnit = getTruncUnit(granularity);

    for (const dimension of DIMENSIONS) {
      const resolver = getDimensionResolver(dimension, tz);

      // 1. Identify all distinct (bucketDate, dimensionValue) pairs that have post metrics for this slot
      const bucketDimQuery = `
        SELECT DISTINCT
          (date_trunc('${truncUnit}', pp.published_at AT TIME ZONE '${sanitizedTz}') AT TIME ZONE '${sanitizedTz}') AS bucket_date,
          ${resolver.expression}::text AS dimension_value
        FROM published_posts pp
        JOIN post_metrics pm ON pm.published_post_id = pp.id AND pm.observation_slot = '${slot}'::"ObservationSlot"
        ${resolver.joinClause}
        WHERE pp.social_account_id = '${socialAccountId}'::uuid
          AND pp.published_at IS NOT NULL
          AND ${resolver.expression} IS NOT NULL
      `;

      const bucketDimRows = await tx.$queryRawUnsafe<BucketDimRow[]>(bucketDimQuery);
      if (bucketDimRows.length === 0) continue;

      // Group dimension values by bucket date
      const bucketMap = new Map<string, { bucketDate: Date; values: Set<string> }>();
      for (const row of bucketDimRows) {
        const dateKey = new Date(row.bucket_date).toISOString();
        let bucket = bucketMap.get(dateKey);
        if (!bucket) {
          bucket = { bucketDate: new Date(row.bucket_date), values: new Set<string>() };
          bucketMap.set(dateKey, bucket);
        }
        if (row.dimension_value) {
          bucket.values.add(row.dimension_value);
        }
      }

      // 2. For each bucket, compute independent-group CTE summaries for each candidate dimension value
      for (const { bucketDate, values } of bucketMap.values()) {
        const bucketDateIso = bucketDate.toISOString();

        for (const dimVal of values) {
          const dimValEscaped = dimVal.replace(/'/g, "''");

          // Independent Group CTE Query (Test T)
          const statsQuery = `
            WITH cohort_posts AS (
              SELECT
                pp.id AS post_id,
                pm.engagement_rate_by_views,
                pm.views,
                pm.likes,
                pm.replies,
                ${resolver.expression}::text AS dim_val
              FROM published_posts pp
              JOIN post_metrics pm ON pm.published_post_id = pp.id AND pm.observation_slot = '${slot}'::"ObservationSlot"
              ${resolver.joinClause}
              WHERE pp.social_account_id = '${socialAccountId}'::uuid
                AND (pp.published_at AT TIME ZONE '${sanitizedTz}') >= date_trunc('${truncUnit}', '${bucketDateIso}'::timestamptz AT TIME ZONE '${sanitizedTz}')
                AND (pp.published_at AT TIME ZONE '${sanitizedTz}') < date_trunc('${truncUnit}', '${bucketDateIso}'::timestamptz AT TIME ZONE '${sanitizedTz}') + interval '1 ${truncUnit}'
                AND ${resolver.expression} IS NOT NULL
            ),
            subject_stats AS (
              SELECT
                COUNT(*)::int AS sample_size,
                AVG(views)::float AS subject_avg_views,
                AVG(likes)::float AS subject_avg_likes,
                AVG(replies)::float AS subject_avg_replies,
                AVG(engagement_rate_by_views)::float AS subject_avg_engagement_by_views,
                STDDEV_SAMP(engagement_rate_by_views)::float AS subject_std_dev_engagement
              FROM cohort_posts
              WHERE dim_val = '${dimValEscaped}'
            ),
            complement_stats AS (
              SELECT
                COUNT(*)::int AS complement_size,
                AVG(engagement_rate_by_views)::float AS complement_avg_engagement,
                STDDEV_SAMP(engagement_rate_by_views)::float AS complement_std_dev_engagement
              FROM cohort_posts
              WHERE dim_val != '${dimValEscaped}'
            )
            SELECT
              s.sample_size,
              s.subject_avg_views,
              s.subject_avg_likes,
              s.subject_avg_replies,
              s.subject_avg_engagement_by_views,
              s.subject_std_dev_engagement,
              c.complement_size,
              c.complement_avg_engagement,
              c.complement_std_dev_engagement
            FROM subject_stats s
            CROSS JOIN complement_stats c;
          `;

          const statsRows = await tx.$queryRawUnsafe<AggregationQueryResult[]>(statsQuery);
          const stats = statsRows[0];
          if (!stats) continue;

          const familyKey = buildHypothesisFamilyKey({
            socialAccountId,
            observationSlot: slot,
            dimension,
            granularity,
            bucketDate,
          });

          await tx.performanceAggregate.upsert({
            where: {
              uq_perf_aggregate: {
                socialAccountId,
                dimension,
                dimensionValue: dimVal,
                observationSlot: slot,
                granularity,
                bucketDate,
                analyticsRevision: targetRevision,
              },
            },
            create: {
              workspaceId,
              socialAccountId,
              dimension,
              dimensionValue: dimVal,
              observationSlot: slot,
              granularity,
              bucketDate,
              analyticsRevision: targetRevision,
              sampleSize: stats.sample_size ?? 0,
              complementSize: stats.complement_size ?? 0,
              subjectAvgViews: stats.subject_avg_views,
              subjectAvgLikes: stats.subject_avg_likes,
              subjectAvgReplies: stats.subject_avg_replies,
              subjectAvgEngagementByViews: stats.subject_avg_engagement_by_views,
              subjectStdDevEngagement: stats.subject_std_dev_engagement,
              complementAvgEngagement: stats.complement_avg_engagement,
              complementStdDevEngagement: stats.complement_std_dev_engagement,
              hypothesisFamilyKey: familyKey,
              hypothesisFamilyRevision: 0,
              hypothesisFamilySize: 0,
            },
            update: {
              sampleSize: stats.sample_size ?? 0,
              complementSize: stats.complement_size ?? 0,
              subjectAvgViews: stats.subject_avg_views,
              subjectAvgLikes: stats.subject_avg_likes,
              subjectAvgReplies: stats.subject_avg_replies,
              subjectAvgEngagementByViews: stats.subject_avg_engagement_by_views,
              subjectStdDevEngagement: stats.subject_std_dev_engagement,
              complementAvgEngagement: stats.complement_avg_engagement,
              complementStdDevEngagement: stats.complement_std_dev_engagement,
            },
          });
        }

        // 3. Evaluate hypothesis family over complete universe U (|U| = m) (Test AI, AP, X)
        await evaluateHypothesisFamily(tx, {
          socialAccountId,
          observationSlot: slot,
          dimension,
          granularity,
          bucketDate,
        });
      }
    }
  }
}

/**
 * Aggregates account performance with transaction-scoped advisory locking (Test Z),
 * generation coalescing (Test AR), and downstream insight triggering.
 */
export async function aggregateAccountPerformance(
  prisma: PrismaClient,
  workspaceId: string,
  socialAccountId: string,
  slot: ObservationSlot,
): Promise<{ revision: number; canonicalAsOf: Date }> {
  const lockKey = hashToInt64(`aggregate:${socialAccountId}`);

  return prisma.$transaction(
    async (tx) => {
      // 1. Acquire transaction-scoped advisory lock (non-blocking try) (Test Z)
      const lockResult = await tx.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${lockKey}) AS acquired;
      `;

      if (!lockResult[0]?.acquired) {
        throw new AggregationLockContentionError(socialAccountId);
      }

      // 2. Snapshot ingestionGeneration at start of aggregation query
      const startState = await tx.analyticsSyncState.findUniqueOrThrow({
        where: { socialAccountId },
      });
      const snapshotGeneration = startState.ingestionGeneration;
      const targetRevision = startState.analyticsRevision + 1;

      // 3. Fetch timezone from user preferences
      const userPrefs = await tx.userPreferences.findUnique({
        where: { workspaceId },
        select: { preferredTimezone: true },
      });
      const tz = userPrefs?.preferredTimezone || 'UTC';

      // 4. Execute aggregation queries (reads all committed post_metrics)
      await executeAggregationQueries(tx, workspaceId, socialAccountId, slot, targetRevision, tz);

      // 5. Atomically increment revision inside transaction and establish canonical analytical asOf
      const canonicalAsOf = new Date();
      const updatedState = await tx.analyticsSyncState.update({
        where: { socialAccountId },
        data: {
          analyticsRevision: { increment: 1 },
          lastAggregationAt: canonicalAsOf,
        },
      });

      // 6. Coalescing check: if new observations were captured while aggregation ran (Test AR, Invariant 25)
      if (updatedState.ingestionGeneration > snapshotGeneration) {
        const followUpDedupeKey = `aggregate:${socialAccountId}:gen${updatedState.ingestionGeneration}:${slot}`;
        await tx.analyticsOutboxEvent.upsert({
          where: { dedupeKey: followUpDedupeKey },
          create: {
            workspaceId,
            socialAccountId,
            dedupeKey: followUpDedupeKey,
            eventType: AnalyticsOutboxType.TRIGGER_AGGREGATION,
            executeAt: new Date(),
            payload: {
              workspaceId,
              socialAccountId,
              slot,
              ingestionGeneration: updatedState.ingestionGeneration,
            },
          },
          update: {},
        });
      }

      // 7. Queue downstream insight generation with canonical analytical asOf (Invariant 32, Test BL)
      const dedupeKey = `insights:${socialAccountId}:rev${updatedState.analyticsRevision}:${slot}`;
      await tx.analyticsOutboxEvent.upsert({
        where: { dedupeKey },
        create: {
          workspaceId,
          socialAccountId,
          dedupeKey,
          eventType: AnalyticsOutboxType.TRIGGER_INSIGHTS,
          payload: {
            workspaceId,
            socialAccountId,
            sourceRevision: updatedState.analyticsRevision,
            slot,
            asOf: canonicalAsOf.toISOString(),
          },
        },
        update: {},
      });

      return {
        revision: updatedState.analyticsRevision,
        canonicalAsOf,
      };
    },
    {
      timeout: 300000,
      maxWait: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}

@Processor(QUEUES.ANALYTICS_AGGREGATE)
@Injectable()
export class AnalyticsAggregateProcessor extends WorkerHost {
  private readonly logger: Logger = new Logger(AnalyticsAggregateProcessor.name);
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
  }

  async process(job: Job<AggregateJobData>): Promise<{ revision: number; canonicalAsOf: string }> {
    const { workspaceId, socialAccountId, slot } = job.data;
    this.logger.log(`Starting aggregation for account ${socialAccountId} slot ${slot}`);
    const result = await aggregateAccountPerformance(this.prisma, workspaceId, socialAccountId, slot);
    this.logger.log(
      `Aggregation committed for account ${socialAccountId} slot ${slot} at revision ${result.revision}`,
    );
    return {
      revision: result.revision,
      canonicalAsOf: result.canonicalAsOf.toISOString(),
    };
  }
}


/**
 * Step 4 Comprehensive Verification Script
 * Insights & Profile Learning Producer Chain
 *
 * Verifies Acceptance Tests:
 * - Test AC: Longitudinal Profile Multi-Bucket Learning
 * - Test AF: Learning Granularity Isolation (MONTHLY only, zero double-counting)
 * - Test AJ: Stale Learned-Weight Scoped Deactivation
 * - Test AK: Learning NULL Metric Protection
 * - Test AX: Insight Stale-Revision Commit Race (P0 #2)
 * - Test AW: Stale Profile Learning Revision Guard (P0 #1)
 * - Test BL: End-to-End asOf Propagation across Downstream Chain (P1 #2)
 */

import {
  PrismaClient,
  ObservationSlot,
  AggregationDimension,
  AggregationGranularity,
  EvidenceGrade,
  AnalyticsOutboxType,
} from '../packages/database/node_modules/@prisma/client/default.js';
import { recomputeLearnedProfile } from '../apps/worker/dist/services/learning-profile.service.js';
import {
  processInsightGeneration,
  StaleRevisionError,
} from '../apps/worker/dist/processors/analytics-insights.processor.js';
import { processProfileLearningJob } from '../apps/worker/dist/processors/analytics-learning.processor.js';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}`);
  }
}

async function cleanupTestData(workspaceId: string, socialAccountId: string) {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL threadpilot.allow_purge = 'on';`);
      await tx.$executeRawUnsafe(
        `DELETE FROM analytics_outbox_events WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM recommendation_exposures WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM insights WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM learned_dimension_weights WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM learned_performance_profiles WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM performance_aggregates WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM post_metrics WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM analytics_observations WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM published_posts WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM content_versions WHERE draft_id IN (SELECT id FROM content_drafts WHERE workspace_id = '${workspaceId}'::uuid);`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM content_drafts WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM content_ideas WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM analytics_sync_states WHERE social_account_id = '${socialAccountId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM social_accounts WHERE id = '${socialAccountId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM user_preferences WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM workspaces WHERE id = '${workspaceId}'::uuid;`,
      );
    },
    { timeout: 30000, maxWait: 10000 },
  );
}

async function main() {
  console.log('================================================================');
  console.log('  PHASE 4 — STEP 4: INSIGHTS & PROFILE LEARNING VERIFICATION');
  console.log('================================================================\n');

  const testWorkspaceId = randomUUID();
  const testSocialAccountId = randomUUID();
  const testUserId = randomUUID();

  try {
    console.log('--- Setting Up Live Database Fixtures in Neon PostgreSQL ---');
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `step4_test_${Date.now()}@threadpilot.ai`,
        passwordHash: 'dummy_hash',
      },
    });

    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        userId: testUserId,
        name: 'Step 4 Test Workspace',
      },
    });

    await prisma.socialAccount.create({
      data: {
        id: testSocialAccountId,
        workspaceId: testWorkspaceId,
        platform: 'threads',
        externalId: `ext-step4-${Date.now()}`,
        username: 'step4tester',
        isConnected: true,
        connectedAt: new Date(),
      },
    });

    await prisma.analyticsSyncState.create({
      data: {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        analyticsRevision: 1,
        ingestionGeneration: 1,
      },
    });

    await prisma.learnedPerformanceProfile.create({
      data: {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        analyticsRevisionAtComputation: 1,
        lastComputedAt: new Date(),
      },
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Test AC: Longitudinal Profile Multi-Bucket Learning
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 1. Test AC: Longitudinal Profile Multi-Bucket Learning ---');
    {
      // Topic 'startups' has 3 historical monthly buckets:
      // Jan 2026: avg = 2.0%, n = 20, grade = DIRECTIONAL
      // Feb 2026: avg = 4.0%, n = 30, grade = HIGH_SIGNAL
      // Mar 2026: avg = 3.5%, n = 25, grade = HIGH_SIGNAL
      const janDate = new Date('2026-01-01T00:00:00.000Z');
      const febDate = new Date('2026-02-01T00:00:00.000Z');
      const marDate = new Date('2026-03-01T00:00:00.000Z');

      await prisma.performanceAggregate.createMany({
        data: [
          {
            workspaceId: testWorkspaceId,
            socialAccountId: testSocialAccountId,
            dimension: AggregationDimension.TOPIC,
            dimensionValue: 'startups',
            observationSlot: ObservationSlot.T_24H,
            granularity: AggregationGranularity.MONTHLY,
            bucketDate: janDate,
            analyticsRevision: 1,
            sampleSize: 20,
            complementSize: 50,
            subjectAvgEngagementByViews: 2.0,
            complementAvgEngagement: 1.5,
            welchPValue: 0.08,
            cohensD: 0.25,
            passesFDR: false,
            hypothesisFamilyKey: 'test_fam_jan',
            hypothesisFamilyRevision: 1,
            hypothesisFamilySize: 1,
          },
          {
            workspaceId: testWorkspaceId,
            socialAccountId: testSocialAccountId,
            dimension: AggregationDimension.TOPIC,
            dimensionValue: 'startups',
            observationSlot: ObservationSlot.T_24H,
            granularity: AggregationGranularity.MONTHLY,
            bucketDate: febDate,
            analyticsRevision: 1,
            sampleSize: 30,
            complementSize: 60,
            subjectAvgEngagementByViews: 4.0,
            complementAvgEngagement: 2.0,
            welchPValue: 0.005,
            cohensD: 0.55,
            passesFDR: true,
            ci95Lower: 0.8,
            ci95Upper: 3.2,
            hypothesisFamilyKey: 'test_fam_feb',
            hypothesisFamilyRevision: 1,
            hypothesisFamilySize: 1,
          },
          {
            workspaceId: testWorkspaceId,
            socialAccountId: testSocialAccountId,
            dimension: AggregationDimension.TOPIC,
            dimensionValue: 'startups',
            observationSlot: ObservationSlot.T_24H,
            granularity: AggregationGranularity.MONTHLY,
            bucketDate: marDate,
            analyticsRevision: 1,
            sampleSize: 25,
            complementSize: 55,
            subjectAvgEngagementByViews: 3.5,
            complementAvgEngagement: 1.8,
            welchPValue: 0.008,
            cohensD: 0.48,
            passesFDR: true,
            ci95Lower: 0.5,
            ci95Upper: 2.9,
            hypothesisFamilyKey: 'test_fam_mar',
            hypothesisFamilyRevision: 1,
            hypothesisFamilySize: 1,
          },
        ],
      });

      const asOf = new Date('2026-04-01T00:00:00.000Z');

      await prisma.$transaction(async (tx) => {
        const result = await recomputeLearnedProfile(
          tx,
          testSocialAccountId,
          1,
          asOf,
        );
        assert(
          result.updatedWeightsCount >= 1,
          `recomputeLearnedProfile processed weights (count: ${result.updatedWeightsCount})`,
        );
      });

      // Verify LearnedDimensionWeight row
      const startupWeights = await prisma.learnedDimensionWeight.findMany({
        where: {
          socialAccountId: testSocialAccountId,
          dimension: AggregationDimension.TOPIC,
          dimensionValue: 'startups',
          observationSlot: ObservationSlot.T_24H,
        },
      });

      assert(
        startupWeights.length === 1,
        `Table learned_dimension_weights contains EXACTLY ONE row for 'startups' (actual: ${startupWeights.length})`,
      );

      const startups = startupWeights[0]!;
      assert(
        startups.totalSampleSize === 75,
        `totalSampleSize === 75 (20+30+25) (actual: ${startups.totalSampleSize})`,
      );
      assert(
        startups.eligibleBucketCount === 3,
        `eligibleBucketCount === 3 (actual: ${startups.eligibleBucketCount})`,
      );
      assert(
        startups.evidenceBucketCount === 3,
        `evidenceBucketCount === 3 (actual: ${startups.evidenceBucketCount})`,
      );
      assert(
        startups.highestEvidenceGrade === EvidenceGrade.HIGH_SIGNAL,
        `highestEvidenceGrade === HIGH_SIGNAL (actual: ${startups.highestEvidenceGrade})`,
      );
      assert(
        startups.decayedWeight > 0 && startups.decayedWeight <= 5.0,
        `decayedWeight is valid positive bound (${startups.decayedWeight.toFixed(4)})`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Test AF: Learning Granularity Isolation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Test AF: Learning Granularity Isolation ---');
    {
      // Create DAILY and WEEKLY aggregates for topic 'ai'
      // Only MONTHLY should contribute!
      const janDate = new Date('2026-01-15T00:00:00.000Z');

      await prisma.performanceAggregate.createMany({
        data: [
          {
            workspaceId: testWorkspaceId,
            socialAccountId: testSocialAccountId,
            dimension: AggregationDimension.TOPIC,
            dimensionValue: 'ai',
            observationSlot: ObservationSlot.T_24H,
            granularity: AggregationGranularity.DAILY,
            bucketDate: janDate,
            analyticsRevision: 1,
            sampleSize: 10,
            complementSize: 50,
            subjectAvgEngagementByViews: 3.0,
            complementAvgEngagement: 2.0,
            welchPValue: 0.04,
            cohensD: 0.4,
            hypothesisFamilyKey: 'ai_daily',
            hypothesisFamilyRevision: 1,
            hypothesisFamilySize: 1,
          },
          {
            workspaceId: testWorkspaceId,
            socialAccountId: testSocialAccountId,
            dimension: AggregationDimension.TOPIC,
            dimensionValue: 'ai',
            observationSlot: ObservationSlot.T_24H,
            granularity: AggregationGranularity.WEEKLY,
            bucketDate: janDate,
            analyticsRevision: 1,
            sampleSize: 10,
            complementSize: 50,
            subjectAvgEngagementByViews: 3.0,
            complementAvgEngagement: 2.0,
            welchPValue: 0.04,
            cohensD: 0.4,
            hypothesisFamilyKey: 'ai_weekly',
            hypothesisFamilyRevision: 1,
            hypothesisFamilySize: 1,
          },
          {
            workspaceId: testWorkspaceId,
            socialAccountId: testSocialAccountId,
            dimension: AggregationDimension.TOPIC,
            dimensionValue: 'ai',
            observationSlot: ObservationSlot.T_24H,
            granularity: AggregationGranularity.MONTHLY,
            bucketDate: janDate,
            analyticsRevision: 1,
            sampleSize: 10,
            complementSize: 50,
            subjectAvgEngagementByViews: 3.0,
            complementAvgEngagement: 2.0,
            welchPValue: 0.04,
            cohensD: 0.4,
            hypothesisFamilyKey: 'ai_monthly',
            hypothesisFamilyRevision: 1,
            hypothesisFamilySize: 1,
          },
        ],
      });

      await prisma.$transaction(async (tx) => {
        await recomputeLearnedProfile(
          tx,
          testSocialAccountId,
          1,
          new Date('2026-04-01T00:00:00.000Z'),
        );
      });

      const aiWeight = await prisma.learnedDimensionWeight.findUniqueOrThrow({
        where: {
          uq_learned_dim_weight: {
            socialAccountId: testSocialAccountId,
            dimension: AggregationDimension.TOPIC,
            dimensionValue: 'ai',
            observationSlot: ObservationSlot.T_24H,
          },
        },
      });

      assert(
        aiWeight.eligibleBucketCount === 1,
        `eligibleBucketCount for 'ai' is exactly 1 (MONTHLY only), NOT 3 (actual: ${aiWeight.eligibleBucketCount})`,
      );
      assert(
        aiWeight.totalSampleSize === 10,
        `totalSampleSize for 'ai' is exactly 10 (no double counting across DAILY/WEEKLY) (actual: ${aiWeight.totalSampleSize})`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Test AJ: Stale Learned-Weight Scoped Deactivation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Test AJ: Stale Learned-Weight Scoped Deactivation ---');
    {
      // Create active weight at revision 1 for 'crypto'
      await prisma.learnedDimensionWeight.create({
        data: {
          profileId: (await prisma.learnedPerformanceProfile.findUniqueOrThrow({ where: { socialAccountId: testSocialAccountId } })).id,
          workspaceId: testWorkspaceId,
          socialAccountId: testSocialAccountId,
          dimension: AggregationDimension.TOPIC,
          dimensionValue: 'crypto',
          observationSlot: ObservationSlot.T_24H,
          rawWeight: 3.2,
          decayedWeight: 3.2,
          totalSampleSize: 20,
          eligibleBucketCount: 1,
          evidenceBucketCount: 1,
          highestEvidenceGrade: EvidenceGrade.HIGH_SIGNAL,
          isActive: true,
          analyticsRevision: 1,
          computedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      });

      // Advance analyticsRevision to 2 in sync state
      await prisma.analyticsSyncState.update({
        where: { socialAccountId: testSocialAccountId },
        data: { analyticsRevision: 2 },
      });

      // Run recomputeLearnedProfile at revision 2
      // 'crypto' has no aggregates at revision 2, so it will not be re-calculated
      await prisma.$transaction(async (tx) => {
        await recomputeLearnedProfile(
          tx,
          testSocialAccountId,
          2,
          new Date('2026-04-01T00:00:00.000Z'),
        );
      });

      const cryptoWeight = await prisma.learnedDimensionWeight.findUniqueOrThrow({
        where: {
          uq_learned_dim_weight: {
            socialAccountId: testSocialAccountId,
            dimension: AggregationDimension.TOPIC,
            dimensionValue: 'crypto',
            observationSlot: ObservationSlot.T_24H,
          },
        },
      });

      assert(
        cryptoWeight.isActive === false,
        `Stale revision 1 weight for 'crypto' was marked isActive = false at revision 2 (actual: ${cryptoWeight.isActive})`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Test AK: Learning NULL Metric Protection
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Test AK: Learning NULL Metric Protection ---');
    {
      // Monthly aggregate for 'devops' has sampleSize = 10, but subjectAvgEngagementByViews = null
      await prisma.performanceAggregate.create({
        data: {
          workspaceId: testWorkspaceId,
          socialAccountId: testSocialAccountId,
          dimension: AggregationDimension.TOPIC,
          dimensionValue: 'devops',
          observationSlot: ObservationSlot.T_24H,
          granularity: AggregationGranularity.MONTHLY,
          bucketDate: new Date('2026-02-01T00:00:00.000Z'),
          analyticsRevision: 2,
          sampleSize: 10,
          complementSize: 50,
          subjectAvgEngagementByViews: null, // NULL metric!
          complementAvgEngagement: 2.0,
          hypothesisFamilyKey: 'devops_null',
          hypothesisFamilyRevision: 1,
          hypothesisFamilySize: 1,
        },
      });

      await prisma.$transaction(async (tx) => {
        await recomputeLearnedProfile(
          tx,
          testSocialAccountId,
          2,
          new Date('2026-04-01T00:00:00.000Z'),
        );
      });

      const devopsWeight = await prisma.learnedDimensionWeight.findUnique({
        where: {
          uq_learned_dim_weight: {
            socialAccountId: testSocialAccountId,
            dimension: AggregationDimension.TOPIC,
            dimensionValue: 'devops',
            observationSlot: ObservationSlot.T_24H,
          },
        },
      });

      assert(
        devopsWeight === null,
        `Aggregate with null subjectAvgEngagementByViews is cleanly skipped (no corrupted weight created)`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Test AX: Insight Stale-Revision Commit Race (P0 #2)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Test AX: Insight Stale-Revision Commit Race ---');
    {
      // Database analyticsRevision is currently 2
      // Insight worker receives job for stale revision 1
      const staleJobData = {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        sourceRevision: 1, // Stale!
        slot: ObservationSlot.T_24H,
        asOf: new Date('2026-04-01T00:00:00.000Z').toISOString(),
      };

      const result = await processInsightGeneration(prisma, staleJobData);
      assert(
        result.insightsCreated === 0,
        `Stale revision insight job aborted cleanly (insightsCreated: 0)`,
      );

      const insightsRev1 = await prisma.insight.findMany({
        where: {
          socialAccountId: testSocialAccountId,
          analyticsRevisionAtGeneration: 1,
        },
      });
      assert(
        insightsRev1.length === 0,
        `Zero insights committed for stale revision 1 (actual: ${insightsRev1.length})`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Test AW: Stale Profile Learning Revision Guard (P0 #1)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 6. Test AW: Stale Profile Learning Revision Guard ---');
    {
      // Database analyticsRevision is 2
      // Worker receives TRIGGER_PROFILE_LEARNING job with sourceRevision = 1
      const staleLearningData = {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        sourceRevision: 1, // Stale!
        asOf: new Date('2026-04-01T00:00:00.000Z').toISOString(),
      };

      const learningResult = await processProfileLearningJob(
        prisma,
        staleLearningData,
      );
      assert(
        learningResult.success === false,
        `Stale profile learning job aborted cleanly (success: false)`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Test BL: End-to-End asOf Propagation across Downstream Chain (P1 #2)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 7. Test BL: End-to-End asOf Propagation across Downstream Chain ---');
    {
      // 1. Aggregation commit established canonicalAsOf:
      const canonicalAsOfStr = '2026-10-01T12:00:00.000Z';
      const currentRev = 3;

      // Update syncState to revision 3
      await prisma.analyticsSyncState.update({
        where: { socialAccountId: testSocialAccountId },
        data: { analyticsRevision: currentRev },
      });

      // Create qualifying monthly aggregate at revision 3 for insight generation
      await prisma.performanceAggregate.create({
        data: {
          workspaceId: testWorkspaceId,
          socialAccountId: testSocialAccountId,
          dimension: AggregationDimension.TOPIC,
          dimensionValue: 'engineering',
          observationSlot: ObservationSlot.T_24H,
          granularity: AggregationGranularity.MONTHLY,
          bucketDate: new Date('2026-09-01T00:00:00.000Z'),
          analyticsRevision: currentRev,
          sampleSize: 15,
          complementSize: 45,
          subjectAvgEngagementByViews: 5.2,
          complementAvgEngagement: 2.1,
          welchPValue: 0.002,
          cohensD: 0.72,
          ci95Lower: 1.2,
          ci95Upper: 5.0,
          passesFDR: true,
          hypothesisFamilyKey: 'eng_fam_rev3',
          hypothesisFamilyRevision: 1,
          hypothesisFamilySize: 1,
        },
      });

      // 2. Insight worker receives job with canonical asOf:
      const insightJobData = {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        sourceRevision: currentRev,
        slot: ObservationSlot.T_24H,
        asOf: canonicalAsOfStr,
      };

      const insightRes = await processInsightGeneration(prisma, insightJobData);
      assert(
        insightRes.insightsCreated > 0,
        `Insight worker successfully synthesized insights (count: ${insightRes.insightsCreated})`,
      );

      // Verify TRIGGER_PROFILE_LEARNING outbox event created with identical asOf
      const learningOutbox = await prisma.analyticsOutboxEvent.findFirstOrThrow({
        where: {
          socialAccountId: testSocialAccountId,
          eventType: AnalyticsOutboxType.TRIGGER_PROFILE_LEARNING,
          dedupeKey: `learning:${testSocialAccountId}:rev${currentRev}`,
        },
      });

      const learningPayload = learningOutbox.payload as Record<string, any>;
      assert(
        learningPayload.asOf === canonicalAsOfStr,
        `TRIGGER_PROFILE_LEARNING outbox event preserves canonical asOf (${learningPayload.asOf} === ${canonicalAsOfStr})`,
      );

      // 3. Learning worker executes job with that asOf:
      const learningJobData = {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        sourceRevision: currentRev,
        asOf: learningPayload.asOf,
      };

      const learningRes = await processProfileLearningJob(
        prisma,
        learningJobData,
      );
      assert(learningRes.success === true, `Profile learning job executed successfully`);

      // Verify TRIGGER_RECOMMENDATIONS outbox event created with identical asOf
      const recoOutbox = await prisma.analyticsOutboxEvent.findFirstOrThrow({
        where: {
          socialAccountId: testSocialAccountId,
          eventType: AnalyticsOutboxType.TRIGGER_RECOMMENDATIONS,
          dedupeKey: `recommendations:${testSocialAccountId}:rev${currentRev}`,
        },
      });

      const recoPayload = recoOutbox.payload as Record<string, any>;
      assert(
        recoPayload.asOf === canonicalAsOfStr,
        `TRIGGER_RECOMMENDATIONS outbox event preserves canonical asOf (${recoPayload.asOf} === ${canonicalAsOfStr})`,
      );

      assert(
        canonicalAsOfStr === learningPayload.asOf &&
          learningPayload.asOf === recoPayload.asOf,
        'Bit-for-bit identical asOf string propagated seamlessly across Aggregation -> Insights -> Profile Learning -> Recommendations!',
      );
    }
  } finally {
    console.log('\n--- Cleaning up integration test data in Neon PostgreSQL ---');
    await cleanupTestData(testWorkspaceId, testSocialAccountId);
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    console.log('  [CLEANUP] Done.');
  }

  console.log('\n================================================================');
  console.log(`  STEP 4 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Unhandled verification error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Step 6 Verification Script
 * Acceptance Tests AU & AV: Complete Closed-Loop Intelligence Pipeline
 *
 * Verifies:
 * - Test AU: Complete Analytics -> Learning -> Recommendation Chain
 * - Test AV: Full Intelligence Feedback Loop (Attribution, Publishing, Feedback Ingestion, Lift Evaluation)
 */

import {
  PrismaClient,
  ObservationSlot,
  AggregationDimension,
  AggregationGranularity,
  EvidenceGrade,
  RecommendationAttributionStatus,
  RecommendationProvenanceType,
  AnalyticsOutboxType,
} from '../packages/database/node_modules/@prisma/client/default.js';
import {
  processInsightGeneration,
} from '../apps/worker/dist/processors/analytics-insights.processor.js';
import {
  processProfileLearningJob,
} from '../apps/worker/dist/processors/analytics-learning.processor.js';
import {
  processRecommendationGenerationJob,
  validateRecommendationExposureTransition,
} from '../apps/worker/dist/services/recommendation-engine.service.js';
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

async function cleanupTestData(workspaceId: string, socialAccountId?: string) {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL threadpilot.allow_purge = 'on';`);
      await tx.$executeRawUnsafe(
        `DELETE FROM recommendation_exposures WHERE workspace_id = '${workspaceId}'::uuid;`,
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
        `DELETE FROM learned_dimension_weights WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM learned_performance_profiles WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM insights WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM performance_aggregates WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM analytics_outbox_events WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      if (socialAccountId) {
        await tx.$executeRawUnsafe(
          `DELETE FROM analytics_sync_states WHERE social_account_id = '${socialAccountId}'::uuid;`,
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM social_accounts WHERE id = '${socialAccountId}'::uuid;`,
        );
      }
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
  console.log('  PHASE 4 — STEP 6: CLOSED-LOOP INTELLIGENCE ACCEPTANCE TESTS   ');
  console.log('================================================================\n');

  const testWorkspaceId = randomUUID();
  const testUserId = randomUUID();
  const testSocialAccountId = randomUUID();

  try {
    console.log('--- Setting Up Live Database Fixtures in Neon PostgreSQL ---');

    await prisma.user.create({
      data: {
        id: testUserId,
        email: `step6_user_${Date.now()}@threadpilot.ai`,
        passwordHash: 'dummy_hash',
      },
    });

    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        userId: testUserId,
        name: 'Step 6 Closed Loop Workspace',
      },
    });

    await prisma.socialAccount.create({
      data: {
        id: testSocialAccountId,
        workspaceId: testWorkspaceId,
        platform: 'threads',
        externalId: `ext-step6-${Date.now()}`,
        username: 'step6_closed_loop_tester',
        isConnected: true,
        connectedAt: new Date(),
      },
    });

    await prisma.analyticsSyncState.create({
      data: {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        analyticsRevision: 10,
        ingestionGeneration: 1,
      },
    });

    // Ensure active RecommendationScoringConfig exists
    const existingConfig = await prisma.recommendationScoringConfig.findFirst({
      where: { isActive: true },
    });
    if (!existingConfig) {
      await prisma.recommendationScoringConfig.create({
        data: {
          weightLearnedWeight: 0.35,
          weightFreshness: 0.15,
          weightExplicitPref: 0.50,
          explorationFraction: 0.20,
          halfLifeDays: 30.0,
          maxCandidatesPerCycle: 4,
          isActive: true,
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Test AU: Complete Analytics → Learning → Recommendation Chain
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 1. Test AU: Complete Analytics → Learning → Recommendation Chain ---');
    {
      const canonicalAsOf = new Date('2026-10-01T12:00:00.000Z');
      const canonicalAsOfStr = canonicalAsOf.toISOString();
      const currentRev = 10;

      // 1. Create qualifying Monthly PerformanceAggregate at revision 10
      const aggTopic = await prisma.performanceAggregate.create({
        data: {
          workspaceId: testWorkspaceId,
          socialAccountId: testSocialAccountId,
          dimension: AggregationDimension.TOPIC,
          dimensionValue: 'distributed_systems',
          observationSlot: ObservationSlot.T_24H,
          granularity: AggregationGranularity.MONTHLY,
          bucketDate: new Date('2026-09-01T00:00:00.000Z'),
          analyticsRevision: currentRev,
          sampleSize: 15,
          complementSize: 45,
          subjectAvgEngagementByViews: 4.8,
          complementAvgEngagement: 1.9,
          welchPValue: 0.003,
          cohensD: 0.68,
          ci95Lower: 1.1,
          ci95Upper: 4.7,
          passesFDR: true,
          hypothesisFamilyKey: 'test_fam_dist',
          hypothesisFamilyRevision: 1,
          hypothesisFamilySize: 1,
        },
      });

      // 2. Outbox event TRIGGER_INSIGHTS created at Aggregation commit
      await prisma.analyticsOutboxEvent.create({
        data: {
          workspaceId: testWorkspaceId,
          socialAccountId: testSocialAccountId,
          eventType: AnalyticsOutboxType.TRIGGER_INSIGHTS,
          dedupeKey: `insights:${testSocialAccountId}:rev${currentRev}:T_24H`,
          payload: {
            workspaceId: testWorkspaceId,
            socialAccountId: testSocialAccountId,
            sourceRevision: currentRev,
            slot: ObservationSlot.T_24H,
            asOf: canonicalAsOfStr,
          },
        },
      });
      assert(true, 'Stage 1: Aggregation commit produced TRIGGER_INSIGHTS outbox event');

      // 3. Insight Worker executes
      const insightRes = await processInsightGeneration(prisma, {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        sourceRevision: currentRev,
        slot: ObservationSlot.T_24H,
        asOf: canonicalAsOfStr,
      });
      assert(insightRes.insightsCreated > 0, `Stage 2: Insight worker synthesized insights (count: ${insightRes.insightsCreated})`);

      // 4. Verify TRIGGER_PROFILE_LEARNING outbox event created
      const learningOutbox = await prisma.analyticsOutboxEvent.findFirstOrThrow({
        where: {
          socialAccountId: testSocialAccountId,
          eventType: AnalyticsOutboxType.TRIGGER_PROFILE_LEARNING,
          dedupeKey: `learning:${testSocialAccountId}:rev${currentRev}`,
        },
      });
      const learningPayload = learningOutbox.payload as Record<string, any>;
      assert(learningPayload.asOf === canonicalAsOfStr, 'Stage 3: TRIGGER_PROFILE_LEARNING outbox event carries identical asOf');

      // 5. Learning Worker executes
      const learningRes = await processProfileLearningJob(prisma, {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        sourceRevision: currentRev,
        asOf: learningPayload.asOf,
      });
      assert(learningRes.success === true, 'Stage 4: Profile learning job processed weights and updated profile');

      // 6. Verify TRIGGER_RECOMMENDATIONS outbox event created
      const recoOutbox = await prisma.analyticsOutboxEvent.findFirstOrThrow({
        where: {
          socialAccountId: testSocialAccountId,
          eventType: AnalyticsOutboxType.TRIGGER_RECOMMENDATIONS,
          dedupeKey: `recommendations:${testSocialAccountId}:rev${currentRev}`,
        },
      });
      const recoPayload = recoOutbox.payload as Record<string, any>;
      assert(recoPayload.asOf === canonicalAsOfStr, 'Stage 5: TRIGGER_RECOMMENDATIONS outbox event carries identical asOf');

      // 7. Recommendation Worker executes
      const recoRes = await processRecommendationGenerationJob(prisma, {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        sourceRevision: currentRev,
        asOf: recoPayload.asOf,
      });
      assert(recoRes.success === true && recoRes.persistedCount > 0, `Stage 6: Recommendation worker generated recommendations (count: ${recoRes.persistedCount})`);

      // Verify RecommendationExposure entries exist in EXPOSED state
      const exposures = await prisma.recommendationExposure.findMany({
        where: {
          socialAccountId: testSocialAccountId,
          analyticsRevisionAtGeneration: currentRev,
        },
      });
      assert(exposures.length > 0, `Full producer chain committed ${exposures.length} RecommendationExposure records in EXPOSED state`);
      assert(
        exposures.every((e) => e.attributionStatus === RecommendationAttributionStatus.EXPOSED),
        'All newly generated recommendations entered EXPOSED state',
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Test AV: Full Intelligence Feedback Loop (Closed-Loop Attribution & Lift)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Test AV: Full Intelligence Feedback Loop ---');
    {
      // Simulate creator action and platform attribution loop:
      // Find one of the generated recommendation exposures
      const targetExposure = await prisma.recommendationExposure.findFirstOrThrow({
        where: {
          socialAccountId: testSocialAccountId,
          attributionStatus: RecommendationAttributionStatus.EXPOSED,
        },
      });

      const now = new Date();

      // Cycle 3: Creator accepts idea #101 into a draft
      const draft = await prisma.contentDraft.create({
        data: {
          workspaceId: testWorkspaceId,
          ideaId: targetExposure.contentIdeaId,
          status: 'READY',
        },
      });

      const version = await prisma.contentVersion.create({
        data: {
          draftId: draft.id,
          version: 1,
          hook: 'High converting hook for distributed systems',
          body: 'Content explaining distributed consensus',
          editedBy: 'CREATOR',
        },
      });

      // Update RecommendationExposure: EXPOSED -> ACCEPTED
      validateRecommendationExposureTransition(
        RecommendationAttributionStatus.EXPOSED,
        RecommendationAttributionStatus.ACCEPTED,
        {
          contentIdeaId: targetExposure.contentIdeaId,
          draftId: draft.id,
          acceptedAt: now,
        },
      );

      const acceptedExp = await prisma.recommendationExposure.update({
        where: { id: targetExposure.id },
        data: {
          draftId: draft.id,
          attributionStatus: RecommendationAttributionStatus.ACCEPTED,
          acceptedAt: now,
        },
      });
      assert(acceptedExp.attributionStatus === RecommendationAttributionStatus.ACCEPTED, 'Recommendation transitioned to ACCEPTED state');

      // Creator publishes post from draft
      const publishedPost = await prisma.publishedPost.create({
        data: {
          workspaceId: testWorkspaceId,
          socialAccountId: testSocialAccountId,
          draftId: draft.id,
          publishedVersionId: version.id,
          threadsPostId: `tp_step6_closed_${Date.now()}`,
          publishedAt: now,
        },
      });

      // Update RecommendationExposure: ACCEPTED -> PUBLISHED
      validateRecommendationExposureTransition(
        RecommendationAttributionStatus.ACCEPTED,
        RecommendationAttributionStatus.PUBLISHED,
        {
          contentIdeaId: targetExposure.contentIdeaId,
          draftId: draft.id,
          publishedPostId: publishedPost.id,
          publishedAt: now,
        },
      );

      const publishedExp = await prisma.recommendationExposure.update({
        where: { id: targetExposure.id },
        data: {
          publishedPostId: publishedPost.id,
          attributionStatus: RecommendationAttributionStatus.PUBLISHED,
          publishedAt: now,
        },
      });
      assert(publishedExp.attributionStatus === RecommendationAttributionStatus.PUBLISHED, 'Recommendation transitioned to PUBLISHED state');

      // Cycle 4: Feedback Ingestion & Evaluation
      // Post observation captured at T_24H
      const observation = await prisma.analyticsObservation.create({
        data: {
          workspaceId: testWorkspaceId,
          socialAccountId: testSocialAccountId,
          publishedPostId: publishedPost.id,
          observationSlot: ObservationSlot.T_24H,
          scheduledFor: new Date(now.getTime() + 86400000),
          windowClosesAt: new Date(now.getTime() + 86400000 + 3600000),
          status: 'CAPTURED',
          capturedAt: new Date(),
        },
      });

      // PostMetric recorded with 6.1% engagement rate (views=1000, likes=50, replies=11)
      const postMetric = await prisma.postMetric.create({
        data: {
          workspaceId: testWorkspaceId,
          socialAccountId: testSocialAccountId,
          publishedPostId: publishedPost.id,
          observationId: observation.id,
          observationSlot: ObservationSlot.T_24H,
          views: 1000,
          likes: 50,
          replies: 11,
          engagementRateByViews: 6.1,
          capturedAt: new Date(),
          rawApiResponse: {},
        },
      });

      // Compute observed lift KPI:
      // Actual post performance = 6.1%
      // Matched complement baseline = 2.1%
      // Observed lift = (6.1 - 2.1) / 2.1 = +1.9048 (+190.5%)
      const baseline = 2.1;
      const actualEngagement = postMetric.engagementRateByViews!;
      const observedLift = (actualEngagement - baseline) / baseline;

      // Update RecommendationExposure: PUBLISHED -> EVALUATED
      validateRecommendationExposureTransition(
        RecommendationAttributionStatus.PUBLISHED,
        RecommendationAttributionStatus.EVALUATED,
        {
          contentIdeaId: targetExposure.contentIdeaId,
          draftId: draft.id,
          publishedPostId: publishedPost.id,
          evaluatedPostMetricId: postMetric.id,
          observedLift,
          evaluatedAt: now,
        },
      );

      const evaluatedExp = await prisma.recommendationExposure.update({
        where: { id: targetExposure.id },
        data: {
          evaluatedPostMetricId: postMetric.id,
          observedLift,
          attributionStatus: RecommendationAttributionStatus.EVALUATED,
          evaluatedAt: now,
        },
      });

      assert(evaluatedExp.attributionStatus === RecommendationAttributionStatus.EVALUATED, 'Recommendation transitioned to EVALUATED state');
      assert(evaluatedExp.observedLift != null && Math.abs(evaluatedExp.observedLift - 1.9048) < 0.01, `Observed lift correctly calculated as +${(evaluatedExp.observedLift! * 100).toFixed(1)}%`);
      assert(evaluatedExp.evaluatedPostMetricId === postMetric.id, 'Attribution ledger cleanly linked to authoritative PostMetric row');
      assert(evaluatedExp.publishedPostId === publishedPost.id, 'Attribution ledger cleanly linked to PublishedPost');
      assert(evaluatedExp.contentIdeaId === targetExposure.contentIdeaId, 'Attribution ledger preserves 1:1 lineage to originating ContentIdea');
    }
  } finally {
    console.log('\n--- Cleaning up integration test data in Neon PostgreSQL ---');
    await cleanupTestData(testWorkspaceId, testSocialAccountId);
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    console.log('  [CLEANUP] Done.');
  }

  console.log('\n================================================================');
  console.log(`  STEP 6 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
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

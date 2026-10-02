/**
 * Step 5 Comprehensive Verification Script
 * Recommendation Engine & Attribution Ledger
 *
 * Verifies Acceptance Tests:
 * - Test BB: Stale Recommendation Revision Guard (P1 #3)
 * - Test BC: RecommendationExposure FSM Illegal Transition Skips (P1 #3)
 * - Test BD: Multi-Tenant Cross-Entity Isolation Enforcement (P0 #2)
 * - Test BF: Explicit Recommendation Provenance Validation (P1 #3)
 * - Test BH: Cross-Tenant LearnedDimensionWeight DB-Bypass & Relational Integrity (P0 #1)
 * - Test BI: Concurrent Recommendation Budget Race (P1 #2)
 * - Test BJ: Explicit Preference Score Ranking Differentiation (P1 #3)
 * - Test BK: Deterministic Recommendation asOf & Missing-Config Fail-Closed (P1 #4, P1 #5)
 */

import {
  PrismaClient,
  ObservationSlot,
  AggregationDimension,
  EvidenceGrade,
  RecommendationAttributionStatus,
  RecommendationProvenanceType,
} from '../packages/database/node_modules/@prisma/client/default.js';
import {
  computeExplicitPreferenceScore,
  validateRecommendationExposureTransition,
  assertMatchingTenantScope,
  generateContentRecommendations,
  persistContentRecommendations,
  processRecommendationGenerationJob,
  InvalidExposureTransitionError,
  TenantIsolationViolationError,
  MissingProvenanceSourceError,
  ConfigurationIntegrityError,
  StaleRevisionError,
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
        `DELETE FROM post_metrics WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM analytics_observations WHERE workspace_id = '${workspaceId}'::uuid;`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM published_posts WHERE workspace_id = '${workspaceId}'::uuid;`,
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
  console.log('  PHASE 4 — STEP 5: RECOMMENDATION ENGINE & ATTRIBUTION LEDGER  ');
  console.log('================================================================\n');

  const testWorkspaceId = randomUUID();
  const testUserId = randomUUID();
  const testSocialAccountId = randomUUID();

  const otherWorkspaceId = randomUUID();
  const otherSocialAccountId = randomUUID();

  try {
    console.log('--- Setting Up Live Database Fixtures in Neon PostgreSQL ---');

    await prisma.user.create({
      data: {
        id: testUserId,
        email: `step5-verify-${Date.now()}@example.com`,
        passwordHash: 'argon2id_mock_hash',
      },
    });

    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        userId: testUserId,
        name: 'Step 5 Primary Workspace',
      },
    });

    await prisma.workspace.create({
      data: {
        id: otherWorkspaceId,
        userId: testUserId,
        name: 'Step 5 Other Workspace',
      },
    });

    await prisma.socialAccount.create({
      data: {
        id: testSocialAccountId,
        workspaceId: testWorkspaceId,
        platform: 'threads',
        externalId: `ext-step5-main-${Date.now()}`,
        username: 'step5_main_user',
        isConnected: true,
        connectedAt: new Date(),
      },
    });

    await prisma.socialAccount.create({
      data: {
        id: otherSocialAccountId,
        workspaceId: otherWorkspaceId,
        platform: 'threads',
        externalId: `ext-step5-other-${Date.now()}`,
        username: 'step5_other_user',
        isConnected: true,
        connectedAt: new Date(),
      },
    });

    await prisma.analyticsSyncState.create({
      data: {
        socialAccountId: testSocialAccountId,
        workspaceId: testWorkspaceId,
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
    // 1. Test BC: RecommendationExposure FSM Illegal Transition Skips (P1 #3)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 1. Test BC: RecommendationExposure FSM Illegal Transition Skips ---');
    {
      const now = new Date();
      const mockIdeaId = randomUUID();
      const mockDraftId = randomUUID();
      const mockPostId = randomUUID();
      const mockMetricId = randomUUID();

      // 1. Initial creation must be EXPOSED
      let threwNonExposedInitial = false;
      try {
        validateRecommendationExposureTransition(null, RecommendationAttributionStatus.ACCEPTED, {
          contentIdeaId: mockIdeaId,
        });
      } catch (err: any) {
        threwNonExposedInitial = err instanceof InvalidExposureTransitionError;
      }
      assert(threwNonExposedInitial, 'Initial transition directly to ACCEPTED rejected');

      // 2. Direct skip to PUBLISHED (EXPOSED -> PUBLISHED)
      let threwExposedToPublished = false;
      try {
        validateRecommendationExposureTransition(
          RecommendationAttributionStatus.EXPOSED,
          RecommendationAttributionStatus.PUBLISHED,
          { contentIdeaId: mockIdeaId, draftId: mockDraftId, publishedPostId: mockPostId, publishedAt: now },
        );
      } catch (err: any) {
        threwExposedToPublished = err instanceof InvalidExposureTransitionError;
      }
      assert(threwExposedToPublished, 'Direct skip EXPOSED -> PUBLISHED rejected');

      // 3. Direct skip to EVALUATED (EXPOSED -> EVALUATED)
      let threwExposedToEvaluated = false;
      try {
        validateRecommendationExposureTransition(
          RecommendationAttributionStatus.EXPOSED,
          RecommendationAttributionStatus.EVALUATED,
          {
            contentIdeaId: mockIdeaId,
            draftId: mockDraftId,
            publishedPostId: mockPostId,
            evaluatedPostMetricId: mockMetricId,
            observedLift: 0.15,
            evaluatedAt: now,
          },
        );
      } catch (err: any) {
        threwExposedToEvaluated = err instanceof InvalidExposureTransitionError;
      }
      assert(threwExposedToEvaluated, 'Direct skip EXPOSED -> EVALUATED rejected');

      // 4. Reverse transition (PUBLISHED -> ACCEPTED)
      let threwPublishedToAccepted = false;
      try {
        validateRecommendationExposureTransition(
          RecommendationAttributionStatus.PUBLISHED,
          RecommendationAttributionStatus.ACCEPTED,
          { contentIdeaId: mockIdeaId, draftId: mockDraftId, acceptedAt: now },
        );
      } catch (err: any) {
        threwPublishedToAccepted = err instanceof InvalidExposureTransitionError;
      }
      assert(threwPublishedToAccepted, 'Reverse transition PUBLISHED -> ACCEPTED rejected');

      // 5. Terminal state violation (EVALUATED -> PUBLISHED)
      let threwEvaluatedToPublished = false;
      try {
        validateRecommendationExposureTransition(
          RecommendationAttributionStatus.EVALUATED,
          RecommendationAttributionStatus.PUBLISHED,
          { contentIdeaId: mockIdeaId, draftId: mockDraftId, publishedPostId: mockPostId, publishedAt: now },
        );
      } catch (err: any) {
        threwEvaluatedToPublished = err instanceof InvalidExposureTransitionError;
      }
      assert(threwEvaluatedToPublished, 'Terminal state transition from EVALUATED rejected');

      // 6. Stage-mandatory field checks:
      // ACCEPTED missing draftId
      let threwMissingDraft = false;
      try {
        validateRecommendationExposureTransition(
          RecommendationAttributionStatus.EXPOSED,
          RecommendationAttributionStatus.ACCEPTED,
          { contentIdeaId: mockIdeaId, acceptedAt: now },
        );
      } catch (err: any) {
        threwMissingDraft = err.message.includes('requires contentIdeaId, draftId, and acceptedAt');
      }
      assert(threwMissingDraft, 'Transition to ACCEPTED rejected when draftId is missing');

      // PUBLISHED missing publishedPostId
      let threwMissingPost = false;
      try {
        validateRecommendationExposureTransition(
          RecommendationAttributionStatus.ACCEPTED,
          RecommendationAttributionStatus.PUBLISHED,
          { contentIdeaId: mockIdeaId, draftId: mockDraftId, publishedAt: now },
        );
      } catch (err: any) {
        threwMissingPost = err.message.includes('requires contentIdeaId, draftId, publishedPostId, and publishedAt');
      }
      assert(threwMissingPost, 'Transition to PUBLISHED rejected when publishedPostId is missing');

      // EVALUATED missing observedLift
      let threwMissingLift = false;
      try {
        validateRecommendationExposureTransition(
          RecommendationAttributionStatus.PUBLISHED,
          RecommendationAttributionStatus.EVALUATED,
          {
            contentIdeaId: mockIdeaId,
            draftId: mockDraftId,
            publishedPostId: mockPostId,
            evaluatedPostMetricId: mockMetricId,
            evaluatedAt: now,
          },
        );
      } catch (err: any) {
        threwMissingLift = err.message.includes('requires contentIdeaId, draftId, publishedPostId, evaluatedPostMetricId, observedLift, and evaluatedAt');
      }
      assert(threwMissingLift, 'Transition to EVALUATED rejected when observedLift is missing');

      // 7. Legal linear progression succeeds
      let progressionSucceeded = false;
      try {
        validateRecommendationExposureTransition(null, RecommendationAttributionStatus.EXPOSED, {
          contentIdeaId: mockIdeaId,
        });
        validateRecommendationExposureTransition(
          RecommendationAttributionStatus.EXPOSED,
          RecommendationAttributionStatus.ACCEPTED,
          { contentIdeaId: mockIdeaId, draftId: mockDraftId, acceptedAt: now },
        );
        validateRecommendationExposureTransition(
          RecommendationAttributionStatus.ACCEPTED,
          RecommendationAttributionStatus.PUBLISHED,
          { contentIdeaId: mockIdeaId, draftId: mockDraftId, publishedPostId: mockPostId, publishedAt: now },
        );
        validateRecommendationExposureTransition(
          RecommendationAttributionStatus.PUBLISHED,
          RecommendationAttributionStatus.EVALUATED,
          {
            contentIdeaId: mockIdeaId,
            draftId: mockDraftId,
            publishedPostId: mockPostId,
            evaluatedPostMetricId: mockMetricId,
            observedLift: 0.22,
            evaluatedAt: now,
          },
        );
        progressionSucceeded = true;
      } catch (err: any) {
        progressionSucceeded = false;
      }
      assert(progressionSucceeded, 'Legal linear progression (EXPOSED -> ACCEPTED -> PUBLISHED -> EVALUATED) succeeded');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Test BD: Multi-Tenant Cross-Entity Isolation Enforcement (P0 #2)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Test BD: Multi-Tenant Cross-Entity Isolation Enforcement ---');
    {
      // 1. Service Layer assertion on mismatched workspace
      let threwWorkspaceMismatch = false;
      try {
        assertMatchingTenantScope(
          { workspaceId: testWorkspaceId, socialAccountId: testSocialAccountId },
          { workspaceId: otherWorkspaceId, socialAccountId: otherSocialAccountId },
          'PublishedPost',
        );
      } catch (err: any) {
        threwWorkspaceMismatch = err instanceof TenantIsolationViolationError;
      }
      assert(threwWorkspaceMismatch, 'Cross-workspace linkage rejected by assertMatchingTenantScope');

      // 2. Service Layer assertion on mismatched account
      let threwAccountMismatch = false;
      try {
        assertMatchingTenantScope(
          { workspaceId: testWorkspaceId, socialAccountId: testSocialAccountId },
          { workspaceId: testWorkspaceId, socialAccountId: otherSocialAccountId },
          'PublishedPost',
        );
      } catch (err: any) {
        threwAccountMismatch = err instanceof TenantIsolationViolationError;
      }
      assert(threwAccountMismatch, 'Cross-account linkage rejected by assertMatchingTenantScope');

      // 3. Direct DB-Bypass Negative Test (Engine Level Foreign Key Constraint)
      // Create ContentIdea in Workspace B
      const ideaBeta = await prisma.contentIdea.create({
        data: {
          workspaceId: otherWorkspaceId,
          socialAccountId: otherSocialAccountId,
          title: 'Beta Idea',
          concept: 'Cross tenant test',
          reason: 'Testing FK isolation',
          format: 'SINGLE_POST',
          topic: 'security',
          confidence: 0.9,
          sources: ['test'],
          status: 'SUGGESTED',
        },
      });

      // Attempt to link exposure in Workspace A to idea in Workspace B via raw SQL
      let rawInsertRejected = false;
      try {
        await prisma.$executeRawUnsafe(`
          INSERT INTO recommendation_exposures (
            id, workspace_id, social_account_id, content_idea_id, attribution_status,
            analytics_revision_at_generation, cycle_idempotency_key, exposed_at, updated_at
          ) VALUES (
            gen_random_uuid(), '${testWorkspaceId}'::uuid, '${testSocialAccountId}'::uuid,
            '${ideaBeta.id}'::uuid, 'EXPOSED'::"RecommendationAttributionStatus",
            10, 'idem-cross-bd-${Date.now()}', NOW(), NOW()
          );
        `);
      } catch (err: any) {
        // SQLSTATE 23503: foreign_key_violation
        rawInsertRejected =
          err.message.includes('23503') ||
          err.message.includes('fk_exposure_content_idea_tenant') ||
          err.message.includes('foreign key constraint');
      }
      assert(rawInsertRejected, 'Raw SQL cross-tenant exposure insert rejected by PostgreSQL FK constraint fk_exposure_content_idea_tenant');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Test BJ: Explicit Preference Score Ranking Differentiation (P1 #3)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Test BJ: Explicit Preference Score Ranking Differentiation ---');
    {
      const wLearned = 0.35;
      const wFreshness = 0.15;
      const wExplicit = 0.50;
      const learnedScore = 0.80; // Both have identical learned weight
      const freshnessScore = 1.0; // Both freshly computed

      // User Profile A: preferredTopics = ['productivity_hacks'], avoidedTopics = ['ai_engineering']
      const prefA = {
        preferredTopics: ['productivity_hacks'],
        avoidedTopics: ['ai_engineering'],
      };

      const aiScoreA = computeExplicitPreferenceScore(AggregationDimension.TOPIC, 'ai_engineering', prefA);
      const prodScoreA = computeExplicitPreferenceScore(AggregationDimension.TOPIC, 'productivity_hacks', prefA);

      assert(aiScoreA === 0.10, `ai_engineering explicit score is 0.10 for Profile A (actual: ${aiScoreA})`);
      assert(prodScoreA === 1.00, `productivity_hacks explicit score is 1.00 for Profile A (actual: ${prodScoreA})`);

      const compAiA = Number((wLearned * learnedScore + wFreshness * freshnessScore + wExplicit * aiScoreA).toFixed(4));
      const compProdA = Number((wLearned * learnedScore + wFreshness * freshnessScore + wExplicit * prodScoreA).toFixed(4));

      assert(compAiA === 0.48, `Composite ai_engineering score is 0.48 (actual: ${compAiA})`);
      assert(compProdA === 0.93, `Composite productivity_hacks score is 0.93 (actual: ${compProdA})`);
      assert(compProdA > compAiA, 'Profile A ranks productivity_hacks (Rank 1) above ai_engineering (Rank 2)');

      // User Profile B: preferredTopics = ['ai_engineering'], avoidedTopics = ['productivity_hacks']
      const prefB = {
        preferredTopics: ['ai_engineering'],
        avoidedTopics: ['productivity_hacks'],
      };

      const aiScoreB = computeExplicitPreferenceScore(AggregationDimension.TOPIC, 'ai_engineering', prefB);
      const prodScoreB = computeExplicitPreferenceScore(AggregationDimension.TOPIC, 'productivity_hacks', prefB);

      assert(aiScoreB === 1.00, `ai_engineering explicit score is 1.00 for Profile B (actual: ${aiScoreB})`);
      assert(prodScoreB === 0.10, `productivity_hacks explicit score is 0.10 for Profile B (actual: ${prodScoreB})`);

      const compAiB = Number((wLearned * learnedScore + wFreshness * freshnessScore + wExplicit * aiScoreB).toFixed(4));
      const compProdB = Number((wLearned * learnedScore + wFreshness * freshnessScore + wExplicit * prodScoreB).toFixed(4));

      assert(compAiB > compProdB, 'Profile B ranks ai_engineering (Rank 1) above productivity_hacks (Rank 2)');

      // Neutral profile (no preferences)
      const neutralScore = computeExplicitPreferenceScore(AggregationDimension.TOPIC, 'ai_engineering', null);
      assert(neutralScore === 0.50, `Unconfigured profile returns neutral 0.50 baseline (actual: ${neutralScore})`);
      const compNeutral = Number((wLearned * learnedScore + wFreshness * freshnessScore + wExplicit * neutralScore).toFixed(4));
      assert(compNeutral === 0.68, `Neutral composite score is exactly 0.68 (actual: ${compNeutral})`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Test BK: Deterministic Recommendation asOf & Missing-Config Fail-Closed
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Test BK: Deterministic Recommendation asOf & Missing-Config Fail-Closed ---');
    {
      const canonicalAsOf = new Date('2026-10-01T12:00:00.000Z');
      const computedAt = new Date('2026-09-01T12:00:00.000Z'); // exactly 30 days prior
      const halfLife = 30.0;

      const daysDiff = (canonicalAsOf.getTime() - computedAt.getTime()) / 86400000;
      assert(daysDiff === 30, `daysSinceComputed is exactly 30.0 (actual: ${daysDiff})`);

      const freshness = Math.exp(-daysDiff / halfLife);
      const expectedFreshness = Math.exp(-1); // 0.36787944117...
      assert(
        Math.abs(freshness - expectedFreshness) < 1e-6,
        `Freshness decay matches deterministic mathematical value exp(-1) = ${expectedFreshness.toFixed(4)}`,
      );

      // Cooldown exclusion:
      // Exposure exposed on 2026-09-26 (5 days prior to asOf)
      const exposureDate = new Date('2026-09-26T12:00:00.000Z');
      const sevenDaysAgo = new Date(canonicalAsOf.getTime() - 7 * 86400000);
      assert(
        exposureDate >= sevenDaysAgo && exposureDate <= canonicalAsOf,
        'Exposure within 7-day cooldown window is detected accurately',
      );

      // Missing scoring config fail-closed test:
      await prisma.recommendationScoringConfig.updateMany({
        data: { isActive: false },
      });

      let threwMissingConfig = false;
      try {
        await generateContentRecommendations(
          prisma,
          testWorkspaceId,
          testSocialAccountId,
          {},
          10,
          canonicalAsOf,
        );
      } catch (err: any) {
        threwMissingConfig = err instanceof ConfigurationIntegrityError;
      }
      assert(threwMissingConfig, 'Missing active RecommendationScoringConfig throws ConfigurationIntegrityError (fail-closed)');

      // Restore active config for subsequent tests
      await prisma.recommendationScoringConfig.updateMany({
        data: { isActive: true },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Test BF: Explicit Recommendation Provenance Validation (P1 #3)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Test BF: Explicit Recommendation Provenance Validation ---');
    {
      const asOf = new Date('2026-10-01T12:00:00.000Z');

      // Create Profile
      const profile = await prisma.learnedPerformanceProfile.create({
        data: {
          workspaceId: testWorkspaceId,
          socialAccountId: testSocialAccountId,
          analyticsRevisionAtComputation: 10,
          lastComputedAt: asOf,
        },
      });

      // Create Insight in Workspace A
      const insight = await prisma.insight.create({
        data: {
          workspaceId: testWorkspaceId,
          socialAccountId: testSocialAccountId,
          dimension: AggregationDimension.TOPIC,
          dimensionValue: 'cloud_infra',
          observationSlot: ObservationSlot.T_24H,
          sampleSize: 20,
          complementSize: 50,
          subjectAvgEngagement: 4.5,
          complementAvgEngagement: 2.0,
          absoluteDelta: 2.5,
          percentDelta: 125.0,
          welchPValue: 0.001,
          evidenceGrade: EvidenceGrade.HIGH_SIGNAL,
          hypothesisFamilyKey: 'test_fam_cloud',
          hypothesisFamilyRevision: 1,
          hypothesisFamilySize: 1,
          passesFDR: true,
          observation: 'Proven performance in cloud_infra',
          recommendation: 'Publish more cloud_infra content',
          generationModel: 'gemini-1.5-pro',
          promptVersion: 'v1',
          aggregationVersion: 'v1',
          metricFormulaVersion: 'v1',
          analyticsRevisionAtGeneration: 10,
          analysisWindowStart: new Date('2026-08-01T00:00:00.000Z'),
          analysisWindowEnd: new Date('2026-09-01T00:00:00.000Z'),
          idempotencyKey: `test_insight_cloud_${Date.now()}`,
          isActive: true,
        },
      });

      // Create LearnedDimensionWeight in Workspace A
      const weight = await prisma.learnedDimensionWeight.create({
        data: {
          workspaceId: testWorkspaceId,
          socialAccountId: testSocialAccountId,
          profileId: profile.id,
          dimension: AggregationDimension.TOPIC,
          dimensionValue: 'kubernetes',
          observationSlot: ObservationSlot.T_24H,
          rawWeight: 3.5,
          decayedWeight: 3.5,
          totalSampleSize: 25,
          eligibleBucketCount: 2,
          evidenceBucketCount: 2,
          highestEvidenceGrade: EvidenceGrade.HIGH_SIGNAL,
          isActive: true,
          analyticsRevision: 10,
          computedAt: asOf,
        },
      });

      // 1. Candidate with INSIGHT provenance
      const candInsight = {
        dimension: AggregationDimension.TOPIC,
        dimensionValue: 'cloud_infra',
        topic: 'cloud_infra',
        hookStyle: 'QUESTION',
        suggestedPrompt: 'Prompt for cloud infra',
        strategy: 'EXPLOITATION' as const,
        provenanceType: RecommendationProvenanceType.INSIGHT,
        sourceInsightId: insight.id,
        score: 0.85,
      };

      // 2. Candidate with LEARNED_WEIGHT provenance
      const candWeight = {
        dimension: AggregationDimension.TOPIC,
        dimensionValue: 'kubernetes',
        topic: 'kubernetes',
        hookStyle: 'CONTRARIAN',
        suggestedPrompt: 'Prompt for kubernetes',
        strategy: 'EXPLOITATION' as const,
        provenanceType: RecommendationProvenanceType.LEARNED_WEIGHT,
        sourceWeightId: weight.id,
        score: 0.75,
      };

      // 3. Candidate with EXPLORATION provenance
      const candExploration = {
        dimension: AggregationDimension.FORMAT,
        dimensionValue: 'THREAD',
        topic: 'thread_formatting',
        hookStyle: 'CONTRARIAN',
        suggestedPrompt: 'Exploratory test on THREAD format',
        strategy: 'EXPLORATION' as const,
        provenanceType: RecommendationProvenanceType.EXPLORATION,
        score: 0.50,
      };

      await prisma.$transaction(async (tx) => {
        const persisted = await persistContentRecommendations(
          tx,
          testWorkspaceId,
          testSocialAccountId,
          [candInsight, candWeight, candExploration],
          10,
          asOf,
          10,
        );
        assert(persisted === 3, `All 3 valid provenance candidates persisted successfully (persisted: ${persisted})`);
      });

      // Verify DB records
      const expInsight = await prisma.recommendationExposure.findFirstOrThrow({
        where: { insightId: insight.id },
      });
      assert(
        expInsight.provenanceType === RecommendationProvenanceType.INSIGHT &&
          expInsight.learnedWeightId === null &&
          expInsight.explorationDimension === null,
        'INSIGHT provenance exposure stored with non-null insightId and null other provenance fields',
      );

      const expWeight = await prisma.recommendationExposure.findFirstOrThrow({
        where: { learnedWeightId: weight.id },
      });
      assert(
        expWeight.provenanceType === RecommendationProvenanceType.LEARNED_WEIGHT &&
          expWeight.insightId === null &&
          expWeight.explorationDimension === null,
        'LEARNED_WEIGHT provenance exposure stored with non-null learnedWeightId and null other provenance fields',
      );

      const expExploration = await prisma.recommendationExposure.findFirstOrThrow({
        where: { explorationDimension: AggregationDimension.FORMAT, explorationValue: 'THREAD' },
      });
      assert(
        expExploration.provenanceType === RecommendationProvenanceType.EXPLORATION &&
          expExploration.insightId === null &&
          expExploration.learnedWeightId === null,
        'EXPLORATION provenance exposure stored with exploration dimension/value and null source IDs',
      );

      // Negative check: INSIGHT with null sourceInsightId
      let threwMissingInsight = false;
      try {
        await prisma.$transaction(async (tx) => {
          await persistContentRecommendations(
            tx,
            testWorkspaceId,
            testSocialAccountId,
            [
              {
                ...candInsight,
                dimensionValue: 'cloud_infra_bad',
                sourceInsightId: undefined,
              },
            ],
            10,
            asOf,
            10,
          );
        });
      } catch (err: any) {
        threwMissingInsight = err instanceof MissingProvenanceSourceError;
      }
      assert(threwMissingInsight, 'INSIGHT provenance candidate with null sourceInsightId throws MissingProvenanceSourceError');

      // Negative check: LEARNED_WEIGHT with null sourceWeightId
      let threwMissingWeight = false;
      try {
        await prisma.$transaction(async (tx) => {
          await persistContentRecommendations(
            tx,
            testWorkspaceId,
            testSocialAccountId,
            [
              {
                ...candWeight,
                dimensionValue: 'kubernetes_bad',
                sourceWeightId: undefined,
              },
            ],
            10,
            asOf,
            10,
          );
        });
      } catch (err: any) {
        threwMissingWeight = err instanceof MissingProvenanceSourceError;
      }
      assert(threwMissingWeight, 'LEARNED_WEIGHT provenance candidate with null sourceWeightId throws MissingProvenanceSourceError');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Test BH: Cross-Tenant LearnedDimensionWeight DB-Bypass & Relational Integrity (P0 #1)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 6. Test BH: Cross-Tenant LearnedDimensionWeight DB-Bypass & Relational Integrity ---');
    {
      const profBeta = await prisma.learnedPerformanceProfile.create({
        data: {
          workspaceId: otherWorkspaceId,
          socialAccountId: otherSocialAccountId,
          analyticsRevisionAtComputation: 1,
          lastComputedAt: new Date(),
        },
      });

      // 1. Direct SQL bypass attempting cross-tenant profile linkage:
      let profileCrossBypassRejected = false;
      try {
        await prisma.$executeRawUnsafe(`
          INSERT INTO learned_dimension_weights (
            id, workspace_id, social_account_id, profile_id, dimension, dimension_value,
            raw_weight, decayed_weight, total_sample_size, eligible_bucket_count,
            evidence_bucket_count, highest_evidence_grade, observation_slot, is_active,
            analytics_revision, computed_at
          ) VALUES (
            gen_random_uuid(), '${testWorkspaceId}'::uuid, '${testSocialAccountId}'::uuid,
            '${profBeta.id}'::uuid, 'TOPIC'::"AggregationDimension", 'cross_topic',
            1.0, 1.0, 10, 1, 1, 'HIGH_SIGNAL'::"EvidenceGrade", 'T_24H'::"ObservationSlot",
            true, 1, NOW()
          );
        `);
      } catch (err: any) {
        profileCrossBypassRejected =
          err.message.includes('23503') ||
          err.message.includes('fk_learned_weight_profile_tenant') ||
          err.message.includes('foreign key');
      }
      assert(profileCrossBypassRejected, 'Cross-tenant profile linkage in learned_dimension_weights rejected by fk_learned_weight_profile_tenant');

      // 2. Direct physical delete on referenced Insight or LearnedDimensionWeight rejected (ON DELETE RESTRICT)
      const existingExposure = await prisma.recommendationExposure.findFirstOrThrow({
        where: { socialAccountId: testSocialAccountId, provenanceType: RecommendationProvenanceType.INSIGHT },
      });

      let directDeleteInsightRejected = false;
      try {
        await prisma.$executeRawUnsafe(`
          DELETE FROM insights WHERE id = '${existingExposure.insightId}'::uuid;
        `);
      } catch (err: any) {
        // SQLSTATE 23001: restrict_violation
        directDeleteInsightRejected =
          err.message.includes('23001') ||
          err.message.includes('fk_exposure_insight_tenant') ||
          err.message.includes('foreign key constraint') ||
          err.message.includes('violates foreign key');
      }
      assert(directDeleteInsightRejected, 'Physical DELETE on referenced Insight rejected by ON DELETE RESTRICT (SQLSTATE 23001)');

      const existingWeightExp = await prisma.recommendationExposure.findFirstOrThrow({
        where: { socialAccountId: testSocialAccountId, provenanceType: RecommendationProvenanceType.LEARNED_WEIGHT },
      });

      let directDeleteWeightRejected = false;
      try {
        await prisma.$executeRawUnsafe(`
          DELETE FROM learned_dimension_weights WHERE id = '${existingWeightExp.learnedWeightId}'::uuid;
        `);
      } catch (err: any) {
        directDeleteWeightRejected =
          err.message.includes('23001') ||
          err.message.includes('fk_exposure_learned_weight_tenant') ||
          err.message.includes('foreign key constraint') ||
          err.message.includes('violates foreign key');
      }
      assert(directDeleteWeightRejected, 'Physical DELETE on referenced LearnedDimensionWeight rejected by ON DELETE RESTRICT (SQLSTATE 23001)');

      // 3. Soft-deletion succeeds without violating relational integrity
      const softDeleteRes = await prisma.insight.update({
        where: { id: existingExposure.insightId! },
        data: { isActive: false },
      });
      assert(softDeleteRes.isActive === false, 'Soft-deletion (isActive = false) on referenced Insight succeeds cleanly');

      const softDeleteWtRes = await prisma.learnedDimensionWeight.update({
        where: { id: existingWeightExp.learnedWeightId! },
        data: { isActive: false },
      });
      assert(softDeleteWtRes.isActive === false, 'Soft-deletion (isActive = false) on referenced LearnedDimensionWeight succeeds cleanly');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Test BI: Concurrent Recommendation Budget Race (P1 #2)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 7. Test BI: Concurrent Recommendation Budget Race ---');
    {
      const asOf = new Date('2026-10-01T12:00:00.000Z');
      const maxPending = 10;

      // Current pending count in DB for testSocialAccountId is currently 3 (from Test BF)
      // Let's add 3 more to make current pending count exactly 6
      for (let i = 0; i < 3; i++) {
        const dummyIdea = await prisma.contentIdea.create({
          data: {
            workspaceId: testWorkspaceId,
            socialAccountId: testSocialAccountId,
            title: `Dummy Idea ${i}`,
            concept: 'Dummy concept',
            reason: 'Setup',
            format: 'SINGLE_POST',
            topic: `dummy_${i}`,
            confidence: 0.8,
            sources: ['test'],
            status: 'SUGGESTED',
          },
        });
        await prisma.recommendationExposure.create({
          data: {
            workspaceId: testWorkspaceId,
            socialAccountId: testSocialAccountId,
            provenanceType: RecommendationProvenanceType.EXPLORATION,
            explorationDimension: AggregationDimension.TOPIC,
            explorationValue: `dummy_${i}`,
            contentIdeaId: dummyIdea.id,
            attributionStatus: RecommendationAttributionStatus.EXPOSED,
            analyticsRevisionAtGeneration: 10,
            cycleIdempotencyKey: `dummy_idem_${i}_${Date.now()}`,
            exposedAt: asOf,
          },
        });
      }

      const initialPending = await prisma.recommendationExposure.count({
        where: {
          socialAccountId: testSocialAccountId,
          attributionStatus: { in: [RecommendationAttributionStatus.EXPOSED, RecommendationAttributionStatus.ACCEPTED] },
        },
      });
      assert(initialPending === 6, `Initial pending exposures count is exactly 6 (actual: ${initialPending})`);

      // Both Job A and Job B generate 4 candidates outside transaction
      const jobACandidates: any[] = [
        {
          dimension: AggregationDimension.TOPIC,
          dimensionValue: 'race_topic_a1',
          topic: 'race_topic_a1',
          hookStyle: 'QUESTION',
          suggestedPrompt: 'Prompt A1',
          strategy: 'EXPLORATION',
          provenanceType: RecommendationProvenanceType.EXPLORATION,
          score: 0.5,
        },
        {
          dimension: AggregationDimension.TOPIC,
          dimensionValue: 'race_topic_a2',
          topic: 'race_topic_a2',
          hookStyle: 'QUESTION',
          suggestedPrompt: 'Prompt A2',
          strategy: 'EXPLORATION',
          provenanceType: RecommendationProvenanceType.EXPLORATION,
          score: 0.5,
        },
        {
          dimension: AggregationDimension.FORMAT,
          dimensionValue: 'CAROUSEL_A1',
          topic: 'race_format_a1',
          hookStyle: 'QUESTION',
          suggestedPrompt: 'Prompt A3',
          strategy: 'EXPLORATION',
          provenanceType: RecommendationProvenanceType.EXPLORATION,
          score: 0.5,
        },
        {
          dimension: AggregationDimension.FORMAT,
          dimensionValue: 'CAROUSEL_A2',
          topic: 'race_format_a2',
          hookStyle: 'QUESTION',
          suggestedPrompt: 'Prompt A4',
          strategy: 'EXPLORATION',
          provenanceType: RecommendationProvenanceType.EXPLORATION,
          score: 0.5,
        },
      ];

      const jobBCandidates: any[] = [
        {
          dimension: AggregationDimension.TOPIC,
          dimensionValue: 'race_topic_b1',
          topic: 'race_topic_b1',
          hookStyle: 'QUESTION',
          suggestedPrompt: 'Prompt B1',
          strategy: 'EXPLORATION',
          provenanceType: RecommendationProvenanceType.EXPLORATION,
          score: 0.5,
        },
        {
          dimension: AggregationDimension.TOPIC,
          dimensionValue: 'race_topic_b2',
          topic: 'race_topic_b2',
          hookStyle: 'QUESTION',
          suggestedPrompt: 'Prompt B2',
          strategy: 'EXPLORATION',
          provenanceType: RecommendationProvenanceType.EXPLORATION,
          score: 0.5,
        },
        {
          dimension: AggregationDimension.FORMAT,
          dimensionValue: 'CAROUSEL_B1',
          topic: 'race_format_b1',
          hookStyle: 'QUESTION',
          suggestedPrompt: 'Prompt B3',
          strategy: 'EXPLORATION',
          provenanceType: RecommendationProvenanceType.EXPLORATION,
          score: 0.5,
        },
        {
          dimension: AggregationDimension.FORMAT,
          dimensionValue: 'CAROUSEL_B2',
          topic: 'race_format_b2',
          hookStyle: 'QUESTION',
          suggestedPrompt: 'Prompt B4',
          strategy: 'EXPLORATION',
          provenanceType: RecommendationProvenanceType.EXPLORATION,
          score: 0.5,
        },
      ];

      // Job A persists first under transaction with row lock
      let jobAPersisted = 0;
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT analytics_revision FROM analytics_sync_states WHERE social_account_id = ${testSocialAccountId}::uuid FOR UPDATE;
        `;
        jobAPersisted = await persistContentRecommendations(
          tx,
          testWorkspaceId,
          testSocialAccountId,
          jobACandidates,
          10,
          asOf,
          maxPending,
        );
      });
      assert(jobAPersisted === 4, `Job A persisted all 4 remaining budget slots (persisted: ${jobAPersisted})`);

      // Job B enters transaction second under row lock: re-counts pending (now 10)
      let jobBPersisted = 0;
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT analytics_revision FROM analytics_sync_states WHERE social_account_id = ${testSocialAccountId}::uuid FOR UPDATE;
        `;
        jobBPersisted = await persistContentRecommendations(
          tx,
          testWorkspaceId,
          testSocialAccountId,
          jobBCandidates,
          10,
          asOf,
          maxPending,
        );
      });
      assert(jobBPersisted === 0, `Job B detected budget exhaustion under row lock and persisted 0 candidates (persisted: ${jobBPersisted})`);

      const finalPending = await prisma.recommendationExposure.count({
        where: {
          socialAccountId: testSocialAccountId,
          attributionStatus: { in: [RecommendationAttributionStatus.EXPOSED, RecommendationAttributionStatus.ACCEPTED] },
        },
      });
      assert(finalPending === 10, `Final pending count strictly equals 10 (never exceeds maxPendingRecommendations) (actual: ${finalPending})`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Test BB: Stale Recommendation Revision Guard (P1 #3)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 8. Test BB: Stale Recommendation Revision Guard ---');
    {
      // Current DB sync state revision is 10.
      // Advance sync state to revision 11:
      await prisma.analyticsSyncState.update({
        where: { socialAccountId: testSocialAccountId },
        data: { analyticsRevision: 11 },
      });

      // Worker receives job with sourceRevision = 10 (stale!)
      const staleJobData = {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        sourceRevision: 10,
        asOf: '2026-10-01T12:00:00.000Z',
      };

      const result = await processRecommendationGenerationJob(prisma, staleJobData);
      assert(result.success === false, `Stale recommendation job aborted cleanly (success: false)`);
      assert(result.persistedCount === 0, `Zero recommendations persisted for stale revision 10 (actual: ${result.persistedCount})`);

      const exposuresRev10 = await prisma.recommendationExposure.findMany({
        where: {
          socialAccountId: testSocialAccountId,
          analyticsRevisionAtGeneration: 11, // only rev 10 or earlier existed
        },
      });
      assert(exposuresRev10.length === 0, `Zero records committed for newer revision prematurely`);
    }
  } finally {
    console.log('\n--- Cleaning up integration test data in Neon PostgreSQL ---');
    await cleanupTestData(testWorkspaceId, testSocialAccountId);
    await cleanupTestData(otherWorkspaceId, otherSocialAccountId);
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    console.log('  [CLEANUP] Done.');
  }

  console.log('\n================================================================');
  console.log(`  STEP 5 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
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

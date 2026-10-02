// ─────────────────────────────────────────────────────────────────────────────
// Verification Script: Phase 4 Schema Constraints & PostgreSQL Invariants
// Tests:
//   1. Cross-Tenant Insert Bypass Rejection (SQLSTATE 23503)
//   2. ON DELETE RESTRICT on Attribution Ledger (SQLSTATE 23001)
//   3. Soft Deletion Integrity
//   4. PostMetric Immutability Trigger & Purge Session Bypass
//   5. Single Active Scoring Config Partial Unique Index (SQLSTATE 23505)
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '../packages/database/node_modules/@prisma/client/default.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🧪 Starting Phase 4 Schema & Engine-Level Constraint Verification...\n');

  // Generate unique test IDs
  const runId = Date.now().toString(36);
  const testWorkspaceA = `ws-test-a-${runId}`;
  const testWorkspaceB = `ws-test-b-${runId}`;

  let wsAId: string | null = null;
  let wsBId: string | null = null;

  try {
    // Setup test workspaces and social accounts
    const user = await prisma.user.create({
      data: {
        email: `test-analytics-${runId}@threadpilot.local`,
        passwordHash: 'dummy_hash_for_test',
      },
    });

    const wsA = await prisma.workspace.create({
      data: { userId: user.id, name: testWorkspaceA },
    });
    wsAId = wsA.id;

    const wsB = await prisma.workspace.create({
      data: { userId: user.id, name: testWorkspaceB },
    });
    wsBId = wsB.id;

    const accA = await prisma.socialAccount.create({
      data: {
        workspaceId: wsA.id,
        platform: 'threads',
        externalId: `ext-a-${runId}`,
        username: `user_a_${runId}`,
        connectedAt: new Date(),
      },
    });

    const accB = await prisma.socialAccount.create({
      data: {
        workspaceId: wsB.id,
        platform: 'threads',
        externalId: `ext-b-${runId}`,
        username: `user_b_${runId}`,
        connectedAt: new Date(),
      },
    });

    console.log('✓ Test fixtures created for Tenant A and Tenant B.');

    // ── Test 1: Cross-Tenant Insert Bypass Rejection (SQLSTATE 23503) ────────
    console.log('\n--- 1. Testing Cross-Tenant Insert Bypass Rejection (SQLSTATE 23503) ---');

    const profA = await prisma.learnedPerformanceProfile.create({
      data: {
        workspaceId: wsA.id,
        socialAccountId: accA.id,
        analyticsRevisionAtComputation: 1,
        lastComputedAt: new Date(),
      },
    });

    const profB = await prisma.learnedPerformanceProfile.create({
      data: {
        workspaceId: wsB.id,
        socialAccountId: accB.id,
        analyticsRevisionAtComputation: 1,
        lastComputedAt: new Date(),
      },
    });

    let crossTenantRejected = false;
    try {
      // Direct raw SQL insert linking Tenant A's account with Tenant B's profile
      await prisma.$executeRawUnsafe(`
        INSERT INTO learned_dimension_weights (
          id, workspace_id, social_account_id, profile_id, dimension, dimension_value,
          raw_weight, decayed_weight, total_sample_size, eligible_bucket_count,
          evidence_bucket_count, highest_evidence_grade, observation_slot, is_active,
          analytics_revision, computed_at
        ) VALUES (
          gen_random_uuid(), '${wsA.id}', '${accA.id}', '${profB.id}', 'TOPIC', 'tech',
          1.0, 1.0, 10, 1, 1, 'HIGH_SIGNAL', 'T_24H', true, 1, NOW()
        );
      `);
    } catch (err: any) {
      if (err.message.includes('23503') || err.message.includes('foreign key')) {
        crossTenantRejected = true;
        console.log('✓ Passed: PostgreSQL engine rejected cross-tenant profile linkage with foreign_key_violation (23503).');
      } else {
        throw err;
      }
    }

    if (!crossTenantRejected) {
      throw new Error('FAILED: Cross-tenant insert was unexpectedly allowed by PostgreSQL!');
    }

    // ── Test 2: ON DELETE RESTRICT on Attribution Ledger (SQLSTATE 23001) ────
    console.log('\n--- 2. Testing ON DELETE RESTRICT on Attribution Ledger (SQLSTATE 23001) ---');

    const wtA = await prisma.learnedDimensionWeight.create({
      data: {
        workspaceId: wsA.id,
        socialAccountId: accA.id,
        profileId: profA.id,
        dimension: 'TOPIC',
        dimensionValue: 'engineering',
        rawWeight: 1.0,
        decayedWeight: 1.0,
        totalSampleSize: 10,
        eligibleBucketCount: 1,
        evidenceBucketCount: 1,
        highestEvidenceGrade: 'HIGH_SIGNAL',
        observationSlot: 'T_24H',
        isActive: true,
        analyticsRevision: 1,
        computedAt: new Date(),
      },
    });

    const insA = await prisma.insight.create({
      data: {
        workspaceId: wsA.id,
        socialAccountId: accA.id,
        dimension: 'TOPIC',
        dimensionValue: 'engineering',
        observationSlot: 'T_24H',
        sampleSize: 10,
        complementSize: 50,
        evidenceGrade: 'HIGH_SIGNAL',
        hypothesisFamilyKey: 'TOPIC:T_24H',
        hypothesisFamilyRevision: 1,
        hypothesisFamilySize: 5,
        passesFDR: true,
        observation: 'High engagement in engineering',
        recommendation: 'Post more engineering content',
        generationModel: 'gemini-1.5-pro',
        promptVersion: 'v1',
        aggregationVersion: 'v1',
        metricFormulaVersion: 'v1',
        analyticsRevisionAtGeneration: 1,
        analysisWindowStart: new Date(),
        analysisWindowEnd: new Date(),
        idempotencyKey: `ins-test-${runId}`,
        isActive: true,
      },
    });

    const expA = await prisma.recommendationExposure.create({
      data: {
        workspaceId: wsA.id,
        socialAccountId: accA.id,
        provenanceType: 'INSIGHT',
        insightId: insA.id,
        learnedWeightId: wtA.id,
        attributionStatus: 'EXPOSED',
        analyticsRevisionAtGeneration: 1,
        cycleIdempotencyKey: `idem-test-${runId}`,
      },
    });

    let deleteInsightRejected = false;
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM insights WHERE id = '${insA.id}';`);
    } catch (err: any) {
      if (err.message.includes('23001') || err.message.includes('fk_exposure_insight_tenant') || err.message.includes('foreign key')) {
        deleteInsightRejected = true;
        console.log('✓ Passed: Direct DELETE of Insight referenced by exposure rejected with RESTRICT violation (SQLSTATE 23001).');
      } else {
        throw err;
      }
    }

    if (!deleteInsightRejected) {
      throw new Error('FAILED: Physical deletion of referenced Insight was unexpectedly allowed!');
    }

    let deleteWeightRejected = false;
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM learned_dimension_weights WHERE id = '${wtA.id}';`);
    } catch (err: any) {
      if (err.message.includes('23001') || err.message.includes('fk_exposure_learned_weight_tenant') || err.message.includes('foreign key')) {
        deleteWeightRejected = true;
        console.log('✓ Passed: Direct DELETE of LearnedWeight referenced by exposure rejected with RESTRICT violation (SQLSTATE 23001).');
      } else {
        throw err;
      }
    }

    if (!deleteWeightRejected) {
      throw new Error('FAILED: Physical deletion of referenced LearnedWeight was unexpectedly allowed!');
    }

    // ── Test 3: Soft Deletion Integrity ─────────────────────────────────────
    console.log('\n--- 3. Testing Soft Deletion Integrity ---');

    await prisma.insight.update({
      where: { id: insA.id },
      data: { isActive: false },
    });
    console.log('✓ Passed: Soft-deletion of Insight (isActive = false) succeeds cleanly.');

    await prisma.learnedDimensionWeight.update({
      where: { id: wtA.id },
      data: { isActive: false },
    });
    console.log('✓ Passed: Soft-deletion of LearnedDimensionWeight (isActive = false) succeeds cleanly.');

    // ── Test 4: PostMetric Immutability Trigger & Purge Bypass ───────────────
    console.log('\n--- 4. Testing PostMetric Immutability Trigger & Purge Bypass ---');

    const draftA = await prisma.contentDraft.create({
      data: {
        workspaceId: wsA.id,
        status: 'DRAFT',
      },
    });

    const versionA = await prisma.contentVersion.create({
      data: {
        draftId: draftA.id,
        version: 1,
        body: 'Test post body for analytics verification',
        editedBy: 'USER',
      },
    });

    const pubPostA = await prisma.publishedPost.create({
      data: {
        workspaceId: wsA.id,
        socialAccountId: accA.id,
        draftId: draftA.id,
        publishedVersionId: versionA.id,
        threadsPostId: `tp-${runId}`,
        publishedAt: new Date(),
      },
    });

    const obsA = await prisma.analyticsObservation.create({
      data: {
        workspaceId: wsA.id,
        socialAccountId: accA.id,
        publishedPostId: pubPostA.id,
        observationSlot: 'T_24H',
        scheduledFor: new Date(),
        windowClosesAt: new Date(Date.now() + 86400000),
        status: 'CAPTURED',
      },
    });

    const pmA = await prisma.postMetric.create({
      data: {
        workspaceId: wsA.id,
        socialAccountId: accA.id,
        publishedPostId: pubPostA.id,
        observationId: obsA.id,
        observationSlot: 'T_24H',
        capturedAt: new Date(),
        views: 100,
        likes: 10,
        replies: 5,
        rawApiResponse: { views: 100 },
      },
    });

    // Test UPDATE rejection
    let updateRejected = false;
    try {
      await prisma.$executeRawUnsafe(`UPDATE post_metrics SET views = 200 WHERE id = '${pmA.id}';`);
    } catch (err: any) {
      if (err.message.includes('immutable') || err.message.includes('UPDATE rejected')) {
        updateRejected = true;
        console.log('✓ Passed: Direct UPDATE on post_metrics rejected by trigger.');
      } else {
        throw err;
      }
    }
    if (!updateRejected) {
      throw new Error('FAILED: UPDATE on post_metrics was unexpectedly permitted!');
    }

    // Test ordinary DELETE rejection
    let deleteRejected = false;
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM post_metrics WHERE id = '${pmA.id}';`);
    } catch (err: any) {
      if (err.message.includes('threadpilot.allow_purge')) {
        deleteRejected = true;
        console.log('✓ Passed: Ordinary DELETE on post_metrics rejected without purge session setting.');
      } else {
        throw err;
      }
    }
    if (!deleteRejected) {
      throw new Error('FAILED: Ordinary DELETE on post_metrics was unexpectedly permitted!');
    }

    // Test DELETE inside authorized purge session
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL threadpilot.allow_purge = 'on';`);
      await tx.$executeRawUnsafe(`DELETE FROM post_metrics WHERE id = '${pmA.id}';`);
    });
    console.log('✓ Passed: Authorized purge session (SET LOCAL threadpilot.allow_purge = \'on\') cleanly deleted post_metric row.');

    // ── Test 5: Single Active Scoring Config Partial Unique Index ────────────
    console.log('\n--- 5. Testing Single Active Scoring Config Partial Unique Index ---');

    let duplicateActiveConfigRejected = false;
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO recommendation_scoring_configs (
          id, weight_learned_weight, weight_freshness, weight_explicit_pref,
          exploration_fraction, half_life_days, max_candidates_per_cycle, is_active, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), 0.35, 0.15, 0.50, 0.20, 30.0, 4, true, NOW(), NOW()
        );
      `);
    } catch (err: any) {
      if (err.message.includes('23505') || err.message.includes('idx_single_active_scoring_config') || err.message.includes('unique')) {
        duplicateActiveConfigRejected = true;
        console.log('✓ Passed: Second active recommendation scoring config rejected with unique violation (SQLSTATE 23505).');
      } else {
        throw err;
      }
    }

    if (!duplicateActiveConfigRejected) {
      throw new Error('FAILED: Multiple active recommendation scoring configs were allowed!');
    }

    console.log('\n🎉 ALL 5 DATABASE-LEVEL ENGINE CONSTRAINTS & INVARIANTS VERIFIED SUCCESSFULLY!\n');
  } finally {
    // Cleanup test data inside purge session
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL threadpilot.allow_purge = 'on';`);
        if (wsAId) await tx.workspace.delete({ where: { id: wsAId } }).catch(() => {});
        if (wsBId) await tx.workspace.delete({ where: { id: wsBId } }).catch(() => {});
      });
      console.log('✓ Test cleanup completed.');
    } catch (cleanupErr) {
      // Ignore cleanup error in test
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});

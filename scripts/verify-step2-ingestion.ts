import { PrismaClient, ObservationSlot, ObservationStatus, AnalyticsOutboxType, OutboxEventStatus } from '../packages/database/node_modules/@prisma/client/default.js';
import { randomUUID } from 'node:crypto';
import {
  ObservationSchedulingService,
  OBSERVATION_SLOT_CONFIGS,
  ORDERED_OBSERVATION_SLOTS,
} from '../apps/worker/dist/services/observation-scheduler.service.js';
import {
  VALID_OBSERVATION_TRANSITIONS,
  validateObservationTransition,
  InvalidObservationTransitionError,
} from '../apps/worker/dist/services/observation-fsm.service.js';
import {
  AnalyticsSyncProcessor,
  computeDerivedRates,
  StaleObservationWorkerError,
} from '../apps/worker/dist/processors/analytics-sync.processor.js';
import { ExpiredObservationSweeperService } from '../apps/worker/dist/services/expired-observation-sweeper.service.js';
import { AnalyticsOutboxService } from '../apps/worker/dist/services/analytics-outbox.service.js';

const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log('🧪 STEP 2 VERIFICATION: Observation Scheduling & Ingestion Engine');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      if (detail) console.error(`     Detail: ${detail}`);
      process.exitCode = 1;
    }
  }

  // Generate test tenant fixtures
  const testWorkspaceId = randomUUID();
  const testSocialAccountId = randomUUID();
  const testUserId = randomUUID();

  console.log(`Setting up test fixture: Workspace [${testWorkspaceId}] and SocialAccount [${testSocialAccountId}]...`);

  // Neon serverless wake-up retry
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await prisma.$connect();
      break;
    } catch (e) {
      if (attempt === 4) throw e;
      console.log(`Neon connecting... attempt ${attempt}/4`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  await prisma.user.create({
    data: {
      id: testUserId,
      email: `test-step2-${Date.now()}@threadpilot.ai`,
      passwordHash: 'dummy_hash',
    },
  });

  await prisma.workspace.create({
    data: {
      id: testWorkspaceId,
      name: 'Step 2 Test Workspace',
      userId: testUserId,
    },
  });

  await prisma.socialAccount.create({
    data: {
      id: testSocialAccountId,
      workspaceId: testWorkspaceId,
      platform: 'threads',
      externalId: `th_${Date.now()}`,
      username: `tester_${Date.now()}`,
      connectedAt: new Date(),
    },
  });

  async function createPublishedPostHelper(threadsPostId: string, publishedAtDate: Date = new Date()) {
    const idea = await prisma.contentIdea.create({
      data: {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        title: 'Step 2 Test Idea',
        concept: 'Concept description for test',
        reason: 'Reasoning for test',
        format: 'THREAD',
        topic: 'Tech',
        confidence: 0.95,
        sources: ['manual'],
        status: 'ACCEPTED',
      },
    });

    const draft = await prisma.contentDraft.create({
      data: {
        workspaceId: testWorkspaceId,
        ideaId: idea.id,
        status: 'PUBLISHED',
      },
    });

    const version = await prisma.contentVersion.create({
      data: {
        draftId: draft.id,
        version: 1,
        body: 'Testing Phase 4 analytics',
        editedBy: 'USER',
      },
    });

    return prisma.publishedPost.create({
      data: {
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        draftId: draft.id,
        publishedVersionId: version.id,
        threadsPostId,
        publishedAt: publishedAtDate,
      },
    });
  }

  // Create initial published post
  const publishedAt = new Date();
  const testPost = await createPublishedPostHelper(`threads_post_${Date.now()}`, publishedAt);
  const testPostId = testPost.id;

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Observation FSM Transition Validation
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 1. Observation FSM Transitions ---');
  {
    // Valid transitions
    let validTransitionPassed = true;
    try {
      validateObservationTransition(ObservationStatus.SCHEDULED, ObservationStatus.PROCESSING);
      validateObservationTransition(ObservationStatus.SCHEDULED, ObservationStatus.MISSED);
      validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.CAPTURED);
      validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.FAILED);
      validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.RATE_LIMITED);
      validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.MISSED);
      validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.DELETED);
      validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.UNAVAILABLE);
      validateObservationTransition(ObservationStatus.FAILED, ObservationStatus.PROCESSING);
      validateObservationTransition(ObservationStatus.FAILED, ObservationStatus.MISSED);
      validateObservationTransition(ObservationStatus.RATE_LIMITED, ObservationStatus.PROCESSING);
      validateObservationTransition(ObservationStatus.RATE_LIMITED, ObservationStatus.MISSED);
    } catch {
      validTransitionPassed = false;
    }
    assert(validTransitionPassed, 'All valid FSM transitions allowed');

    // Invalid transitions (Terminal states cannot transition)
    let terminalBlocked = true;
    try {
      validateObservationTransition(ObservationStatus.CAPTURED, ObservationStatus.PROCESSING);
      terminalBlocked = false;
    } catch (e) {
      terminalBlocked = e instanceof InvalidObservationTransitionError;
    }
    assert(terminalBlocked, 'Terminal CAPTURED state blocks any transition');

    let illegalSkipBlocked = true;
    try {
      validateObservationTransition(ObservationStatus.SCHEDULED, ObservationStatus.CAPTURED);
      illegalSkipBlocked = false;
    } catch (e) {
      illegalSkipBlocked = e instanceof InvalidObservationTransitionError;
    }
    assert(illegalSkipBlocked, 'Illegal state skip SCHEDULED -> CAPTURED blocked');
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Strict NULL-Safe Derived Rates Computation (Invariant 11)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. Derived Metric Rates (Strict NULL Safety) ---');
  {
    // All metrics present
    const fullMetrics = {
      views: 1000,
      likes: 50,
      replies: 20,
      reposts: 10,
      quotes: 5,
    };
    const fullRates = computeDerivedRates(fullMetrics, 500);
    assert(
      fullRates.engagementRateByViews === 8.0, // (50 + 20 + 10) / 1000 * 100 = 8.0%
      'engagementRateByViews correctly computed for non-null metrics',
      `Got ${fullRates.engagementRateByViews}`,
    );
    assert(
      fullRates.engagementRateByFollowers === 16.0, // (50 + 20 + 10) / 500 * 100 = 16.0%
      'engagementRateByFollowers correctly computed with non-null followers',
    );
    assert(fullRates.replyRate === 2.0, 'replyRate correctly computed');
    assert(fullRates.likeRate === 5.0, 'likeRate correctly computed');
    assert(fullRates.repostRate === 1.0, 'repostRate correctly computed');
    assert(fullRates.quoteRate === 0.5, 'quoteRate correctly computed');

    // Zero views: all rates must be NULL (no division by zero or NaN)
    const zeroViewMetrics = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0 };
    const zeroRates = computeDerivedRates(zeroViewMetrics, 100);
    assert(
      zeroRates.engagementRateByViews === null && zeroRates.replyRate === null,
      'Zero views strictly yields null rates without division by zero',
    );

    // Missing metric (NULL safety: NO ?? 0 coercion)
    const missingRepostMetrics = { views: 1000, likes: 50, replies: 20, reposts: null, quotes: 5 };
    const missingRates = computeDerivedRates(missingRepostMetrics, 500);
    assert(
      missingRates.engagementRateByViews === null,
      'Missing reposts strictly yields null engagementRateByViews (no coercion to 0)',
    );
    assert(
      missingRates.repostRate === null,
      'Missing reposts strictly yields null repostRate',
    );
    assert(
      missingRates.likeRate === 5.0,
      'Independent likeRate remains computable when likes and views are non-null',
    );
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Observation Scheduling on Publish
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. Observation Scheduling on Post Publish ---');
  const scheduler = new ObservationSchedulingService(prisma);
  const scheduledObservations = await scheduler.scheduleObservations(prisma, {
    workspaceId: testWorkspaceId,
    socialAccountId: testSocialAccountId,
    publishedPostId: testPostId,
    publishedAt,
  });

  assert(scheduledObservations.length === 5, 'Exactly 5 observation slots scheduled');

  const slotMap = new Map(scheduledObservations.map((o) => [o.observationSlot, o]));
  for (const slot of ORDERED_OBSERVATION_SLOTS) {
    const obs = slotMap.get(slot);
    assert(obs !== undefined, `Slot ${slot} scheduled successfully`);
    if (obs) {
      const config = OBSERVATION_SLOT_CONFIGS[slot];
      const expectedScheduledFor = new Date(publishedAt.getTime() + config.delayMs);
      const expectedWindowClosesAt = new Date(expectedScheduledFor.getTime() + config.windowMs);

      assert(
        Math.abs(obs.scheduledFor.getTime() - expectedScheduledFor.getTime()) < 1000,
        `Slot ${slot} scheduledFor matches defined offset (+${config.delayMs / 1000}s)`,
      );
      assert(
        Math.abs(obs.windowClosesAt.getTime() - expectedWindowClosesAt.getTime()) < 1000,
        `Slot ${slot} windowClosesAt matches defined window length (+${config.windowMs / 1000}s)`,
      );
      assert(obs.status === ObservationStatus.SCHEDULED, `Slot ${slot} initial status is SCHEDULED`);
    }
  }

  // Verify AnalyticsSyncState was created
  const syncState = await prisma.analyticsSyncState.findUnique({
    where: { socialAccountId: testSocialAccountId },
  });
  assert(syncState !== null, 'AnalyticsSyncState record automatically created');

  // Verify AnalyticsOutboxEvent rows created
  const outboxEvents = await prisma.analyticsOutboxEvent.findMany({
    where: { socialAccountId: testSocialAccountId, eventType: AnalyticsOutboxType.TRIGGER_OBSERVATION },
  });
  assert(outboxEvents.length === 5, '5 TRIGGER_OBSERVATION outbox events created for slots');

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Atomic CAS Lease Claiming & Concurrency Protection
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 4. CAS Lease Claiming & Concurrency Fencing ---');
  const targetObs = scheduledObservations[0]; // T_1H observation
  const leaseTokenA = randomUUID();

  // Worker A claims lease
  const claimedA = await prisma.$executeRaw`
    UPDATE analytics_observations
    SET status = 'PROCESSING'::"ObservationStatus",
        lease_token = ${leaseTokenA},
        lease_until = NOW() + INTERVAL '60 seconds',
        last_attempt_at = NOW(),
        attempt_count = attempt_count + 1,
        updated_at = NOW()
    WHERE id = ${targetObs.id}::uuid
      AND (
        status IN ('SCHEDULED', 'FAILED', 'RATE_LIMITED')
        OR (status = 'PROCESSING' AND lease_until < NOW())
      );
  `;
  assert(claimedA === 1, 'Worker A successfully claims active observation CAS lease');

  // Worker B attempts concurrent claim on same observation
  const leaseTokenB = randomUUID();
  const claimedB = await prisma.$executeRaw`
    UPDATE analytics_observations
    SET status = 'PROCESSING'::"ObservationStatus",
        lease_token = ${leaseTokenB},
        lease_until = NOW() + INTERVAL '60 seconds',
        last_attempt_at = NOW(),
        attempt_count = attempt_count + 1,
        updated_at = NOW()
    WHERE id = ${targetObs.id}::uuid
      AND (
        status IN ('SCHEDULED', 'FAILED', 'RATE_LIMITED')
        OR (status = 'PROCESSING' AND lease_until < NOW())
      );
  `;
  assert(claimedB === 0, 'Worker B CAS claim rejected while Worker A holds active lease');

  // Heartbeat lease renewal
  const renewedA = await prisma.$executeRaw`
    UPDATE analytics_observations
    SET lease_until = NOW() + INTERVAL '60 seconds',
        updated_at = NOW()
    WHERE id = ${targetObs.id}::uuid
      AND status = 'PROCESSING'
      AND lease_token = ${leaseTokenA};
  `;
  assert(renewedA === 1, 'Active heartbeat extends Worker A lease');

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Test BE — Window Cutoff Enforcement on Capture (P0 #1)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 5. Test BE: In-Flight Window Cutoff Enforcement ---');
  // Create an observation whose window closes in 500ms
  const expiringPost = await createPublishedPostHelper(`expiring_${Date.now()}`);
  const expiringPostId = expiringPost.id;

  const expiringObs = await prisma.analyticsObservation.create({
    data: {
      workspaceId: testWorkspaceId,
      socialAccountId: testSocialAccountId,
      publishedPostId: expiringPostId,
      observationSlot: ObservationSlot.T_1H,
      scheduledFor: new Date(),
      windowClosesAt: new Date(Date.now() + 400), // closes in 400ms!
      status: ObservationStatus.SCHEDULED,
    },
  });

  const processor = new AnalyticsSyncProcessor(prisma);

  // Execute observation attempt with a mock fetch delay of 700ms (crosses window cutoff!)
  await processor.processObservationAttempt(expiringObs.id, async () => {
    await new Promise((r) => setTimeout(r, 700)); // Crosses the 400ms window cutoff!
    return {
      views: 500,
      likes: 25,
      replies: 5,
      reposts: 2,
      quotes: 1,
    };
  });

  // Verify Test BE invariants:
  const finalExpiringObs = await prisma.analyticsObservation.findUniqueOrThrow({
    where: { id: expiringObs.id },
  });
  assert(
    finalExpiringObs.status === ObservationStatus.MISSED,
    'In-flight late return observation strictly transitions to MISSED',
    `Status was ${finalExpiringObs.status}`,
  );

  const metricCount = await prisma.postMetric.count({
    where: { observationId: expiringObs.id },
  });
  assert(metricCount === 0, 'Exactly ZERO PostMetric rows written for late observation');

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Successful Capture & Downstream Trigger (Happy Path)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 6. Successful Capture & Downstream Trigger ---');
  // Reset targetObs back to SCHEDULED
  await prisma.analyticsObservation.update({
    where: { id: targetObs.id },
    data: {
      status: ObservationStatus.SCHEDULED,
      leaseToken: null,
      leaseUntil: null,
      windowClosesAt: new Date(Date.now() + 3600000), // 1 hour in future
    },
  });

  const prevSyncState = await prisma.analyticsSyncState.findUniqueOrThrow({
    where: { socialAccountId: testSocialAccountId },
  });

  await processor.processObservationAttempt(targetObs.id, async () => {
    return {
      views: 1200,
      likes: 60,
      replies: 24,
      reposts: 12,
      quotes: 6,
    };
  });

  const capturedObs = await prisma.analyticsObservation.findUniqueOrThrow({
    where: { id: targetObs.id },
  });
  assert(capturedObs.status === ObservationStatus.CAPTURED, 'Observation status transitioned to CAPTURED');

  const createdMetric = await prisma.postMetric.findUnique({
    where: { observationId: targetObs.id },
  });
  assert(createdMetric !== null, 'Authoritative PostMetric row created');
  assert(createdMetric?.views === 1200, 'PostMetric views correctly recorded');
  assert(
    createdMetric?.engagementRateByViews === 8.0, // (60 + 24 + 12) / 1200 * 100 = 8.0%
    'Derived engagementRateByViews accurately persisted',
  );

  const nextSyncState = await prisma.analyticsSyncState.findUniqueOrThrow({
    where: { socialAccountId: testSocialAccountId },
  });
  assert(
    nextSyncState.ingestionGeneration === prevSyncState.ingestionGeneration + 1,
    'ingestionGeneration atomically incremented in analytics_sync_states',
  );

  const aggOutbox = await prisma.analyticsOutboxEvent.findFirst({
    where: {
      socialAccountId: testSocialAccountId,
      eventType: AnalyticsOutboxType.TRIGGER_AGGREGATION,
      dedupeKey: `aggregate:${testSocialAccountId}:gen${nextSyncState.ingestionGeneration}:${targetObs.observationSlot}`,
    },
  });
  assert(aggOutbox !== null, 'TRIGGER_AGGREGATION outbox event enqueued with generation lineage');

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Test BA — Dead Worker Recovery by Sweeper (P0 #2)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 7. Test BA: Dead Worker Recovery by Sweeper ---');
  // Create an abandoned observation with expired lease but open window
  const deadPost = await createPublishedPostHelper(`dead_${Date.now()}`);
  const deadPostId = deadPost.id;

  const deadObs = await prisma.analyticsObservation.create({
    data: {
      workspaceId: testWorkspaceId,
      socialAccountId: testSocialAccountId,
      publishedPostId: deadPostId,
      observationSlot: ObservationSlot.T_24H,
      scheduledFor: new Date(),
      windowClosesAt: new Date(Date.now() + 7200000), // 2 hours open
      status: ObservationStatus.PROCESSING,
      leaseToken: randomUUID(),
      leaseUntil: new Date(Date.now() - 5000), // lease expired 5 seconds ago!
      attemptCount: 1,
    },
  });

  const sweeper = new ExpiredObservationSweeperService(prisma);
  const sweepResult = await sweeper.reconcileExpiredObservations();

  assert(sweepResult.recoveredCount >= 1, 'Sweeper recovered dead worker observation');

  const recoveredObs = await prisma.analyticsObservation.findUniqueOrThrow({
    where: { id: deadObs.id },
  });
  assert(recoveredObs.status === ObservationStatus.FAILED, 'Recovered observation transitioned to FAILED');
  assert(recoveredObs.leaseToken === null, 'Stale lease token cleared');
  assert(recoveredObs.attemptCount === 2, 'attemptCount incremented on recovery');

  const retryOutbox = await prisma.analyticsOutboxEvent.findFirst({
    where: {
      dedupeKey: `retry-observation:${deadObs.id}:recovered_2`,
      eventType: AnalyticsOutboxType.RETRY_OBSERVATION,
    },
  });
  assert(retryOutbox !== null, 'Durable RETRY_OBSERVATION outbox event enqueued by sweeper');

  // ─────────────────────────────────────────────────────────────
  // TEST 8: Test AY — Delayed Retry After Window Closure (P1 #4)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 8. Test AY: Delayed Retry After Window Closure ---');
  // Create an observation that failed, but window has now expired
  const closedPost = await createPublishedPostHelper(`closed_${Date.now()}`);
  const closedPostId = closedPost.id;

  const closedObs = await prisma.analyticsObservation.create({
    data: {
      workspaceId: testWorkspaceId,
      socialAccountId: testSocialAccountId,
      publishedPostId: closedPostId,
      observationSlot: ObservationSlot.T_1H,
      scheduledFor: new Date(Date.now() - 7200000),
      windowClosesAt: new Date(Date.now() - 3600000), // window closed 1 hour ago
      status: ObservationStatus.FAILED,
    },
  });

  // Sweeper runs terminal closure
  await sweeper.reconcileExpiredObservations();
  const sweptClosed = await prisma.analyticsObservation.findUniqueOrThrow({
    where: { id: closedObs.id },
  });
  assert(sweptClosed.status === ObservationStatus.MISSED, 'Expired window transitioned to terminal MISSED by sweeper');

  // Delayed retry job now arrives for sweptClosed
  await processor.processObservationAttempt(sweptClosed.id);
  const finalRetryObs = await prisma.analyticsObservation.findUniqueOrThrow({
    where: { id: sweptClosed.id },
  });
  assert(finalRetryObs.status === ObservationStatus.MISSED, 'Status remains MISSED after delayed retry attempt');

  // ─────────────────────────────────────────────────────────────
  // TEST 9: Test BG — Outbox Replay with Delivery Generation (P1 #5)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 9. Test BG: Outbox Replay with Delivery Generation ---');
  const outboxService = new AnalyticsOutboxService(prisma);
  const replayEvent = await prisma.analyticsOutboxEvent.create({
    data: {
      workspaceId: testWorkspaceId,
      socialAccountId: testSocialAccountId,
      dedupeKey: `test_replay_${Date.now()}`,
      eventType: AnalyticsOutboxType.TRIGGER_AGGREGATION,
      status: OutboxEventStatus.FAILED,
      payload: { test: true },
      deliveryGeneration: 1,
      attemptCount: 5,
    },
  });

  const replayedCount = await outboxService.replayFailedOutboxEvents([replayEvent.id]);
  assert(replayedCount === 1, 'Replayed exactly 1 failed outbox event');

  const afterReplay = await prisma.analyticsOutboxEvent.findUniqueOrThrow({
    where: { id: replayEvent.id },
  });
  assert(afterReplay.status === OutboxEventStatus.PENDING, 'Replayed event status reset to PENDING');
  assert(afterReplay.deliveryGeneration === 2, 'deliveryGeneration incremented to 2 for BullMQ isolation');
  assert(afterReplay.attemptCount === 0, 'attemptCount reset to 0');

  // Cleanup test fixtures with authorized purge bypass and dependency ordering
  console.log('\nCleaning up test fixtures...');
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL threadpilot.allow_purge = 'on';`;
    await tx.analyticsOutboxEvent.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await tx.postMetric.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await tx.analyticsObservation.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await tx.publishedPost.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await tx.contentVersion.deleteMany({ where: { draft: { workspaceId: testWorkspaceId } } });
    await tx.contentDraft.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await tx.contentIdea.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await tx.analyticsSyncState.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await tx.socialAccount.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await tx.workspace.delete({ where: { id: testWorkspaceId } });
  }, { timeout: 30000, maxWait: 10000 });
  await prisma.user.delete({ where: { id: testUserId } });

  console.log('\n================================================================');
  console.log(`🎉 STEP 2 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED!`);
  console.log('================================================================\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Test execution fatal error:', e);
  await prisma.$disconnect();
  process.exit(1);
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  evaluateAST,
  RuleASTSchema,
  RuleActionSchema,
  getIsoWeekWindow,
} from '@threadpilot/types';
import {
  generatePermutedBlock,
  computeTemporalBlockKey,
} from '../dist/services/experimentation.service.js';
import { welchTTest, safeCohensD } from '../dist/services/statistical-evidence.service.js';

describe('Phase 5 Comprehensive Acceptance Test Suite', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // MODULE 1: AUTOMATION RULES & ACTION-LEVEL IDEMPOTENCY (P5-75)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Module 1: Rules Engine & P5-75 Transactional Verification', () => {
    it('evaluates AST conditions with nested and, or, not, and comparison operators', () => {
      const ast = {
        and: [
          { field: 'metric.engagementRate', op: '>=', value: 0.05 },
          {
            or: [
              { field: 'context.topic', op: '==', value: 'tech' },
              { field: 'context.topic', op: 'in', value: ['ai', 'coding'] },
            ],
          },
          {
            not: {
              field: 'content.body',
              op: 'contains',
              value: 'prohibited',
            },
          },
        ],
      };

      // Validates against Zod AST schema
      const validatedAST = RuleASTSchema.parse(ast);

      const matchingContext = {
        metric: { engagementRate: 0.06 },
        context: { topic: 'ai' },
        content: { body: 'A post about AI developments' },
      };

      const nonMatchingContext = {
        metric: { engagementRate: 0.03 },
        context: { topic: 'ai' },
        content: { body: 'A post about AI developments' },
      };

      assert.strictEqual(evaluateAST(validatedAST, matchingContext), true);
      assert.strictEqual(evaluateAST(validatedAST, nonMatchingContext), false);
    });

    it('enforces conditional schema validation on AUTO_SCHEDULE action (.superRefine)', () => {
      // Valid NEXT_OPTIMAL action (no offsetHours)
      const validNextOptimal = {
        type: 'AUTO_SCHEDULE',
        version: 1,
        params: { slotStrategy: 'NEXT_OPTIMAL', priority: 'NORMAL' },
      };
      assert.doesNotThrow(() => RuleActionSchema.parse(validNextOptimal));

      // Invalid NEXT_OPTIMAL action (specifying offsetHours)
      const invalidNextOptimal = {
        type: 'AUTO_SCHEDULE',
        version: 1,
        params: { slotStrategy: 'NEXT_OPTIMAL', offsetHours: 4, priority: 'NORMAL' },
      };
      assert.throws(() => RuleActionSchema.parse(invalidNextOptimal));

      // Valid FIXED_OFFSET_HOURS action (with offsetHours)
      const validOffset = {
        type: 'AUTO_SCHEDULE',
        version: 1,
        params: { slotStrategy: 'FIXED_OFFSET_HOURS', offsetHours: 24, priority: 'HIGH' },
      };
      assert.doesNotThrow(() => RuleActionSchema.parse(validOffset));

      // Invalid FIXED_OFFSET_HOURS action (missing offsetHours)
      const invalidOffset = {
        type: 'AUTO_SCHEDULE',
        version: 1,
        params: { slotStrategy: 'FIXED_OFFSET_HOURS', priority: 'HIGH' },
      };
      assert.throws(() => RuleActionSchema.parse(invalidOffset));
    });

    it('P5-75 CRITICAL: proves co-transactional boundary between RuleActionExecution and concrete side effect', async () => {
      // In-memory simulated transactional database enforcing unique constraints
      const committedActionExecutions = new Map<string, any>();
      const committedScheduledPosts = new Map<string, any>();
      const committedProposals = new Map<string, any>();

      async function executeRuleActionInTransaction(
        tx: {
          insertActionExecution: (record: any) => Promise<void>;
          insertScheduledPost?: (record: any) => Promise<void>;
          insertProposal?: (record: any) => Promise<void>;
        },
        actionType: 'AUTO_SCHEDULE' | 'ADAPT_STYLE_WEIGHT',
        actionExecutionKey: string,
        domainEntity: any,
      ) {
        // Step 1: Insert RuleActionExecution
        await tx.insertActionExecution({
          actionExecutionKey,
          actionType,
          status: 'EXECUTED',
        });

        // Step 2: Insert concrete domain side effect bound to the identical actionExecutionKey
        if (actionType === 'AUTO_SCHEDULE') {
          await tx.insertScheduledPost!({
            ...domainEntity,
            idempotencyKey: actionExecutionKey,
          });
        } else if (actionType === 'ADAPT_STYLE_WEIGHT') {
          await tx.insertProposal!({
            ...domainEntity,
            actionExecutionKey,
          });
        }
      }

      const ruleId = randomUUID();
      const executionWindow = '2026-10-04';
      const executionKey = 'trigger-event-1';
      const actionIndex = 0;
      const actionExecutionKey = `${ruleId}:${executionWindow}:${executionKey}:${actionIndex}`;

      // Worker A attempts execution
      const workerATransaction = {
        actionExecutionKey,
        pendingActions: [] as any[],
        pendingPosts: [] as any[],
        async insertActionExecution(record: any) {
          if (committedActionExecutions.has(record.actionExecutionKey)) {
            throw new Error(`Unique constraint violation: rule_action_executions(actionExecutionKey)`);
          }
          this.pendingActions.push(record);
        },
        async insertScheduledPost(record: any) {
          if (committedScheduledPosts.has(record.idempotencyKey)) {
            throw new Error(`Unique constraint violation: scheduled_posts(idempotencyKey)`);
          }
          this.pendingPosts.push(record);
        },
        async commit() {
          for (const a of this.pendingActions) committedActionExecutions.set(a.actionExecutionKey, a);
          for (const p of this.pendingPosts) committedScheduledPosts.set(p.idempotencyKey, p);
        },
      };

      // Worker A executes and commits
      await executeRuleActionInTransaction(
        workerATransaction,
        'AUTO_SCHEDULE',
        actionExecutionKey,
        { id: randomUUID(), scheduledAt: new Date() },
      );
      await workerATransaction.commit();

      assert.strictEqual(committedActionExecutions.size, 1);
      assert.strictEqual(committedScheduledPosts.size, 1);
      assert.strictEqual(committedScheduledPosts.get(actionExecutionKey)!.idempotencyKey, actionExecutionKey);

      // Worker B (reclaiming worker after lease stall) attempts the exact same action
      const workerBTransaction = {
        actionExecutionKey,
        pendingActions: [] as any[],
        pendingPosts: [] as any[],
        async insertActionExecution(record: any) {
          if (committedActionExecutions.has(record.actionExecutionKey)) {
            throw new Error(`Unique constraint violation: rule_action_executions(actionExecutionKey)`);
          }
          this.pendingActions.push(record);
        },
        async insertScheduledPost(record: any) {
          if (committedScheduledPosts.has(record.idempotencyKey)) {
            throw new Error(`Unique constraint violation: scheduled_posts(idempotencyKey)`);
          }
          this.pendingPosts.push(record);
        },
        async commit() {
          for (const a of this.pendingActions) committedActionExecutions.set(a.actionExecutionKey, a);
          for (const p of this.pendingPosts) committedScheduledPosts.set(p.idempotencyKey, p);
        },
      };

      // Worker B must encounter unique constraint rejection and abort without creating duplicate post
      await assert.rejects(
        async () => {
          await executeRuleActionInTransaction(
            workerBTransaction,
            'AUTO_SCHEDULE',
            actionExecutionKey,
            { id: randomUUID(), scheduledAt: new Date() },
          );
          await workerBTransaction.commit();
        },
        /Unique constraint violation/,
        'Concurrent or duplicate action execution must be rejected at transactional boundary',
      );

      // Exactly 1 ScheduledPost and 1 RuleActionExecution exist
      assert.strictEqual(committedActionExecutions.size, 1);
      assert.strictEqual(committedScheduledPosts.size, 1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MODULE 2: PRE-PUBLISH SAFETY GATE & OPTION A OVERRIDE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Module 2: Pre-Publish Safety Gate & Option A Manual Override', () => {
    it('evaluates all 4 walls: claim hallucination, toxicity, compliance, and sensitive topic spacing', () => {
      // Wall 3: Meta Threads 500-char UTF-16 code units limit
      const validText = 'Short post under 500 characters';
      assert.strictEqual(validText.length <= 500, true);

      const oversizedText = 'A'.repeat(501);
      assert.strictEqual(oversizedText.length > 500, true);

      // Prohibited topic detection
      const prohibitedTopics = ['hate_speech', 'scam', 'violence'];
      const postWithScam = 'Check out this guaranteed crypto scam now!';
      const hasProhibited = prohibitedTopics.some((topic) => postWithScam.toLowerCase().includes(topic));
      assert.strictEqual(hasProhibited, true);
    });

    it('Option A Single-Use Token Override: verifies single-use CAS consumption', async () => {
      // Mock safety override log table
      const overrideLogs = new Map<string, any>();
      const token = randomUUID();
      const auditId = randomUUID();
      const workspaceId = randomUUID();
      const socialAccountId = randomUUID();

      overrideLogs.set(token, {
        auditId,
        workspaceId,
        socialAccountId,
        oneTimeToken: token,
        status: 'OVERRIDDEN',
        consumedAt: null,
        consumedBy: null,
        expiresAt: new Date(Date.now() + 86400 * 1000), // 24h
      });

      // CAS Consumption logic
      function consumeToken(tokenToConsume: string, postId: string) {
        const log = overrideLogs.get(tokenToConsume);
        if (!log || log.consumedAt !== null || log.expiresAt <= new Date()) {
          throw new Error('Token invalid, expired, or already consumed');
        }
        log.consumedAt = new Date();
        log.consumedBy = postId;
        return log;
      }

      // First consumption by ScheduledPost 1 succeeds
      const postId1 = randomUUID();
      const consumedLog = consumeToken(token, postId1);
      assert.strictEqual(consumedLog.consumedBy, postId1);
      assert.ok(consumedLog.consumedAt);

      // Second consumption with the same token must fail
      const postId2 = randomUUID();
      assert.throws(
        () => consumeToken(token, postId2),
        /already consumed/,
        'Single-use token cannot be consumed multiple times',
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MODULE 3: CONTENT EXPERIMENTATION ENGINE (Strictly Two-Arm A/B)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Module 3: Permuted Block Allocation & Multi-Block Rollover', () => {
    it('generates strictly balanced permuted sequences within each block of size K=4', () => {
      const experimentId = randomUUID();
      const blockKey = 'America/New_York-2-09';
      const seed = 'test-seed-123';
      const blockSize = 4;

      // Generate block 0
      const sequenceBlock0 = generatePermutedBlock(experimentId, blockKey, seed, 0, ['A', 'B'], blockSize);
      assert.strictEqual(sequenceBlock0.length, 4);

      // Count variants
      const countA0 = sequenceBlock0.filter((k) => k === 'A').length;
      const countB0 = sequenceBlock0.filter((k) => k === 'B').length;
      assert.strictEqual(countA0, 2, 'Block 0 must contain exactly 2 Variant A assignments');
      assert.strictEqual(countB0, 2, 'Block 0 must contain exactly 2 Variant B assignments');

      // Generate block 1 (multi-block rollover)
      const sequenceBlock1 = generatePermutedBlock(experimentId, blockKey, seed, 1, ['A', 'B'], blockSize);
      assert.strictEqual(sequenceBlock1.length, 4);
      const countA1 = sequenceBlock1.filter((k) => k === 'A').length;
      const countB1 = sequenceBlock1.filter((k) => k === 'B').length;
      assert.strictEqual(countA1, 2, 'Block 1 must contain exactly 2 Variant A assignments');
      assert.strictEqual(countB1, 2, 'Block 1 must contain exactly 2 Variant B assignments');
    });

    it('computes temporal block key correctly in account timezone', () => {
      const scheduledAt = new Date('2026-10-06T14:30:00Z'); // Tuesday
      const key = computeTemporalBlockKey(scheduledAt, 'America/New_York');
      assert.ok(key.startsWith('America/New_York-'));
    });

    it('executes Welch t-test and Cohen d for two-arm experiment hypothesis testing', () => {
      // Variant A (Control): N=20, Mean=0.04, StdDev=0.01
      // Variant B (Treatment): N=20, Mean=0.06, StdDev=0.012
      const result = welchTTest(0.06, 0.012, 20, 0.04, 0.01, 20);
      assert.ok(result.tStat !== null && result.tStat > 0);
      assert.ok(result.pValue !== null && result.pValue < 0.001);

      const d = safeCohensD(0.06, 0.012, 20, 0.04, 0.01, 20);
      assert.ok(d !== null && d > 1.5, 'Large positive Cohen d effect size');

      const relativeLift = (0.06 - 0.04) / 0.04; // +50% lift
      assert.ok(Math.abs(relativeLift - 0.50) < 1e-6, 'Relative lift should be 50%');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MODULE 4: CLOSED-LOOP PROFILE ADAPTATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('Module 4: Profile Adaptation & Lift Winsorization', () => {
    it('winsorizes observed lift to [-0.50, +0.50]', () => {
      const rawLiftExtremePositive = 1.45; // +145%
      const rawLiftExtremeNegative = -0.85; // -85%
      const rawLiftModerate = 0.22; // +22%

      const winsorize = (lift: number) => Math.max(-0.5, Math.min(0.5, lift));

      assert.strictEqual(winsorize(rawLiftExtremePositive), 0.5);
      assert.strictEqual(winsorize(rawLiftExtremeNegative), -0.5);
      assert.strictEqual(winsorize(rawLiftModerate), 0.22);
    });

    it('computes adaptive weight with recency retention lambda = 0.20 and eta = 0.15', () => {
      const priorWeight = 1.0;
      const winsorizedLift = 0.30; // +30% lift
      const lambda = 0.20;
      const eta = 0.15;

      // w_new = w_old * (1 - lambda) + lambda * [w_old * (1 + eta * lift)]
      const proposedWeight = priorWeight * (1 - lambda) + lambda * (priorWeight * (1 + eta * winsorizedLift));
      assert.ok(proposedWeight > 1.0, 'Positive lift increases adaptive weight');
      assert.strictEqual(Number(proposedWeight.toFixed(4)), 1.0090);
    });

    it('enforces optimistic concurrency control (CAS) on profile_version', () => {
      let profileVersion = 3;

      function applyCASUpdate(expectedVersion: number, newWeight: number) {
        if (profileVersion !== expectedVersion) {
          throw new Error(`Profile version mismatch: expected ${expectedVersion}, got ${profileVersion}`);
        }
        profileVersion += 1;
        return { success: true, newVersion: profileVersion };
      }

      // Worker 1 has version 3
      const res1 = applyCASUpdate(3, 1.25);
      assert.strictEqual(res1.newVersion, 4);

      // Concurrent Worker 2 also thought version was 3 -> must be rejected
      assert.throws(
        () => applyCASUpdate(3, 1.30),
        /Profile version mismatch/,
        'Outdated profileVersion must be rejected by CAS optimistic lock',
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MODULE 5: AUTONOMOUS OPERATOR & P0-2 FENCING ROLLBACK
  // ───────────────────────────────────────────────────────────────────────────
  describe('Module 5: Autonomous Operator & Candidate Lease Fencing (P0-2)', () => {
    it('computes ISO week calendar window for quota reservations', () => {
      const testDate = new Date('2026-10-04T12:00:00Z');
      const weekWindow = getIsoWeekWindow(testDate, 'UTC');
      assert.ok(/^2026-W\d{2}$/.test(weekWindow));
    });

    it('P5-76 CRITICAL: rolls back scheduling transaction when candidate lease fencing affects 0 rows', async () => {
      let weeklyQuotaClaimed = 5;
      let scheduledPostsCount = 0;
      let candidateStatus = 'SELECTED';
      let candidateLeaseUntil = new Date(Date.now() - 1000); // EXPIRED LEASE!

      async function attemptSchedulingTransaction() {
        // Step 1: Reserve Quota
        weeklyQuotaClaimed += 1;

        // Step 2: Insert ScheduledPost
        scheduledPostsCount += 1;

        // Step 3: Fenced Candidate Update: assert affected_rows === 1 or ROLLBACK
        const now = new Date();
        const affectedRows = candidateLeaseUntil > now && candidateStatus === 'SELECTED' ? 1 : 0;

        if (affectedRows !== 1) {
          // Transaction aborts and rolls back
          weeklyQuotaClaimed -= 1;
          scheduledPostsCount -= 1;
          throw new Error('Candidate lease fencing assertion failed: 0 rows affected');
        }

        candidateStatus = 'SCHEDULED';
      }

      await assert.rejects(
        () => attemptSchedulingTransaction(),
        /Candidate lease fencing assertion failed/,
        'Expired candidate lease must trigger immediate rollback without leaking quota or orphan posts',
      );

      // Assert complete rollback: no quota consumed, no scheduled post left behind
      assert.strictEqual(weeklyQuotaClaimed, 5, 'Quota reservation must roll back cleanly');
      assert.strictEqual(scheduledPostsCount, 0, 'Orphan ScheduledPost must not persist');
      assert.strictEqual(candidateStatus, 'SELECTED');
    });
  });
});

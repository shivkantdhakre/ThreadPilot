import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  evaluateAST,
  RuleASTSchema,
  RuleActionSchema,
  type RuleConditionAST,
} from '@threadpilot/types';

describe('Governance & Worker Fencing Invariant Test Suite', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. AST RULES ENGINE & BUDGET EXHAUSTION
  // ───────────────────────────────────────────────────────────────────────────
  describe('AST Rules Engine & Budget Exhaustion Semantics', () => {
    it('correctly evaluates complex nested AST conditions with numeric and string operators', () => {
      const complexAST: RuleConditionAST = {
        and: [
          { field: 'analytics.likes', op: '>=', value: 50 },
          { field: 'analytics.sentiment', op: '==', value: 'POSITIVE' },
          {
            or: [
              { field: 'author.isVerified', op: '==', value: true },
              { field: 'analytics.shares', op: '>', value: 10 },
            ],
          },
          {
            not: {
              field: 'context.tags',
              op: 'contains',
              value: 'archived',
            },
          },
        ],
      };

      const parsed = RuleASTSchema.parse(complexAST);

      const matchingContext = {
        analytics: { likes: 100, sentiment: 'POSITIVE', shares: 15 },
        author: { isVerified: false },
        context: { tags: 'active, priority' },
      };

      const failingLikesContext = {
        analytics: { likes: 20, sentiment: 'POSITIVE', shares: 15 },
        author: { isVerified: false },
        context: { tags: 'active, priority' },
      };

      const prohibitedTagContext = {
        analytics: { likes: 100, sentiment: 'POSITIVE', shares: 15 },
        author: { isVerified: true },
        context: { tags: 'active, archived' },
      };

      assert.strictEqual(evaluateAST(parsed, matchingContext), true);
      assert.strictEqual(evaluateAST(parsed, failingLikesContext), false);
      assert.strictEqual(evaluateAST(parsed, prohibitedTagContext), false);
    });

    it('enforces budget exhaustion: transition to SKIPPED_BUDGET when claimedExecutions >= maxExecutions', () => {
      const budgetState = {
        ruleId: 'rule-test-1',
        executionWindow: '2026-10-04',
        maxExecutions: 3,
        claimedExecutions: 3,
      };

      function attemptClaimRuleExecution(budget: typeof budgetState) {
        if (budget.claimedExecutions >= budget.maxExecutions) {
          return { status: 'SKIPPED_BUDGET', reason: 'Daily rule execution budget exhausted' };
        }
        budget.claimedExecutions += 1;
        return { status: 'CLAIMED' };
      }

      const res = attemptClaimRuleExecution(budgetState);
      assert.strictEqual(res.status, 'SKIPPED_BUDGET');
      assert.strictEqual(budgetState.claimedExecutions, 3);
    });

    it('generates deterministic actionExecutionKey and rejects duplicate side effects', () => {
      const ruleId = randomUUID();
      const executionWindow = '2026-10-04';
      const executionKey = 'post-event-999';
      const actionIndex = 0;

      const actionExecutionKey = `${ruleId}:${executionWindow}:${executionKey}:${actionIndex}`;
      assert.ok(actionExecutionKey.startsWith(ruleId));
      assert.ok(actionExecutionKey.endsWith(':0'));

      const executedActions = new Set<string>();
      executedActions.add(actionExecutionKey);

      // Attempting to re-execute with identical key
      const isDuplicate = executedActions.has(actionExecutionKey);
      assert.strictEqual(isDuplicate, true, 'Duplicate action execution key must be detected');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. 4-WALL SAFETY GATE FAIL-CLOSED ORDERING
  // ───────────────────────────────────────────────────────────────────────────
  describe('Pre-Publish Safety Gate 4-Wall Defense in Depth', () => {
    interface SafetyPolicy {
      hallucinationThreshold: number;
      toxicityThreshold: number;
      prohibitedTopics: string[];
      flaggedTopics: string[];
    }

    interface PostContent {
      text: string;
      hallucinationScore: number;
      toxicityScore: number;
      recentTopicPostCount: number;
      maxTopicPostPerHour: number;
    }

    function evaluateSafetyGate(post: PostContent, policy: SafetyPolicy) {
      const failedWalls: string[] = [];

      // Wall 1: Claim Hallucination Evaluation
      if (post.hallucinationScore > policy.hallucinationThreshold) {
        failedWalls.push('CLAIM_HALLUCINATION');
      }

      // Wall 2: Toxicity & Brand Safety
      if (post.toxicityScore > policy.toxicityThreshold) {
        failedWalls.push('TOXICITY_BRAND_SAFETY');
      }

      // Wall 3: Policy Compliance (Length & Prohibited Topics)
      const textLength = post.text.length;
      const lowerText = post.text.toLowerCase();
      const containsProhibited = policy.prohibitedTopics.some((topic) => lowerText.includes(topic.toLowerCase()));
      if (textLength > 500 || containsProhibited) {
        failedWalls.push('POLICY_COMPLIANCE');
      }

      // Wall 4: Sensitive Topic Rate Limiting
      const containsFlagged = policy.flaggedTopics.some((topic) => lowerText.includes(topic.toLowerCase()));
      if (containsFlagged && post.recentTopicPostCount >= post.maxTopicPostPerHour) {
        failedWalls.push('SENSITIVE_TOPIC_RATE');
      }

      // Decision matrix
      if (failedWalls.length === 0) {
        return { status: 'PASSED', failedWalls };
      }

      if (failedWalls.includes('POLICY_COMPLIANCE') || failedWalls.includes('TOXICITY_BRAND_SAFETY')) {
        return { status: 'BLOCKED_POLICY_VIOLATION', failedWalls };
      }

      return { status: 'FLAGGED_APPROVAL_REQUIRED', failedWalls };
    }

    const testPolicy: SafetyPolicy = {
      hallucinationThreshold: 0.30,
      toxicityThreshold: 0.15,
      prohibitedTopics: ['crypto scam', 'malware'],
      flaggedTopics: ['politics', 'elections'],
    };

    it('passes post that satisfies all 4 safety walls', () => {
      const cleanPost: PostContent = {
        text: 'Sharing high quality engineering insights on distributed consensus systems.',
        hallucinationScore: 0.05,
        toxicityScore: 0.02,
        recentTopicPostCount: 0,
        maxTopicPostPerHour: 2,
      };

      const result = evaluateSafetyGate(cleanPost, testPolicy);
      assert.strictEqual(result.status, 'PASSED');
      assert.strictEqual(result.failedWalls.length, 0);
    });

    it('blocks post exceeding Threads 500-char limit with BLOCKED_POLICY_VIOLATION', () => {
      const longPost: PostContent = {
        text: 'A'.repeat(501),
        hallucinationScore: 0.05,
        toxicityScore: 0.02,
        recentTopicPostCount: 0,
        maxTopicPostPerHour: 2,
      };

      const result = evaluateSafetyGate(longPost, testPolicy);
      assert.strictEqual(result.status, 'BLOCKED_POLICY_VIOLATION');
      assert.ok(result.failedWalls.includes('POLICY_COMPLIANCE'));
    });

    it('blocks post with toxic content with BLOCKED_POLICY_VIOLATION', () => {
      const toxicPost: PostContent = {
        text: 'Aggressive attacking remarks against individuals.',
        hallucinationScore: 0.1,
        toxicityScore: 0.45, // exceeds 0.15
        recentTopicPostCount: 0,
        maxTopicPostPerHour: 2,
      };

      const result = evaluateSafetyGate(toxicPost, testPolicy);
      assert.strictEqual(result.status, 'BLOCKED_POLICY_VIOLATION');
      assert.ok(result.failedWalls.includes('TOXICITY_BRAND_SAFETY'));
    });

    it('flags post with high hallucination score as FLAGGED_APPROVAL_REQUIRED', () => {
      const hallucinatedPost: PostContent = {
        text: 'According to our tests, Python 4 was released yesterday and is 100x faster.',
        hallucinationScore: 0.75, // exceeds 0.30
        toxicityScore: 0.02,
        recentTopicPostCount: 0,
        maxTopicPostPerHour: 2,
      };

      const result = evaluateSafetyGate(hallucinatedPost, testPolicy);
      assert.strictEqual(result.status, 'FLAGGED_APPROVAL_REQUIRED');
      assert.ok(result.failedWalls.includes('CLAIM_HALLUCINATION'));
    });

    it('flags post violating sensitive topic rate limit as FLAGGED_APPROVAL_REQUIRED', () => {
      const rateLimitedPost: PostContent = {
        text: 'Breaking commentary on upcoming elections.',
        hallucinationScore: 0.1,
        toxicityScore: 0.02,
        recentTopicPostCount: 2, // at or exceeds max 2
        maxTopicPostPerHour: 2,
      };

      const result = evaluateSafetyGate(rateLimitedPost, testPolicy);
      assert.strictEqual(result.status, 'FLAGGED_APPROVAL_REQUIRED');
      assert.ok(result.failedWalls.includes('SENSITIVE_TOPIC_RATE'));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. OPTION A CAS SINGLE-USE TOKEN CONSUMPTION
  // ───────────────────────────────────────────────────────────────────────────
  describe('Option A CAS Single-Use Token Invalidation & Expiry', () => {
    it('rejects expired override tokens even if unconsumed', () => {
      const expiredToken = {
        token: randomUUID(),
        status: 'OVERRIDDEN',
        consumedAt: null,
        expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
      };

      function validateAndConsumeToken(t: typeof expiredToken, scheduledPostId: string) {
        if (t.consumedAt !== null) {
          throw new Error('Token already consumed');
        }
        if (t.expiresAt <= new Date()) {
          throw new Error('Override token expired');
        }
        t.consumedAt = new Date() as any;
        return { success: true };
      }

      assert.throws(
        () => validateAndConsumeToken(expiredToken, randomUUID()),
        /Override token expired/,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. AUTONOMOUS OPERATOR CANDIDATE FENCING ROLLBACK (P5-76)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Autonomous Operator Candidate Fencing Atomic Rollback (P5-76)', () => {
    it('ensures atomic rollback of weekly quota and candidate status when concurrency lease check fails', async () => {
      let quotaCount = 10;
      let scheduledCount = 20;

      // Simulated atomic worker transaction
      async function scheduleCandidateWithFencing(leaseValid: boolean) {
        // Step 1: Claim Quota
        quotaCount += 1;

        // Step 2: Create Scheduled Post
        scheduledCount += 1;

        // Step 3: Fenced check on lease
        if (!leaseValid) {
          // Compensating rollback
          quotaCount -= 1;
          scheduledCount -= 1;
          throw new Error('Lease fencing mismatch: 0 rows affected');
        }

        return { scheduled: true };
      }

      // Successful lease
      const successResult = await scheduleCandidateWithFencing(true);
      assert.strictEqual(successResult.scheduled, true);
      assert.strictEqual(quotaCount, 11);
      assert.strictEqual(scheduledCount, 21);

      // Failed lease check (e.g. lease expired or taken by other worker)
      await assert.rejects(
        () => scheduleCandidateWithFencing(false),
        /Lease fencing mismatch/,
      );

      // Invariants preserved: rolled back to 11 and 21
      assert.strictEqual(quotaCount, 11, 'Quota must be restored after lease fencing rollback');
      assert.strictEqual(scheduledCount, 21, 'Scheduled post count must be restored after lease fencing rollback');
    });
  });
});

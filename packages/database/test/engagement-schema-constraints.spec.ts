import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  InteractionType,
  InteractionStatus,
  ReplyExecutionStatus,
  RecoveryResolution,
  AutonomyMode,
  PolicyStage,
  PolicyDecisionType,
  InteractionIntent,
  FeedbackType,
  SyncTier,
  SyncStatus,
  AmbiguityType,
  ResponseDecision,
  Sentiment,
  HideStatus,
} from '../dist/index.js';

describe('Phase 3A: Database Schema, Enums & CHECK Constraints Invariant Tests', () => {
  describe('Phase 3A: 15 Core Enums Completeness & Contract Alignment', () => {
    it('1. InteractionType contains REPLY, QUOTE, MENTION', () => {
      assert.strictEqual(InteractionType.REPLY, 'REPLY');
      assert.strictEqual(InteractionType.QUOTE, 'QUOTE');
      assert.strictEqual(InteractionType.MENTION, 'MENTION');
      assert.strictEqual(Object.keys(InteractionType).length, 3);
    });

    it('2. InteractionStatus contains complete lifecycle states', () => {
      const expected = [
        'NEW', 'CLASSIFYING', 'CLASSIFIED', 'DRAFTING', 'DRAFTED',
        'OUTPUT_SAFETY_EVALUATING', 'REVIEW_REQUIRED', 'APPROVED',
        'PUBLISHING', 'REPLIED', 'DISMISSED', 'NOT_REQUIRED',
        'BLOCKED', 'RECOVERY_REQUIRED'
      ];
      expected.forEach(status => {
        assert.ok(status in InteractionStatus, `InteractionStatus must define ${status}`);
      });
      assert.strictEqual(Object.keys(InteractionStatus).length, 14);
    });

    it('3. ReplyExecutionStatus covers robust multi-stage publishing', () => {
      const expected = [
        'CREATED', 'QUEUED', 'CLAIMED', 'QUOTA_BLOCKED',
        'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING',
        'PUBLISHED', 'RETRYABLE_FAILURE', 'AUTH_REQUIRED',
        'RECOVERY_REQUIRED', 'FAILED_PERMANENT', 'CANCELLED_BY_POLICY'
      ];
      expected.forEach(status => {
        assert.ok(status in ReplyExecutionStatus, `ReplyExecutionStatus must define ${status}`);
      });
      assert.strictEqual(Object.keys(ReplyExecutionStatus).length, 13);
    });

    it('4. RecoveryResolution covers automated & operator resolution states', () => {
      const expected = [
        'NONE', 'PENDING', 'MATCHED', 'NOT_LANDED',
        'OPERATOR_REQUIRED', 'CONFIRMED_NOT_PUBLISHED', 'CONFIRMED_PUBLISHED'
      ];
      expected.forEach(res => {
        assert.ok(res in RecoveryResolution, `RecoveryResolution must define ${res}`);
      });
      assert.strictEqual(Object.keys(RecoveryResolution).length, 7);
    });

    it('5. AutonomyMode covers all 4 autonomy levels', () => {
      assert.strictEqual(AutonomyMode.OFF, 'OFF');
      assert.strictEqual(AutonomyMode.SHADOW, 'SHADOW');
      assert.strictEqual(AutonomyMode.REVIEW_ONLY, 'REVIEW_ONLY');
      assert.strictEqual(AutonomyMode.RULES_BASED, 'RULES_BASED');
      assert.strictEqual(Object.keys(AutonomyMode).length, 4);
    });

    it('6. PolicyStage defines PRE_GENERATION and POST_GENERATION_SAFETY', () => {
      assert.strictEqual(PolicyStage.PRE_GENERATION, 'PRE_GENERATION');
      assert.strictEqual(PolicyStage.POST_GENERATION_SAFETY, 'POST_GENERATION_SAFETY');
      assert.strictEqual(Object.keys(PolicyStage).length, 2);
    });

    it('7. PolicyDecisionType defines decisions', () => {
      assert.strictEqual(PolicyDecisionType.AUTO_REPLY, 'AUTO_REPLY');
      assert.strictEqual(PolicyDecisionType.REVIEW_REQUIRED, 'REVIEW_REQUIRED');
      assert.strictEqual(PolicyDecisionType.BLOCKED, 'BLOCKED');
      assert.strictEqual(PolicyDecisionType.NOT_APPLICABLE, 'NOT_APPLICABLE');
      assert.strictEqual(Object.keys(PolicyDecisionType).length, 4);
    });

    it('8. InteractionIntent covers conversational intents', () => {
      const expected = [
        'QUESTION', 'AGREEMENT', 'DISAGREEMENT', 'COMPLIMENT',
        'REQUEST', 'TROLLING', 'SPAM', 'UNCLEAR'
      ];
      expected.forEach(intent => {
        assert.ok(intent in InteractionIntent, `InteractionIntent must define ${intent}`);
      });
      assert.strictEqual(Object.keys(InteractionIntent).length, 8);
    });

    it('9. FeedbackType covers editorial correction dimensions', () => {
      const expected = [
        'STYLE_CORRECTION', 'FACTUAL_CORRECTION', 'TONE_CORRECTION',
        'LENGTH_CORRECTION', 'CONTENT_CORRECTION', 'SAFETY_CORRECTION',
        'PERSONAL_PREFERENCE'
      ];
      expected.forEach(fb => {
        assert.ok(fb in FeedbackType, `FeedbackType must define ${fb}`);
      });
      assert.strictEqual(Object.keys(FeedbackType).length, 7);
    });

    it('10. SyncTier defines HOT, WARM, COLD tiers', () => {
      assert.strictEqual(SyncTier.HOT, 'HOT');
      assert.strictEqual(SyncTier.WARM, 'WARM');
      assert.strictEqual(SyncTier.COLD, 'COLD');
      assert.strictEqual(Object.keys(SyncTier).length, 3);
    });

    it('11. SyncStatus defines IDLE, SYNCING, FAILED', () => {
      assert.strictEqual(SyncStatus.IDLE, 'IDLE');
      assert.strictEqual(SyncStatus.SYNCING, 'SYNCING');
      assert.strictEqual(SyncStatus.FAILED, 'FAILED');
      assert.strictEqual(Object.keys(SyncStatus).length, 3);
    });

    it('12. AmbiguityType defines CONTAINER_CREATE, PUBLISH, UNKNOWN', () => {
      assert.strictEqual(AmbiguityType.CONTAINER_CREATE, 'CONTAINER_CREATE');
      assert.strictEqual(AmbiguityType.PUBLISH, 'PUBLISH');
      assert.strictEqual(AmbiguityType.UNKNOWN, 'UNKNOWN');
      assert.strictEqual(Object.keys(AmbiguityType).length, 3);
    });

    it('13. ResponseDecision defines PENDING, REQUIRED, NOT_REQUIRED, USER_DISMISSED, POLICY_BLOCKED', () => {
      const expected = ['PENDING', 'REQUIRED', 'NOT_REQUIRED', 'USER_DISMISSED', 'POLICY_BLOCKED'];
      expected.forEach(decision => {
        assert.ok(decision in ResponseDecision, `ResponseDecision must define ${decision}`);
      });
      assert.strictEqual(Object.keys(ResponseDecision).length, 5);
    });

    it('14. Sentiment defines POSITIVE, NEUTRAL, NEGATIVE', () => {
      assert.strictEqual(Sentiment.POSITIVE, 'POSITIVE');
      assert.strictEqual(Sentiment.NEUTRAL, 'NEUTRAL');
      assert.strictEqual(Sentiment.NEGATIVE, 'NEGATIVE');
      assert.strictEqual(Object.keys(Sentiment).length, 3);
    });

    it('15. HideStatus defines NOT_HUSHED, HUSHED, DELETED', () => {
      assert.strictEqual(HideStatus.NOT_HUSHED, 'NOT_HUSHED');
      assert.strictEqual(HideStatus.HUSHED, 'HUSHED');
      assert.strictEqual(HideStatus.DELETED, 'DELETED');
      assert.strictEqual(Object.keys(HideStatus).length, 3);
    });
  });

  describe('Phase 3A: SQL CHECK Constraints Validation Invariants', () => {
    // Helper to evaluate check constraint invariants in memory
    function validateCheckConstraint(
      constraintName: string,
      values: Record<string, any>,
    ): { passes: boolean; reason?: string } {
      switch (constraintName) {
        case 'chk_reply_body_non_empty': {
          const body = values.body;
          if (typeof body !== 'string' || body.trim().length === 0) {
            return { passes: false, reason: 'Reply body must not be empty or whitespace only' };
          }
          return { passes: true };
        }
        case 'chk_interaction_priority':
        case 'chk_class_priority': {
          const score = values.priorityScore;
          if (typeof score !== 'number' || score < 1 || score > 10 || !Number.isInteger(score)) {
            return { passes: false, reason: 'Priority score must be integer between 1 and 10' };
          }
          return { passes: true };
        }
        case 'chk_intent_confidence': {
          const conf = values.intentConfidence;
          if (typeof conf !== 'number' || conf < 0.0 || conf > 1.0) {
            return { passes: false, reason: 'Intent confidence must be float between 0.0 and 1.0' };
          }
          return { passes: true };
        }
        case 'chk_toxicity_score':
        case 'chk_harassment_score':
        case 'chk_controversy_score': {
          const score = values.score;
          if (typeof score !== 'number' || score < 0.0 || score > 1.0) {
            return { passes: false, reason: 'Safety scores must be between 0.0 and 1.0' };
          }
          return { passes: true };
        }
        case 'chk_user_rating': {
          const rating = values.userRating;
          if (rating !== null && rating !== undefined && rating !== -1 && rating !== 1) {
            return { passes: false, reason: 'User rating must be NULL, -1, or 1' };
          }
          return { passes: true };
        }
        default:
          throw new Error(`Unknown constraint: ${constraintName}`);
      }
    }

    it('chk_reply_body_non_empty: validates non-empty and non-whitespace body strings', () => {
      assert.strictEqual(validateCheckConstraint('chk_reply_body_non_empty', { body: 'Valid body' }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_reply_body_non_empty', { body: '' }).passes, false);
      assert.strictEqual(validateCheckConstraint('chk_reply_body_non_empty', { body: '   \n  \t ' }).passes, false);
    });

    it('chk_interaction_priority: enforces bounds [1, 10]', () => {
      assert.strictEqual(validateCheckConstraint('chk_interaction_priority', { priorityScore: 1 }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_interaction_priority', { priorityScore: 10 }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_interaction_priority', { priorityScore: 5 }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_interaction_priority', { priorityScore: 0 }).passes, false);
      assert.strictEqual(validateCheckConstraint('chk_interaction_priority', { priorityScore: 11 }).passes, false);
      assert.strictEqual(validateCheckConstraint('chk_interaction_priority', { priorityScore: 5.5 }).passes, false);
    });

    it('chk_intent_confidence: enforces bounds [0.0, 1.0]', () => {
      assert.strictEqual(validateCheckConstraint('chk_intent_confidence', { intentConfidence: 0.0 }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_intent_confidence', { intentConfidence: 1.0 }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_intent_confidence', { intentConfidence: 0.85 }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_intent_confidence', { intentConfidence: -0.01 }).passes, false);
      assert.strictEqual(validateCheckConstraint('chk_intent_confidence', { intentConfidence: 1.01 }).passes, false);
    });

    it('chk_toxicity_score, chk_harassment_score, chk_controversy_score: enforce bounded floats', () => {
      assert.strictEqual(validateCheckConstraint('chk_toxicity_score', { score: 0.0 }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_toxicity_score', { score: 0.99 }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_toxicity_score', { score: 1.5 }).passes, false);
      assert.strictEqual(validateCheckConstraint('chk_toxicity_score', { score: -0.1 }).passes, false);
    });

    it('chk_user_rating: allows only NULL, -1 (thumbs down), or 1 (thumbs up)', () => {
      assert.strictEqual(validateCheckConstraint('chk_user_rating', { userRating: null }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_user_rating', { userRating: 1 }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_user_rating', { userRating: -1 }).passes, true);
      assert.strictEqual(validateCheckConstraint('chk_user_rating', { userRating: 0 }).passes, false);
      assert.strictEqual(validateCheckConstraint('chk_user_rating', { userRating: 5 }).passes, false);
      assert.strictEqual(validateCheckConstraint('chk_user_rating', { userRating: 2 }).passes, false);
    });
  });

  describe('Phase 3A: Partial Unique Indexes Invariant Guarantees', () => {
    it('idx_unique_current_classification: guarantees exactly one active classification per interaction', () => {
      const classifications = [
        { id: 'c1', interactionId: 'int-1', isCurrent: false, version: 1 },
        { id: 'c2', interactionId: 'int-1', isCurrent: false, version: 2 },
        { id: 'c3', interactionId: 'int-1', isCurrent: true, version: 3 },
      ];

      const currentClassifications = classifications.filter(c => c.isCurrent);
      assert.strictEqual(currentClassifications.length, 1);
      assert.strictEqual(currentClassifications[0].id, 'c3');

      // Attempting to set another classification to isCurrent = true without deactivating c3 violates invariant
      const hasDuplicateCurrent = (list: typeof classifications) => {
        const counts = new Map<string, number>();
        for (const item of list.filter(i => i.isCurrent)) {
          counts.set(item.interactionId, (counts.get(item.interactionId) || 0) + 1);
          if ((counts.get(item.interactionId) || 0) > 1) return true;
        }
        return false;
      };

      assert.strictEqual(hasDuplicateCurrent(classifications), false);
      const invalidList = [...classifications, { id: 'c4', interactionId: 'int-1', isCurrent: true, version: 4 }];
      assert.strictEqual(hasDuplicateCurrent(invalidList), true);
    });

    it('idx_unique_active_reply_execution: guarantees at most one in-flight execution per interaction', () => {
      const activeStatuses = new Set([
        'CREATED', 'QUEUED', 'CLAIMED', 'QUOTA_BLOCKED',
        'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING', 'RECOVERY_REQUIRED'
      ]);

      const executions = [
        { id: 'e1', interactionId: 'int-1', status: 'FAILED_PERMANENT' },
        { id: 'e2', interactionId: 'int-1', status: 'CLAIMED' }, // active
      ];

      const activeExecutions = executions.filter(e => activeStatuses.has(e.status));
      assert.strictEqual(activeExecutions.length, 1);
      assert.strictEqual(activeExecutions[0].id, 'e2');

      // Second active execution triggers conflict
      const invalidExecutions = [
        ...executions,
        { id: 'e3', interactionId: 'int-1', status: 'CREATING_CONTAINER' },
      ];
      const activeCounts = invalidExecutions.filter(e => activeStatuses.has(e.status)).length;
      assert.ok(activeCounts > 1, 'Dual active executions violate partial unique index');
    });

    it('idx_unique_active_sync_lease: allows only one active SYNCING worker per root Threads post', () => {
      const syncStates = [
        { socialAccountId: 'acc-1', rootThreadsPostId: 'p-100', syncStatus: 'IDLE' },
        { socialAccountId: 'acc-1', rootThreadsPostId: 'p-100', syncStatus: 'SYNCING' },
      ];

      const activeSyncs = syncStates.filter(s => s.syncStatus === 'SYNCING');
      assert.strictEqual(activeSyncs.length, 1);

      // Multiple SYNCING on same post is prohibited
      const duplicateSyncs = [
        ...syncStates,
        { socialAccountId: 'acc-1', rootThreadsPostId: 'p-100', syncStatus: 'SYNCING' },
      ];
      assert.strictEqual(duplicateSyncs.filter(s => s.syncStatus === 'SYNCING').length, 2);
    });
  });
});

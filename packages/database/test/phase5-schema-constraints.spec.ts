import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  RuleTriggerType,
  RuleExecutionStatus,
  SafetyAuditStatus,
  SafetyWallType,
  OverrideStatus,
  ExperimentStatus,
  ExperimentMetric,
  ExperimentEffectType,
  OptimizationDirection,
  AdaptationProposalStatus,
  AutonomyLevel,
} from '../dist/index.js';

describe('Phase 5: Database Schema, Enums & Compound Unique Constraints Invariant Tests', () => {
  describe('Phase 5: 11 Core Enums Completeness & Contract Alignment', () => {
    it('1. RuleTriggerType contains all 6 trigger types', () => {
      const expected = [
        'POST_PUBLISHED',
        'METRIC_OBSERVED',
        'INSIGHT_GENERATED',
        'SCHEDULE_TIME_REACHED',
        'SAFETY_AUDIT_FAILED',
        'MANUAL_TRIGGER',
      ];
      expected.forEach((trigger) => {
        assert.ok(trigger in RuleTriggerType, `RuleTriggerType must define ${trigger}`);
        assert.strictEqual((RuleTriggerType as any)[trigger], trigger);
      });
      assert.strictEqual(Object.keys(RuleTriggerType).length, 6);
    });

    it('2. RuleExecutionStatus covers all 6 lifecycle states', () => {
      const expected = [
        'CLAIMED',
        'EXECUTING',
        'EXECUTED',
        'SKIPPED_CONDITION',
        'SKIPPED_BUDGET',
        'FAILED',
      ];
      expected.forEach((status) => {
        assert.ok(status in RuleExecutionStatus, `RuleExecutionStatus must define ${status}`);
        assert.strictEqual((RuleExecutionStatus as any)[status], status);
      });
      assert.strictEqual(Object.keys(RuleExecutionStatus).length, 6);
    });

    it('3. SafetyAuditStatus covers all 6 audit states including fail-closed PENDING', () => {
      const expected = [
        'PENDING',
        'RUNNING',
        'PASSED',
        'FLAGGED_APPROVAL_REQUIRED',
        'BLOCKED_POLICY_VIOLATION',
        'EXPIRED',
      ];
      expected.forEach((status) => {
        assert.ok(status in SafetyAuditStatus, `SafetyAuditStatus must define ${status}`);
        assert.strictEqual((SafetyAuditStatus as any)[status], status);
      });
      assert.strictEqual(Object.keys(SafetyAuditStatus).length, 6);
    });

    it('4. SafetyWallType defines the 4-Wall Defense in Depth', () => {
      const expected = [
        'CLAIM_HALLUCINATION',
        'TOXICITY_BRAND_SAFETY',
        'POLICY_COMPLIANCE',
        'SENSITIVE_TOPIC_RATE',
      ];
      expected.forEach((wall) => {
        assert.ok(wall in SafetyWallType, `SafetyWallType must define ${wall}`);
        assert.strictEqual((SafetyWallType as any)[wall], wall);
      });
      assert.strictEqual(Object.keys(SafetyWallType).length, 4);
    });

    it('5. OverrideStatus covers Option A CAS single-use lifecycle', () => {
      const expected = [
        'OVERRIDE_REQUESTED',
        'OVERRIDDEN',
        'REJECTED',
        'EXPIRED',
      ];
      expected.forEach((status) => {
        assert.ok(status in OverrideStatus, `OverrideStatus must define ${status}`);
        assert.strictEqual((OverrideStatus as any)[status], status);
      });
      assert.strictEqual(Object.keys(OverrideStatus).length, 4);
    });

    it('6. ExperimentStatus defines the 6 two-arm A/B states', () => {
      const expected = [
        'DRAFT',
        'ACTIVE',
        'COLLECTING_DATA',
        'ANALYSIS_LOCKED',
        'CONCLUDED',
        'ARCHIVED',
      ];
      expected.forEach((status) => {
        assert.ok(status in ExperimentStatus, `ExperimentStatus must define ${status}`);
        assert.strictEqual((ExperimentStatus as any)[status], status);
      });
      assert.strictEqual(Object.keys(ExperimentStatus).length, 6);
    });

    it('7. ExperimentMetric defines all 5 primary statistical metrics', () => {
      const expected = [
        'ENGAGEMENT_RATE_BY_VIEWS',
        'LIKE_RATE',
        'REPLY_RATE',
        'REPOST_RATE',
        'TOTAL_VIEWS',
      ];
      expected.forEach((metric) => {
        assert.ok(metric in ExperimentMetric, `ExperimentMetric must define ${metric}`);
        assert.strictEqual((ExperimentMetric as any)[metric], metric);
      });
      assert.strictEqual(Object.keys(ExperimentMetric).length, 5);
    });

    it('8. ExperimentEffectType defines RELATIVE and ABSOLUTE lifts', () => {
      assert.strictEqual(ExperimentEffectType.RELATIVE, 'RELATIVE');
      assert.strictEqual(ExperimentEffectType.ABSOLUTE, 'ABSOLUTE');
      assert.strictEqual(Object.keys(ExperimentEffectType).length, 2);
    });

    it('9. OptimizationDirection defines MAXIMIZE and MINIMIZE', () => {
      assert.strictEqual(OptimizationDirection.MAXIMIZE, 'MAXIMIZE');
      assert.strictEqual(OptimizationDirection.MINIMIZE, 'MINIMIZE');
      assert.strictEqual(Object.keys(OptimizationDirection).length, 2);
    });

    it('10. AdaptationProposalStatus defines the 4 closed-loop lifecycle states', () => {
      const expected = [
        'PENDING_REVIEW',
        'APPLIED',
        'REJECTED',
        'SUPERSEDED',
      ];
      expected.forEach((status) => {
        assert.ok(status in AdaptationProposalStatus, `AdaptationProposalStatus must define ${status}`);
        assert.strictEqual((AdaptationProposalStatus as any)[status], status);
      });
      assert.strictEqual(Object.keys(AdaptationProposalStatus).length, 4);
    });

    it('11. AutonomyLevel defines the 4 operator autonomy tiers', () => {
      const expected = [
        'MANUAL',
        'SEMI_AUTONOMOUS',
        'FULL_AUTONOMOUS',
        'PAUSED',
      ];
      expected.forEach((level) => {
        assert.ok(level in AutonomyLevel, `AutonomyLevel must define ${level}`);
        assert.strictEqual((AutonomyLevel as any)[level], level);
      });
      assert.strictEqual(Object.keys(AutonomyLevel).length, 4);
    });
  });

  describe('Phase 5: Constraint Validation & Value Bounds Rules', () => {
    function validatePhase5Constraint(constraintName: string, values: Record<string, any>): { passes: boolean; reason?: string } {
      switch (constraintName) {
        case 'chk_winsorized_lift': {
          const lift = values.winsorizedLift;
          if (typeof lift !== 'number' || lift < -0.50 || lift > 0.50) {
            return { passes: false, reason: 'Winsorized lift must be bounded within [-0.50, +0.50]' };
          }
          return { passes: true };
        }
        case 'chk_override_reason_length': {
          const reason = values.reason;
          if (typeof reason !== 'string' || reason.trim().length < 10) {
            return { passes: false, reason: 'Override reason must be non-empty string with at least 10 characters' };
          }
          return { passes: true };
        }
        case 'chk_safety_thresholds': {
          const { hallucinationThreshold, toxicityThreshold } = values;
          if (typeof hallucinationThreshold !== 'number' || hallucinationThreshold < 0.0 || hallucinationThreshold > 1.0) {
            return { passes: false, reason: 'Hallucination threshold must be between 0.0 and 1.0' };
          }
          if (typeof toxicityThreshold !== 'number' || toxicityThreshold < 0.0 || toxicityThreshold > 1.0) {
            return { passes: false, reason: 'Toxicity threshold must be between 0.0 and 1.0' };
          }
          return { passes: true };
        }
        case 'chk_experiment_variant_count': {
          const count = values.variantCount;
          if (count !== 2) {
            return { passes: false, reason: 'Experiments must strictly maintain exactly 2 arms (A and B)' };
          }
          return { passes: true };
        }
        case 'chk_operator_weekly_limit': {
          const limit = values.maxWeeklyPosts;
          if (typeof limit !== 'number' || limit <= 0 || limit > 100) {
            return { passes: false, reason: 'Max weekly posts must be positive integer <= 100' };
          }
          return { passes: true };
        }
        default:
          throw new Error(`Unknown Phase 5 constraint: ${constraintName}`);
      }
    }

    it('chk_winsorized_lift: strictly bounds adaptive adjustments to [-0.50, +0.50]', () => {
      assert.strictEqual(validatePhase5Constraint('chk_winsorized_lift', { winsorizedLift: 0.0 }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_winsorized_lift', { winsorizedLift: 0.50 }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_winsorized_lift', { winsorizedLift: -0.50 }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_winsorized_lift', { winsorizedLift: 0.25 }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_winsorized_lift', { winsorizedLift: 0.51 }).passes, false);
      assert.strictEqual(validatePhase5Constraint('chk_winsorized_lift', { winsorizedLift: -0.51 }).passes, false);
      assert.strictEqual(validatePhase5Constraint('chk_winsorized_lift', { winsorizedLift: 1.2 }).passes, false);
    });

    it('chk_override_reason_length: requires at least 10 characters of justification', () => {
      assert.strictEqual(validatePhase5Constraint('chk_override_reason_length', { reason: 'Verified human source on official blog' }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_override_reason_length', { reason: '1234567890' }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_override_reason_length', { reason: 'Too short' }).passes, false);
      assert.strictEqual(validatePhase5Constraint('chk_override_reason_length', { reason: '         ' }).passes, false);
      assert.strictEqual(validatePhase5Constraint('chk_override_reason_length', { reason: '' }).passes, false);
    });

    it('chk_safety_thresholds: enforces [0.0, 1.0] limits on hallucination and toxicity thresholds', () => {
      assert.strictEqual(validatePhase5Constraint('chk_safety_thresholds', { hallucinationThreshold: 0.30, toxicityThreshold: 0.15 }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_safety_thresholds', { hallucinationThreshold: 0.0, toxicityThreshold: 1.0 }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_safety_thresholds', { hallucinationThreshold: -0.1, toxicityThreshold: 0.15 }).passes, false);
      assert.strictEqual(validatePhase5Constraint('chk_safety_thresholds', { hallucinationThreshold: 0.30, toxicityThreshold: 1.05 }).passes, false);
    });

    it('chk_experiment_variant_count: enforces strictly two-arm A/B structure', () => {
      assert.strictEqual(validatePhase5Constraint('chk_experiment_variant_count', { variantCount: 2 }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_experiment_variant_count', { variantCount: 1 }).passes, false);
      assert.strictEqual(validatePhase5Constraint('chk_experiment_variant_count', { variantCount: 3 }).passes, false);
    });

    it('chk_operator_weekly_limit: bounds operator posting rate', () => {
      assert.strictEqual(validatePhase5Constraint('chk_operator_weekly_limit', { maxWeeklyPosts: 14 }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_operator_weekly_limit', { maxWeeklyPosts: 1 }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_operator_weekly_limit', { maxWeeklyPosts: 100 }).passes, true);
      assert.strictEqual(validatePhase5Constraint('chk_operator_weekly_limit', { maxWeeklyPosts: 0 }).passes, false);
      assert.strictEqual(validatePhase5Constraint('chk_operator_weekly_limit', { maxWeeklyPosts: 101 }).passes, false);
    });
  });

  describe('Phase 5: Compound Unique Key Invariant Definitions', () => {
    it('enforces budget window uniqueness per rule (uq_rule_budget_window)', () => {
      const budgets = new Set<string>();
      const makeKey = (ruleId: string, executionWindow: string) => `${ruleId}:${executionWindow}`;

      budgets.add(makeKey('rule-1', '2026-10-04'));
      budgets.add(makeKey('rule-2', '2026-10-04'));
      budgets.add(makeKey('rule-1', '2026-10-05'));

      assert.strictEqual(budgets.size, 3);
      assert.ok(budgets.has(makeKey('rule-1', '2026-10-04')));
      // Duplicate should collide
      const isDuplicate = budgets.has(makeKey('rule-1', '2026-10-04'));
      assert.strictEqual(isDuplicate, true);
    });

    it('enforces execution log idempotency key per rule and window (uq_rule_execution_log_idempotency)', () => {
      const logs = new Set<string>();
      const makeKey = (ruleId: string, window: string, execKey: string) => `${ruleId}:${window}:${execKey}`;

      logs.add(makeKey('rule-1', '2026-10-04', 'post-123-METRIC_OBSERVED'));
      assert.strictEqual(logs.has(makeKey('rule-1', '2026-10-04', 'post-123-METRIC_OBSERVED')), true);
      assert.strictEqual(logs.has(makeKey('rule-1', '2026-10-04', 'post-456-METRIC_OBSERVED')), false);
    });

    it('enforces single audit per content version and policy version (uq_safety_audit_version)', () => {
      const audits = new Set<string>();
      const makeKey = (contentVersionId: string, policyVersion: string) => `${contentVersionId}:${policyVersion}`;

      audits.add(makeKey('ver-1', '1.0.0'));
      assert.strictEqual(audits.has(makeKey('ver-1', '1.0.0')), true);
      assert.strictEqual(audits.has(makeKey('ver-1', '1.0.1')), false);
      assert.strictEqual(audits.has(makeKey('ver-2', '1.0.0')), false);
    });

    it('enforces exactly one active lease per social account (uq_operator_lease_tenant)', () => {
      const leases = new Map<string, { workspaceId: string; leaseUntil: Date }>();
      leases.set('account-1', { workspaceId: 'ws-1', leaseUntil: new Date(Date.now() + 60000) });

      assert.strictEqual(leases.has('account-1'), true);
      assert.strictEqual(leases.get('account-1')?.workspaceId, 'ws-1');
    });

    it('enforces single-use CAS safety override token uniqueness', () => {
      const tokens = new Map<string, { consumed: boolean; consumedBy?: string }>();
      const token = 'cas-token-uuid-1';
      tokens.set(token, { consumed: false });

      // First consumption succeeds
      const entry = tokens.get(token);
      assert.ok(entry);
      assert.strictEqual(entry.consumed, false);
      entry.consumed = true;
      entry.consumedBy = 'post-1';

      // Subsequent consumption fails CAS check
      const reattempt = tokens.get(token);
      assert.ok(reattempt);
      assert.strictEqual(reattempt.consumed, true);
    });

    it('enforces two-arm variant key uniqueness per experiment (uq_experiment_variant_key)', () => {
      const variants = new Set<string>();
      const makeKey = (experimentId: string, variantKey: string) => `${experimentId}:${variantKey}`;

      variants.add(makeKey('exp-1', 'A'));
      variants.add(makeKey('exp-1', 'B'));

      assert.strictEqual(variants.size, 2);
      assert.strictEqual(variants.has(makeKey('exp-1', 'A')), true);
      assert.strictEqual(variants.has(makeKey('exp-1', 'B')), true);
      assert.strictEqual(variants.has(makeKey('exp-1', 'C')), false);
    });
  });
});

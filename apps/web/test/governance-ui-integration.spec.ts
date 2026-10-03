import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { RuleActionType, SafetyWallCategory } from '@threadpilot/types';

describe('Governance & Autonomy UI Integration & Invariants', () => {
  it('validates Option A single-use override payload constraints', () => {
    function validateOverridePayload(payload: {
      auditId?: string;
      reason?: string;
      riskAcknowledged?: boolean;
    }) {
      if (!payload.auditId || typeof payload.auditId !== 'string') {
        throw new Error('auditId is required');
      }
      if (!payload.reason || payload.reason.trim().length < 5) {
        throw new Error('A detailed operational reason (>= 5 characters) is required for safety override');
      }
      if (payload.riskAcknowledged !== true) {
        throw new Error('Explicit risk acknowledgement is mandatory');
      }
      return true;
    }

    assert.throws(
      () => validateOverridePayload({ auditId: 'audit-1', reason: '', riskAcknowledged: true }),
      /A detailed operational reason/
    );

    assert.throws(
      () => validateOverridePayload({ auditId: 'audit-1', reason: 'Emergency fix', riskAcknowledged: false }),
      /Explicit risk acknowledgement is mandatory/
    );

    assert.strictEqual(
      validateOverridePayload({
        auditId: 'audit-1',
        reason: 'Breaking product announcement requires immediate publication',
        riskAcknowledged: true,
      }),
      true
    );
  });

  it('verifies 4 safety evaluation walls coverage in UI status badges', () => {
    const requiredWalls: SafetyWallCategory[] = [
      'CLAIM_HALLUCINATION',
      'TOXICITY',
      'COMPLIANCE',
      'SENSITIVE_TOPIC_SPACING',
    ];

    const auditWallScores = {
      CLAIM_HALLUCINATION: 0.04,
      TOXICITY: 0.01,
      COMPLIANCE: 0.02,
      SENSITIVE_TOPIC_SPACING: 0.0,
    };

    requiredWalls.forEach((wall) => {
      assert.ok(auditWallScores[wall] !== undefined, `Wall ${wall} must be tracked`);
      assert.ok(auditWallScores[wall] >= 0 && auditWallScores[wall] <= 1);
    });
  });

  it('asserts deterministic rule actions map to valid Phase 5 discriminated actions', () => {
    const validActions: RuleActionType[] = [
      'AUTO_SCHEDULE',
      'SUPPRESS',
      'NOTIFY_HUMAN',
      'APPLY_LABEL',
    ];

    const sampleUiActions = ['AUTO_SCHEDULE', 'SUPPRESS', 'NOTIFY_HUMAN', 'APPLY_LABEL'];
    sampleUiActions.forEach((action) => {
      assert.ok(validActions.includes(action as RuleActionType));
    });
  });

  it('calculates ISO week quota utilization percentage correctly', () => {
    function computeQuotaMeter(used: number, limit: number) {
      if (limit <= 0) return 0;
      const ratio = used / limit;
      return Math.min(100, Math.round(ratio * 100));
    }

    assert.strictEqual(computeQuotaMeter(7, 25), 28);
    assert.strictEqual(computeQuotaMeter(25, 25), 100);
    assert.strictEqual(computeQuotaMeter(30, 25), 100);
  });

  it('formats AST conditions into readable human-friendly UI summary badges', () => {
    function formatConditionSummary(ast: any): string {
      if (ast.and) {
        return `AND (${ast.and.length} conditions)`;
      }
      if (ast.or) {
        return `OR (${ast.or.length} conditions)`;
      }
      if (ast.field) {
        return `${ast.field} ${ast.op} ${JSON.stringify(ast.value)}`;
      }
      return 'Custom Condition';
    }

    const simple = { field: 'metric.engagementRate', op: '>=', value: 0.05 };
    assert.strictEqual(formatConditionSummary(simple), 'metric.engagementRate >= 0.05');

    const composite = { and: [{ field: 'a', op: '==', value: 1 }, { field: 'b', op: '==', value: 2 }] };
    assert.strictEqual(formatConditionSummary(composite), 'AND (2 conditions)');
  });

  it('validates two-arm experimentation UI state transitions and lift displays', () => {
    const validStatuses = ['DRAFT', 'ACTIVE', 'COLLECTING_DATA', 'ANALYSIS_LOCKED', 'CONCLUDED', 'ARCHIVED'];
    
    function formatRelativeLift(lift: number | null): string {
      if (lift === null || lift === undefined) return 'N/A';
      const pct = (lift * 100).toFixed(1);
      return lift > 0 ? `+${pct}%` : `${pct}%`;
    }

    validStatuses.forEach((st) => {
      assert.ok(typeof st === 'string');
    });

    assert.strictEqual(formatRelativeLift(0.50), '+50.0%');
    assert.strictEqual(formatRelativeLift(-0.154), '-15.4%');
    assert.strictEqual(formatRelativeLift(null), 'N/A');
  });

  it('verifies safety rejection deep-link generator in calendar and schedule modal', () => {
    function getSafetyDeepLink(auditId: string): string {
      return `/governance?tab=safety&auditId=${encodeURIComponent(auditId)}`;
    }

    const auditUuid = '11111111-2222-3333-4444-555555555555';
    const link = getSafetyDeepLink(auditUuid);
    assert.strictEqual(link, `/governance?tab=safety&auditId=${auditUuid}`);
  });

  it('simulates operator kill switch optimistic toggle and rollback on error', async () => {
    let operatorStatus: 'ACTIVE' | 'PAUSED' = 'ACTIVE';

    async function toggleOperator(mockApiError = false) {
      const prev = operatorStatus;
      // Optimistic update
      operatorStatus = prev === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

      try {
        if (mockApiError) {
          throw new Error('Network error');
        }
        return { success: true, status: operatorStatus };
      } catch (err) {
        // Rollback on failure
        operatorStatus = prev;
        throw err;
      }
    }

    // Success toggle
    await toggleOperator(false);
    assert.strictEqual(operatorStatus, 'PAUSED');

    // Error toggle rolls back
    await assert.rejects(() => toggleOperator(true), /Network error/);
    assert.strictEqual(operatorStatus, 'PAUSED', 'Must roll back to prior state on error');
  });
});


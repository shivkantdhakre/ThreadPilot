import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAST,
  type RuleConditionAST,
  AutoScheduleActionSchema,
  RuleActionSchema,
  CreateExperimentRequestSchema,
  computeWinsorizedLift,
  computeAdaptedWeight,
  getIsoWeekWindow,
} from '../dist/index.js';

describe('Phase 5 Types & Evaluator Invariant Tests', () => {
  describe('RuleConditionAST Evaluator', () => {
    it('evaluates comparison operators correctly including != and contains', () => {
      const context = {
        metric: {
          engagementRate: 0.08,
          views: 1500,
          author: 'Alice',
          tags: ['tech', 'ai', 'threads'],
        },
      };

      const eqRule: RuleConditionAST = { field: 'metric.author', op: '==', value: 'Alice' };
      assert.equal(evaluateAST(eqRule, context), true);

      const neqRule: RuleConditionAST = { field: 'metric.author', op: '!=', value: 'Bob' };
      assert.equal(evaluateAST(neqRule, context), true);

      const gtRule: RuleConditionAST = { field: 'metric.views', op: '>', value: 1000 };
      assert.equal(evaluateAST(gtRule, context), true);

      const lteRule: RuleConditionAST = { field: 'metric.engagementRate', op: '<=', value: 0.05 };
      assert.equal(evaluateAST(lteRule, context), false);

      const inRule: RuleConditionAST = { field: 'metric.author', op: 'in', value: ['Alice', 'Bob'] };
      assert.equal(evaluateAST(inRule, context), true);

      const notInRule: RuleConditionAST = { field: 'metric.author', op: 'not_in', value: ['Charlie', 'Dave'] };
      assert.equal(evaluateAST(notInRule, context), true);

      const containsRule: RuleConditionAST = { field: 'metric.author', op: 'contains', value: 'lic' };
      assert.equal(evaluateAST(containsRule, context), true);
    });

    it('evaluates logical operators and, or, not with correct precedence and short-circuiting', () => {
      const context = {
        metric: { views: 500, likes: 20 },
      };

      const andRule: RuleConditionAST = {
        and: [
          { field: 'metric.views', op: '>=', value: 500 },
          { field: 'metric.likes', op: '>=', value: 10 },
        ],
      };
      assert.equal(evaluateAST(andRule, context), true);

      const orRule: RuleConditionAST = {
        or: [
          { field: 'metric.views', op: '<', value: 100 },
          { field: 'metric.likes', op: '==', value: 20 },
        ],
      };
      assert.equal(evaluateAST(orRule, context), true);

      const notRule: RuleConditionAST = {
        not: { field: 'metric.views', op: '<', value: 100 },
      };
      assert.equal(evaluateAST(notRule, context), true);
    });
  });

  describe('Rule Action Zod Schemas & Validation', () => {
    it('accepts valid AUTO_SCHEDULE with FIXED_OFFSET_HOURS and required offsetHours', () => {
      const payload = {
        type: 'AUTO_SCHEDULE',
        version: 1,
        params: {
          slotStrategy: 'FIXED_OFFSET_HOURS',
          offsetHours: 4,
          priority: 'NORMAL',
        },
      };
      const parsed = AutoScheduleActionSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });

    it('rejects AUTO_SCHEDULE with FIXED_OFFSET_HOURS when offsetHours is missing', () => {
      const payload = {
        type: 'AUTO_SCHEDULE',
        version: 1,
        params: {
          slotStrategy: 'FIXED_OFFSET_HOURS',
          priority: 'NORMAL',
        },
      };
      const parsed = AutoScheduleActionSchema.safeParse(payload);
      assert.equal(parsed.success, false);
    });

    it('rejects AUTO_SCHEDULE with NEXT_OPTIMAL when offsetHours is erroneously supplied', () => {
      const payload = {
        type: 'AUTO_SCHEDULE',
        version: 1,
        params: {
          slotStrategy: 'NEXT_OPTIMAL',
          offsetHours: 6,
          priority: 'NORMAL',
        },
      };
      const parsed = AutoScheduleActionSchema.safeParse(payload);
      assert.equal(parsed.success, false);
    });

    it('validates discriminated union RuleActionSchema across multiple action types', () => {
      const autoSchedule = {
        type: 'AUTO_SCHEDULE',
        version: 1,
        params: { slotStrategy: 'NEXT_OPTIMAL', priority: 'HIGH' },
      };
      assert.equal(RuleActionSchema.safeParse(autoSchedule).success, true);

      const adaptWeight = {
        type: 'ADAPT_STYLE_WEIGHT',
        version: 1,
        params: { dimension: 'HOOK', dimensionValue: 'contrarian', weightDelta: 0.15 },
      };
      assert.equal(RuleActionSchema.safeParse(adaptWeight).success, true);

      const unknownAction = {
        type: 'INVALID_TYPE',
        version: 1,
        params: {},
      };
      assert.equal(RuleActionSchema.safeParse(unknownAction).success, false);
    });
  });

  describe('Content Experimentation Schema Validation', () => {
    it('accepts strictly two-arm experiment with exactly 1 control and 1 treatment', () => {
      const validPayload = {
        name: 'Hook length comparison',
        hypothesis: 'Shorter hooks increase 24h engagement',
        dimension: 'HOOK',
        primaryMetric: 'ENGAGEMENT_RATE_BY_VIEWS',
        effectType: 'RELATIVE',
        targetObservationSlot: 'T_24H',
        durationDays: 14,
        minPracticalEffect: 0.05,
        minSampleSizePerArm: 10,
        variants: [
          { variantKey: 'A', isControl: true, dimensionValue: 'standard_question' },
          { variantKey: 'B', isControl: false, dimensionValue: 'contrarian_statement' },
        ],
      };
      const result = CreateExperimentRequestSchema.safeParse(validPayload);
      assert.equal(result.success, true);
    });

    it('rejects experiment with 2 control arms', () => {
      const invalidPayload = {
        name: 'Invalid dual control',
        hypothesis: 'Testing',
        dimension: 'TOPIC',
        variants: [
          { variantKey: 'A', isControl: true, dimensionValue: 'tech' },
          { variantKey: 'B', isControl: true, dimensionValue: 'ai' },
        ],
      };
      const result = CreateExperimentRequestSchema.safeParse(invalidPayload);
      assert.equal(result.success, false);
    });

    it('rejects experiment with 3 variants', () => {
      const invalidPayload = {
        name: 'Invalid 3 arm experiment',
        hypothesis: 'Testing',
        dimension: 'TOPIC',
        variants: [
          { variantKey: 'A', isControl: true, dimensionValue: 'tech' },
          { variantKey: 'B', isControl: false, dimensionValue: 'ai' },
          { variantKey: 'C', isControl: false, dimensionValue: 'crypto' },
        ],
      };
      const result = CreateExperimentRequestSchema.safeParse(invalidPayload);
      assert.equal(result.success, false);
    });
  });

  describe('Adaptation Mathematics & Winsorization', () => {
    it('clamps raw lift outside [-0.50, +0.50] to boundaries', () => {
      const extremePositive = computeWinsorizedLift(10, 30); // raw lift = +200%
      assert.equal(extremePositive.rawLift, 2.0);
      assert.equal(extremePositive.winsorizedLift, 0.50);
      assert.equal(extremePositive.isClamped, true);

      const extremeNegative = computeWinsorizedLift(10, 2); // raw lift = -80%
      assert.equal(extremeNegative.rawLift, -0.80);
      assert.equal(extremeNegative.winsorizedLift, -0.50);
      assert.equal(extremeNegative.isClamped, true);

      const withinBounds = computeWinsorizedLift(10, 12); // raw lift = +20%
      assert.equal(withinBounds.rawLift, 0.20);
      assert.equal(withinBounds.winsorizedLift, 0.20);
      assert.equal(withinBounds.isClamped, false);
    });

    it('computes bounded adapted weights with recency retention and learning rate', () => {
      const initialWeight = 1.0;
      // Controlled experiment (eta = 0.15) with +20% lift
      const adapted = computeAdaptedWeight(initialWeight, 0.20, true);
      // target = 1.0 * (1 + 0.15 * 0.20) = 1.03
      // result = 1.0 * 0.8 + 0.2 * 1.03 = 0.8 + 0.206 = 1.006
      assert.equal(adapted, 1.006);

      // Verify lower and upper bounds [0.1, 3.0]
      const lowerBounded = computeAdaptedWeight(0.12, -0.50, true);
      assert.ok(lowerBounded >= 0.1);

      const upperBounded = computeAdaptedWeight(2.95, 0.50, true);
      assert.ok(upperBounded <= 3.0);
    });
  });

  describe('ISO Week Window Calculation', () => {
    it('calculates deterministic ISO week format YYYY-Www in account timezone', () => {
      const testDate = new Date('2026-10-04T00:00:00Z');
      const weekWindowUtc = getIsoWeekWindow(testDate, 'UTC');
      assert.match(weekWindowUtc, /^2026-W\d{2}$/);

      const weekWindowNY = getIsoWeekWindow(testDate, 'America/New_York');
      assert.match(weekWindowNY, /^2026-W\d{2}$/);
    });
  });
});

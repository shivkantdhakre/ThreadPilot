import { z } from 'zod';

export type RuleTriggerType =
  | 'POST_PUBLISHED'
  | 'METRIC_OBSERVED'
  | 'INSIGHT_GENERATED'
  | 'SCHEDULE_TIME_REACHED'
  | 'SAFETY_AUDIT_FAILED'
  | 'MANUAL_TRIGGER';

export type RuleExecutionStatus =
  | 'CLAIMED'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'SKIPPED_CONDITION'
  | 'SKIPPED_BUDGET'
  | 'FAILED';

export type ComparisonOp =
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'not_in'
  | 'contains';

export interface ComparisonExpr {
  field: string;
  op: ComparisonOp;
  value: string | number | boolean | Array<string | number>;
}

export interface AndExpr {
  and: RuleConditionAST[];
}

export interface OrExpr {
  or: RuleConditionAST[];
}

export interface NotExpr {
  not: RuleConditionAST;
}

export type RuleConditionAST = ComparisonExpr | AndExpr | OrExpr | NotExpr;

export const BaseAutoScheduleActionSchema = z.object({
  type: z.literal('AUTO_SCHEDULE'),
  version: z.literal(1),
  params: z.object({
    slotStrategy: z.enum(['NEXT_OPTIMAL', 'FIXED_OFFSET_HOURS']),
    offsetHours: z.number().int().min(1).max(168).optional(),
    priority: z.enum(['NORMAL', 'HIGH']).default('NORMAL'),
  }),
});

export const AutoScheduleActionSchema = BaseAutoScheduleActionSchema.superRefine((val, ctx) => {
  if (val.params.slotStrategy === 'FIXED_OFFSET_HOURS' && val.params.offsetHours === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'offsetHours is required when slotStrategy is FIXED_OFFSET_HOURS',
      path: ['params', 'offsetHours'],
    });
  }
  if (val.params.slotStrategy === 'NEXT_OPTIMAL' && val.params.offsetHours !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'offsetHours must not be specified when slotStrategy is NEXT_OPTIMAL',
      path: ['params', 'offsetHours'],
    });
  }
});

export const RequireApprovalActionSchema = z.object({
  type: z.literal('REQUIRE_APPROVAL'),
  version: z.literal(1),
  params: z.object({
    reason: z.string().min(5).max(500),
    reviewerRole: z.enum(['ADMIN', 'OWNER', 'EDITOR']).default('ADMIN'),
  }),
});

export const AssignExperimentActionSchema = z.object({
  type: z.literal('ASSIGN_EXPERIMENT'),
  version: z.literal(1),
  params: z.object({
    experimentId: z.string().uuid(),
    variantKey: z.enum(['A', 'B']).optional(),
  }),
});

export const AdaptStyleWeightActionSchema = z.object({
  type: z.literal('ADAPT_STYLE_WEIGHT'),
  version: z.literal(1),
  params: z.object({
    dimension: z.enum(['TOPIC', 'FORMAT', 'LENGTH', 'HOOK']),
    dimensionValue: z.string().min(1),
    weightDelta: z.number().min(-0.25).max(0.25),
  }),
});

export const DismissCandidateActionSchema = z.object({
  type: z.literal('DISMISS_CANDIDATE'),
  version: z.literal(1),
  params: z.object({
    reason: z.string().min(3).max(255),
  }),
});

export const RuleActionSchema = z
  .discriminatedUnion('type', [
    BaseAutoScheduleActionSchema,
    RequireApprovalActionSchema,
    AssignExperimentActionSchema,
    AdaptStyleWeightActionSchema,
    DismissCandidateActionSchema,
  ])
  .superRefine((val, ctx) => {
    if (val.type === 'AUTO_SCHEDULE') {
      if (val.params.slotStrategy === 'FIXED_OFFSET_HOURS' && val.params.offsetHours === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'offsetHours is required when slotStrategy is FIXED_OFFSET_HOURS',
          path: ['params', 'offsetHours'],
        });
      }
      if (val.params.slotStrategy === 'NEXT_OPTIMAL' && val.params.offsetHours !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'offsetHours must not be specified when slotStrategy is NEXT_OPTIMAL',
          path: ['params', 'offsetHours'],
        });
      }
    }
  });

export type RuleAction = z.infer<typeof RuleActionSchema>;

export const RuleASTSchema: z.ZodType<RuleConditionAST> = z.lazy(() =>
  z.union([
    z.object({
      and: z.array(RuleASTSchema).min(1),
    }),
    z.object({
      or: z.array(RuleASTSchema).min(1),
    }),
    z.object({
      not: RuleASTSchema,
    }),
    z.object({
      field: z.string().min(1),
      op: z.enum(['==', '!=', '>', '>=', '<', '<=', 'in', 'not_in', 'contains']),
      value: z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.union([z.string(), z.number()])),
      ]),
    }),
  ]),
);

export function evaluateAST(ast: RuleConditionAST, context: Record<string, unknown>): boolean {
  if ('and' in ast && Array.isArray(ast.and)) {
    if (ast.and.length === 0) return false;
    return ast.and.every((child) => evaluateAST(child, context));
  }
  if ('or' in ast && Array.isArray(ast.or)) {
    if (ast.or.length === 0) return false;
    return ast.or.some((child) => evaluateAST(child, context));
  }
  if ('not' in ast && ast.not) {
    return !evaluateAST(ast.not, context);
  }
  if ('field' in ast && 'op' in ast && 'value' in ast) {
    const actual = getNestedValue(context, ast.field);
    const expected = ast.value;

    switch (ast.op) {
      case '==':
        return actual === expected;
      case '!=':
        return actual !== expected;
      case '>':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case '>=':
        return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
      case '<':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case '<=':
        return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual as never);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual as never);
      case 'contains':
        return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
      default:
        return false;
    }
  }
  return false;
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part: string) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

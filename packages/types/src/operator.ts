import { z } from 'zod';

export type AutonomyLevel =
  | 'MANUAL'
  | 'SEMI_AUTONOMOUS'
  | 'FULL_AUTONOMOUS'
  | 'PAUSED';

export type OperatorRunStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'HALTED_KILL_SWITCH'
  | 'FAILED';

export type CandidateStatus =
  | 'SELECTED'
  | 'SAFETY_BLOCKED'
  | 'SCHEDULED'
  | 'SKIPPED_BUDGET';

export const UpdateOperatorConfigRequestSchema = z.object({
  autonomyLevel: z
    .enum(['MANUAL', 'SEMI_AUTONOMOUS', 'FULL_AUTONOMOUS', 'PAUSED'])
    .optional(),
  maxWeeklyPosts: z.number().int().min(1).max(70).optional(),
  minHoursBetweenPosts: z.number().int().min(1).max(48).optional(),
  targetPostingHours: z.array(z.number().int().min(0).max(23)).min(1).optional(),
  planningHorizonDays: z.number().int().min(1).max(30).optional(),
  enableExperiments: z.boolean().optional(),
});

export type UpdateOperatorConfigRequest = z.infer<
  typeof UpdateOperatorConfigRequestSchema
>;

export interface PlanningCandidate {
  draftId: string;
  contentVersionId: string;
  scheduledSlot: Date;
  recommendationId?: string;
  experimentId?: string;
  variantId?: string;
}

export interface PlanningCycleSummary {
  cycleId: string;
  status: OperatorRunStatus;
  candidatesEvaluated: number;
  candidatesScheduled: number;
  safetyFlaggedCount: number;
  haltReason?: string;
  error?: string;
}

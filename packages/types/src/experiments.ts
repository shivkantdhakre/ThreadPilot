import { z } from 'zod';

export type ExperimentStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'COLLECTING_DATA'
  | 'ANALYSIS_LOCKED'
  | 'CONCLUDED'
  | 'ARCHIVED';

export type ExperimentMetric =
  | 'ENGAGEMENT_RATE_BY_VIEWS'
  | 'LIKE_RATE'
  | 'REPLY_RATE'
  | 'REPOST_RATE'
  | 'TOTAL_VIEWS';

export type ExperimentEffectType = 'RELATIVE' | 'ABSOLUTE';

export type OptimizationDirection = 'MAXIMIZE' | 'MINIMIZE';

export const CreateExperimentRequestSchema = z
  .object({
    name: z.string().min(3).max(100),
    hypothesis: z.string().min(10).max(500),
    dimension: z.enum(['TOPIC', 'FORMAT', 'LENGTH', 'HOOK']),
    primaryMetric: z
      .enum([
        'ENGAGEMENT_RATE_BY_VIEWS',
        'LIKE_RATE',
        'REPLY_RATE',
        'REPOST_RATE',
        'TOTAL_VIEWS',
      ])
      .default('ENGAGEMENT_RATE_BY_VIEWS'),
    effectType: z.enum(['RELATIVE', 'ABSOLUTE']).default('RELATIVE'),
    targetObservationSlot: z
      .enum(['T_1H', 'T_6H', 'T_24H', 'T_48H', 'T_7D'])
      .default('T_24H'),
    durationDays: z.number().int().min(7).max(60).default(14),
    minPracticalEffect: z.number().min(0.01).max(1.0).default(0.05),
    minSampleSizePerArm: z.number().int().min(10).max(100).default(10),
    variants: z
      .array(
        z.object({
          variantKey: z.enum(['A', 'B']),
          isControl: z.boolean(),
          dimensionValue: z.string().min(1),
        }),
      )
      .length(2),
  })
  .superRefine((val, ctx) => {
    const controls = val.variants.filter((v) => v.isControl);
    if (controls.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Experiment must have exactly one control variant and one treatment variant',
        path: ['variants'],
      });
    }
    const keys = new Set(val.variants.map((v) => v.variantKey));
    if (!keys.has('A') || !keys.has('B')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Experiment variants must be labeled A and B',
        path: ['variants'],
      });
    }
  });

export type CreateExperimentRequest = z.infer<typeof CreateExperimentRequestSchema>;

export interface StatisticalAnalysisResult {
  nControl: number;
  nTreatment: number;
  meanControl: number;
  meanTreatment: number;
  varianceControl: number;
  varianceTreatment: number;
  welchTStatistic: number;
  degreesOfFreedom: number;
  welchPValue: number;
  cohensD: number;
  ci95Lower: number;
  ci95Upper: number;
  observedRelativeLift: number;
  passesFDR?: boolean;
  qValue?: number;
  winnerVariantKey?: 'A' | 'B' | null;
  winnerDeclared: boolean;
  conclusionReason: string;
}

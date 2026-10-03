import { z } from 'zod';

export type AdaptationProposalStatus =
  | 'PENDING_REVIEW'
  | 'APPLIED'
  | 'REJECTED'
  | 'SUPERSEDED';

export type EvidenceGrade =
  | 'HIGH_SIGNAL'
  | 'DIRECTIONAL'
  | 'ANECDOTAL'
  | 'INSUFFICIENT_DATA'
  | 'ACTION_PROPOSED';

export const ApplyAdaptationProposalRequestSchema = z.object({
  proposalId: z.string().uuid(),
  expectedProfileVersion: z.number().int().min(1),
});

export type ApplyAdaptationProposalRequest = z.infer<
  typeof ApplyAdaptationProposalRequestSchema
>;

export interface WinsorizedLiftResult {
  rawLift: number;
  winsorizedLift: number;
  isClamped: boolean;
}

export function computeWinsorizedLift(meanControl: number, meanTreatment: number): WinsorizedLiftResult {
  if (meanControl <= 0) {
    return { rawLift: 0, winsorizedLift: 0, isClamped: false };
  }
  const rawLift = (meanTreatment - meanControl) / meanControl;
  const winsorizedLift = Math.max(-0.50, Math.min(0.50, rawLift));
  return {
    rawLift,
    winsorizedLift,
    isClamped: rawLift !== winsorizedLift,
  };
}

export function computeAdaptedWeight(
  currentWeight: number,
  winsorizedLift: number,
  isControlledExperiment: boolean,
): number {
  const lambda = 0.20; // recency retention
  const eta = isControlledExperiment ? 0.15 : 0.05; // learning rate
  const targetWeight = currentWeight * (1 + eta * winsorizedLift);
  const adapted = currentWeight * (1 - lambda) + lambda * targetWeight;
  // Bounded between 0.1 and 3.0 to prevent runaway weight drift
  return Math.max(0.1, Math.min(3.0, Number(adapted.toFixed(4))));
}

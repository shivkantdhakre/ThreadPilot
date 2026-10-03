import { z } from 'zod';

export type SafetyAuditStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PASSED'
  | 'FLAGGED_APPROVAL_REQUIRED'
  | 'BLOCKED_POLICY_VIOLATION'
  | 'EXPIRED';

export type SafetyWallType =
  | 'CLAIM_HALLUCINATION'
  | 'TOXICITY_BRAND_SAFETY'
  | 'POLICY_COMPLIANCE'
  | 'SENSITIVE_TOPIC_RATE';

export type OverrideStatus =
  | 'OVERRIDE_REQUESTED'
  | 'OVERRIDDEN'
  | 'REJECTED'
  | 'EXPIRED';

export interface WallFinding {
  wall: SafetyWallType;
  passed: boolean;
  score?: number;
  threshold?: number;
  reason?: string;
  evidence?: Record<string, unknown>;
}

export interface SafetyAuditDetails {
  hallucination?: {
    score: number;
    threshold: number;
    unsupportedClaims: string[];
  };
  toxicity?: {
    score: number;
    threshold: number;
    flaggedPhrases: string[];
  };
  compliance?: {
    charCount: number;
    maxChars: number;
    hasProhibitedTopics: boolean;
    prohibitedTopicsFound: string[];
  };
  sensitiveTopics?: {
    matchedTopic?: string;
    lastPublishedHoursAgo?: number;
    cooldownHoursRequired: number;
  };
  evaluatorVersion: string;
  modelVersion: string;
}

export const SafetyOverrideRequestSchema = z.object({
  auditId: z.string().uuid(),
  reason: z.string().min(10).max(1000),
  riskAcknowledged: z.literal(true),
});

export type SafetyOverrideRequest = z.infer<typeof SafetyOverrideRequestSchema>;

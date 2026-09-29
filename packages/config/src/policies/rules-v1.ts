export interface PolicyConfig {
  policyVersion: string; // e.g. "rules-v1"
  effectiveAt: string;
  thresholds: {
    minIntentConfidence: number; // 0.90
    maxToxicityScore: number;     // 0.10
    maxHarassmentScore: number;   // 0.10
    maxControversyScore: number; // 0.15
    maxFactualityRisk: number;   // 0.10
  };
  allowedIntents: string[];
  blockedIntents: string[];
  autonomyConditions: {
    requireGroundingPass: boolean;
    requireTonePass: boolean;
    prohibitNewExternalClaims: boolean;
  };
  reasonCodeMappings: Record<string, string>;
}

export const POLICY_RULES_V1: PolicyConfig = {
  policyVersion: 'rules-v1',
  effectiveAt: '2026-09-29T00:00:00.000Z',
  thresholds: {
    minIntentConfidence: 0.90,
    maxToxicityScore: 0.10,
    maxHarassmentScore: 0.10,
    maxControversyScore: 0.15,
    maxFactualityRisk: 0.10,
  },
  allowedIntents: ['QUESTION', 'AGREEMENT', 'COMPLIMENT', 'REQUEST'],
  blockedIntents: ['TROLLING', 'SPAM'],
  autonomyConditions: {
    requireGroundingPass: true,
    requireTonePass: true,
    prohibitNewExternalClaims: true,
  },
  reasonCodeMappings: {
    INJECTION_DETECTED: 'Possible prompt injection attempt detected',
    TOXICITY_HIGH: 'Toxicity score exceeds allowed threshold',
    HARASSMENT_HIGH: 'Harassment score exceeds allowed threshold',
    CONTROVERSIAL_TOPIC: 'Controversial topic score exceeds allowed threshold',
    UNSUPPORTED_CLAIM: 'Draft contains factual assertions unsupported by root post',
    FACTUALITY_UNVERIFIED: 'Factuality cannot be verified from author context',
    LOW_CONFIDENCE: 'Intent classification confidence below required threshold',
    AUTONOMY_DISABLED: 'Autonomy mode is disabled or review-only',
    KILL_SWITCH_ACTIVE: 'Publisher kill switch is active',
    AUTH_REQUIRED: 'OAuth token missing or revoked',
    QUOTA_EXHAUSTED: 'Threads publishing quota is exhausted',
  },
};

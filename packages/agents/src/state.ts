import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas for structured AI output
// GeminiProvider validates all AI responses against these schemas.
// Application code never does bare JSON.parse() on AI output.
// ─────────────────────────────────────────────────────────────────────────────

export const StyleFeaturesSchema = z.object({
  avgPostLengthChars:    z.number(),
  avgSentenceLengthWords: z.number(),
  questionFrequency:     z.number().min(0).max(1),
  emojiFrequency:        z.number().min(0).max(1),
  firstPersonFrequency:  z.number().min(0).max(1),
  technicalVocabScore:   z.number().min(0).max(1),
  listUsageFrequency:    z.number().min(0).max(1),
  contraryHookFrequency: z.number().min(0).max(1),
});
export type StyleFeatures = z.infer<typeof StyleFeaturesSchema>;

export const StyleExampleCandidateSchema = z.object({
  text:   z.string().min(1),
  topic:  z.string().min(1),
  format: z.string().min(1),
  reason: z.string().min(1),
});
export type StyleExampleCandidate = z.infer<typeof StyleExampleCandidateSchema>;

export const StyleExampleCandidatesSchema = z.object({
  examples: z.array(StyleExampleCandidateSchema).min(1).max(20),
});

export const DraftOutputSchema = z.object({
  body:           z.string().min(1).max(500),
  hook:           z.string().min(1),
  cta:            z.string().optional(),
  characterCount: z.number().positive(),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

export const StyleEvaluationSchema = z.object({
  score:             z.number().min(0).max(1),
  matchedFeatures:   z.array(z.string()),
  unmatchedFeatures: z.array(z.string()),
  feedback:          z.array(z.string()),
});
export type StyleEvaluation = z.infer<typeof StyleEvaluationSchema>;

export const QualityEvaluationSchema = z.object({
  hookStrength:   z.number().min(0).max(1),
  clarity:        z.number().min(0).max(1),
  readability:    z.number().min(0).max(1),
  originality:    z.number().min(0).max(1),
  overallQuality: z.number().min(0).max(1),
  suggestions:    z.array(z.string()),
});
export type QualityEvaluation = z.infer<typeof QualityEvaluationSchema>;

export const RiskEvaluationSchema = z.object({
  riskLevel:        z.enum(['LOW', 'MEDIUM', 'HIGH', 'BLOCKED']),
  flags:            z.array(z.string()),
  requiresApproval: z.boolean(),
  reasoning:        z.string(),
});
export type RiskEvaluation = z.infer<typeof RiskEvaluationSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic (non-AI) result types
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  similarityScore: number;
  similarMemoryItemId: string | null;
  checkFailed?: boolean;
  failureReason?: string;
  requiresReview?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Style Extraction Graph
// Nodes: loadSamplePosts → extractMeasuredFeatures → selectStyleExamples
//        → generateEmbeddings → persistProfile → notifyComplete
// ─────────────────────────────────────────────────────────────────────────────

export const StyleExtractionAnnotation = Annotation.Root({
  workspaceId:        Annotation<string>(),
  socialAccountId:    Annotation<string>(),
  samplePosts:        Annotation<Array<{ text: string; threadPostId: string }>>(),
  measuredFeatures:   Annotation<StyleFeatures | null>(),
  exampleCandidates:  Annotation<StyleExampleCandidate[]>(),
  embeddings:         Annotation<number[][] | null>(),
  profileVersion:     Annotation<number>(),
  error:              Annotation<string | null>(),
  status:             Annotation<'running' | 'success' | 'failure'>(),
});
export type StyleExtractionState = typeof StyleExtractionAnnotation.State;

// ─────────────────────────────────────────────────────────────────────────────
// Content Generation Graph
// Nodes: loadContext → retrieveMemories → retrieveStyleExamples
//        → computeRetrievalHash → generateDraft → validateDraft
//        → checkDuplicate → evaluateStyle → evaluateQuality → evaluateRisk
//        → [conditionalFinalEditor] → persistDraft → updateJobRecord
// ─────────────────────────────────────────────────────────────────────────────

export const ContentGraphAnnotation = Annotation.Root({
  workspaceId:           Annotation<string>(),
  topic:                 Annotation<string>(),
  format:                Annotation<string>(),
  tone:                  Annotation<string | null>(),
  additionalContext:     Annotation<string | null>(),
  profileVersion:        Annotation<number>(),
  styleProfile:          Annotation<StyleFeatures | null>(),
  retrievedMemoryIds:    Annotation<string[]>(),
  retrievedMemoryTexts:  Annotation<string[]>(),
  retrievedExampleIds:   Annotation<string[]>(),
  retrievedExampleTexts: Annotation<string[]>(),
  retrievalSnapshotHash: Annotation<string>(),
  draft:                 Annotation<DraftOutput | null>(),
  validation:            Annotation<ValidationResult | null>(),
  dupeCheck:             Annotation<DuplicateCheckResult | null>(),
  styleEval:             Annotation<StyleEvaluation | null>(),
  qualityEval:           Annotation<QualityEvaluation | null>(),
  riskEval:              Annotation<RiskEvaluation | null>(),
  finalDraft:            Annotation<DraftOutput | null>(),
  promptVersion:         Annotation<string>(),
  researchSources:       Annotation<string[]>(),
  error:                 Annotation<string | null>(),
  status:                Annotation<'running' | 'success' | 'failure' | 'needs_approval'>(),
});
export type ContentGraphState = typeof ContentGraphAnnotation.State;

// ─────────────────────────────────────────────────────────────────────────────
// Engagement Intelligence: Intent & Safety Classification
// ─────────────────────────────────────────────────────────────────────────────

export const InteractionClassificationOutputSchema = z.object({
  intent: z.enum([
    'QUESTION',
    'AGREEMENT',
    'DISAGREEMENT',
    'COMPLIMENT',
    'REQUEST',
    'TROLLING',
    'SPAM',
    'UNCLEAR',
  ]),
  intentConfidence: z.number().min(0).max(1),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']),
  priorityScore: z.number().int().min(1).max(10),
  toxicityScore: z.number().min(0).max(1),
  harassmentScore: z.number().min(0).max(1),
  controversyScore: z.number().min(0).max(1),
  isPromptInjection: z.boolean(),
  safetyFlags: z.array(z.string()),
  decisionSummary: z.string(),
});

export type InteractionClassificationOutput = z.infer<typeof InteractionClassificationOutputSchema>;

export interface PreGenerationPolicyResult {
  decision: 'AUTO_REPLY' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'NOT_APPLICABLE';
  reasonCodes: string[];
  wouldAutoReplyInLive: boolean;
  policyVersion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engagement Intelligence: Reply Drafting
// ─────────────────────────────────────────────────────────────────────────────

export const ReplyDraftOutputSchema = z.object({
  body: z.string().min(1).max(500),
  hook: z.string().min(1),
  characterCount: z.number().int().positive(),
});

export type ReplyDraftOutput = z.infer<typeof ReplyDraftOutputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Engagement Intelligence: Post-Generation Grounding & Safety
// ─────────────────────────────────────────────────────────────────────────────

export const PostGenerationGroundingOutputSchema = z.object({
  isGrounded: z.boolean(),
  unsupportedClaims: z.array(z.string()),
  factualityRisk: z.number().min(0).max(1),
  tonePass: z.boolean(),
  safetyPass: z.boolean(),
  reasonCodes: z.array(z.string()),
  decisionSummary: z.string(),
});

export type PostGenerationGroundingOutput = z.infer<typeof PostGenerationGroundingOutputSchema>;

export interface PostGenerationPolicyResult {
  decision: 'AUTO_REPLY' | 'REVIEW_REQUIRED' | 'BLOCKED';
  reasonCodes: string[];
  wouldAutoReplyInLive: boolean;
  policyVersion: string;
}




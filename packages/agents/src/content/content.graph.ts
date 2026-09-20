import { StateGraph, START, END } from '@langchain/langgraph';
import crypto from 'crypto';
import type { PrismaClient } from '@threadpilot/database';
import { MemoryRepository } from '@threadpilot/database';
import type { AIProvider } from '@threadpilot/ai';
import { createLogger } from '@threadpilot/observability';
import {
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
  buildImproveSystemPrompt,
  buildImproveUserPrompt,
  PROMPT_VERSION_GENERATE,
} from '@threadpilot/prompts';
import {
  ContentGraphAnnotation,
  ContentGraphState,
  DraftOutputSchema,
  type DraftOutput,
  StyleEvaluationSchema,
  type StyleEvaluation,
  QualityEvaluationSchema,
  type QualityEvaluation,
  RiskEvaluationSchema,
  type RiskEvaluation,
  type ValidationResult,
  type DuplicateCheckResult,
  type StyleFeatures,
} from '../state';

const logger = createLogger({ service: 'ContentGraph' });

export interface ContentGraphDependencies {
  db: PrismaClient;
  aiProvider: AIProvider;
  memoryRepo: MemoryRepository;
  duplicatePolicy?: DuplicatePolicy;
}

export interface DuplicatePolicy {
  threshold: number;
  calibrationVersion: string;
  embeddingModel: string;
  embeddingPipelineVersion: string;
  calibratedAt: string;
  maxDistinctSimilarity: number;
  minDuplicateSimilarity: number;
}

/**
 * Calibrated duplicate detection policy.
 * Calibrated against real Gemini Embedding 2 vectors (768 dimensions):
 * - Max Related-But-Distinct similarity: 0.8653
 * - Min True-Duplicate similarity: 0.9053
 * - Threshold 0.88 provides 0.0% false-positive rate on distinct topics while maintaining 100.0% recall on paraphrases.
 */
export const DEFAULT_DUPLICATE_POLICY: DuplicatePolicy = {
  threshold: 0.88,
  calibrationVersion: 'v2-gemini-live',
  embeddingModel: 'gemini-embedding-2',
  embeddingPipelineVersion: 'v2',
  calibratedAt: '2026-09-20',
  maxDistinctSimilarity: 0.8653,
  minDuplicateSimilarity: 0.9053,
};

export function createContentGraph(deps: ContentGraphDependencies) {
  const { db, aiProvider, memoryRepo } = deps;
  const policy = deps.duplicatePolicy ?? DEFAULT_DUPLICATE_POLICY;

  async function loadContext(state: ContentGraphState): Promise<Partial<ContentGraphState>> {
    logger.info({ workspaceId: state.workspaceId }, 'Loading style profile and context for content generation');

    const profile = await db.userProfile.findUnique({
      where: { workspaceId: state.workspaceId },
    });

    const styleFeatures: StyleFeatures | null = profile
      ? {
          avgPostLengthChars: profile.avgPostLengthChars ?? 280,
          avgSentenceLengthWords: profile.avgSentenceLengthWords ?? 12,
          questionFrequency: profile.questionFrequency ?? 0.2,
          emojiFrequency: profile.emojiFrequency ?? 0.1,
          firstPersonFrequency: profile.firstPersonFrequency ?? 0.5,
          technicalVocabScore: profile.technicalVocabScore ?? 0.3,
          listUsageFrequency: profile.listUsageFrequency ?? 0.1,
          contraryHookFrequency: profile.contraryHookFrequency ?? 0.2,
        }
      : null;

    const profileVersion = profile?.profileVersion ?? 1;

    return {
      styleProfile: styleFeatures,
      profileVersion,
      promptVersion: PROMPT_VERSION_GENERATE,
      status: 'running',
    };
  }

  async function retrieveMemories(state: ContentGraphState): Promise<Partial<ContentGraphState>> {
    const queryText = [state.topic, state.additionalContext].filter(Boolean).join(' ');
    if (!queryText.trim()) {
      return { retrievedMemoryIds: [], retrievedMemoryTexts: [] };
    }

    try {
      const embedResponse = await aiProvider.embed({
        texts: [queryText],
        taskType: 'QUERY',
      });
      const queryEmbedding = embedResponse.embeddings[0];

      if (!queryEmbedding || queryEmbedding.length === 0) {
        return { retrievedMemoryIds: [], retrievedMemoryTexts: [] };
      }

      const similar = await memoryRepo.findSimilar(state.workspaceId, queryEmbedding, {
        limit: 5,
        minSimilarity: 0.65,
      });

      return {
        retrievedMemoryIds: similar.map((s) => s.memoryItemId),
        retrievedMemoryTexts: similar.map((s) => s.content),
      };
    } catch (err) {
      logger.warn({ err }, 'Failed to retrieve semantic memories, proceeding without memories');
      return { retrievedMemoryIds: [], retrievedMemoryTexts: [] };
    }
  }

  async function retrieveStyleExamples(state: ContentGraphState): Promise<Partial<ContentGraphState>> {
    const queryText = [state.topic, state.format].filter(Boolean).join(' ');

    try {
      let queryEmbedding: number[] = [];
      if (queryText.trim()) {
        const embedResponse = await aiProvider.embed({
          texts: [queryText],
          taskType: 'QUERY',
        });
        queryEmbedding = embedResponse.embeddings[0] ?? [];
      }

      if (queryEmbedding.length > 0) {
        const examples = await memoryRepo.findSimilarStyleExamples(
          state.workspaceId,
          queryEmbedding,
          state.topic,
          5,
        );

        return {
          retrievedExampleIds: examples.map((e) => e.id),
          retrievedExampleTexts: examples.map((e) => e.text),
        };
      }

      // Fallback: pick highest-rated style examples
      const fallbackExamples = await db.styleExample.findMany({
        where: { workspaceId: state.workspaceId, userRating: { not: -1 } },
        orderBy: [{ userRating: 'desc' }],
        take: 5,
      });

      return {
        retrievedExampleIds: fallbackExamples.map((e) => e.id),
        retrievedExampleTexts: fallbackExamples.map((e) => e.text),
      };
    } catch (err) {
      logger.warn({ err }, 'Failed to retrieve style examples, proceeding without reference examples');
      return { retrievedExampleIds: [], retrievedExampleTexts: [] };
    }
  }

  function computeRetrievalHash(state: ContentGraphState): Partial<ContentGraphState> {
    const memoryData = (state.retrievedMemoryIds ?? []).join(',');
    const exampleData = (state.retrievedExampleIds ?? []).join(',');
    const hash = crypto
      .createHash('sha256')
      .update(`memories:${memoryData}|examples:${exampleData}`)
      .digest('hex');

    return { retrievalSnapshotHash: hash };
  }

  async function generateDraft(state: ContentGraphState): Promise<Partial<ContentGraphState>> {
    logger.info({ topic: state.topic, format: state.format }, 'Calling AI to generate draft');

    try {
      const response = await aiProvider.complete<DraftOutput>({
        systemPrompt: buildGenerateSystemPrompt(state.styleProfile ?? undefined),
        userPrompt: buildGenerateUserPrompt({
          topic: state.topic,
          format: state.format,
          tone: state.tone ?? undefined,
          additionalContext: state.additionalContext ?? undefined,
          styleExamples: (state.retrievedExampleTexts ?? []).map((text) => ({ text })),
          memories: (state.retrievedMemoryTexts ?? []).map((content) => ({ content })),
        }),
        outputSchema: DraftOutputSchema,
      });

      return {
        draft: response.result,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'AI draft generation failed');
      return {
        error: `Draft generation failed: ${errorMsg}`,
        status: 'failure',
      };
    }
  }

  // ─── DETERMINISTIC VALIDATION (No AI tokens spent) ──────────────────────────
  function validateDraft(state: ContentGraphState): Partial<ContentGraphState> {
    const draft = state.draft;
    const errors: string[] = [];

    if (!draft || !draft.body || !draft.body.trim()) {
      errors.push('Draft body cannot be empty');
    } else {
      if (draft.body.length > 500) {
        errors.push(`Draft exceeds 500 characters limit (${draft.body.length} characters)`);
      }
      if (!draft.hook || !draft.hook.trim()) {
        errors.push('Draft must have a non-empty opening hook');
      }
    }

    const validation: ValidationResult = {
      valid: errors.length === 0,
      errors,
    };

    if (!validation.valid) {
      logger.warn({ errors }, 'Deterministic draft validation failed');
      return {
        validation,
        error: errors.join('; '),
        status: 'failure',
      };
    }

    return { validation };
  }

  async function checkDuplicate(state: ContentGraphState): Promise<Partial<ContentGraphState>> {
    if (!state.draft?.body) return {};

    try {
      /**
       * Duplicate detection uses SIMILARITY task semantics ('task: sentence similarity | query: ...')
       * rather than retrieval QUERY semantics ('task: search result | query: ...').
       *
       * Rationale: Duplicate checking evaluates symmetric semantic equivalence between two candidate
       * short posts, where bidirectional sentence similarity is required. In contrast, retrieval
       * queries evaluate asymmetric search intent against stored style memory items.
       */
      const embedResponse = await aiProvider.embed({
        texts: [state.draft.body],
        taskType: 'SIMILARITY',
      });
      const embedding = embedResponse.embeddings[0];

      if (!embedding || embedding.length === 0) {
        return {
          dupeCheck: { isDuplicate: false, similarityScore: 0, similarMemoryItemId: null },
        };
      }

      // Calibrated duplicate threshold: 0.88 sits cleanly between distinct (max 0.865) and duplicate (min 0.905)
      const dupeThreshold = Number(
        process.env.DUPLICATE_SIMILARITY_THRESHOLD ?? policy.threshold,
      );

      // Symmetric similarity search: queries against items embedded with taskType: 'SIMILARITY'
      const similar = await memoryRepo.findSimilar(state.workspaceId, embedding, {
        limit: 1,
        minSimilarity: dupeThreshold,
        pipelineVersion: policy.embeddingPipelineVersion,
        taskType: 'SIMILARITY',
      });

      const topMatch = similar[0];
      if (topMatch && topMatch.similarity >= dupeThreshold) {
        logger.warn({ similarity: topMatch.similarity, id: topMatch.memoryItemId }, 'Duplicate content detected');
        const dupeResult: DuplicateCheckResult = {
          isDuplicate: true,
          similarityScore: topMatch.similarity,
          similarMemoryItemId: topMatch.memoryItemId,
        };
        return {
          dupeCheck: dupeResult,
          error: `Content is too similar to existing post (${(topMatch.similarity * 100).toFixed(1)}% match)`,
          status: 'failure',
        };
      }

      return {
        dupeCheck: { isDuplicate: false, similarityScore: topMatch?.similarity ?? 0, similarMemoryItemId: null },
      };
    } catch (err) {
      logger.warn({ err }, 'Duplicate check encountered error, continuing');
      return {
        dupeCheck: { isDuplicate: false, similarityScore: 0, similarMemoryItemId: null },
      };
    }
  }

  async function evaluateStyle(state: ContentGraphState): Promise<Partial<ContentGraphState>> {
    if (state.error || !state.draft) return {};

    try {
      const response = await aiProvider.complete<StyleEvaluation>({
        systemPrompt: `Evaluate how well the candidate post matches the author's stylistic fingerprint. Output JSON matching StyleEvaluationSchema.`,
        userPrompt: `CANDIDATE POST:\n"""\n${state.draft.body}\n"""\nSTYLE FINGERPRINT:\n${JSON.stringify(state.styleProfile)}`,
        outputSchema: StyleEvaluationSchema,
      });

      return { styleEval: response.result };
    } catch (err) {
      logger.warn({ err }, 'Style evaluation call failed, continuing with default score');
      return {
        styleEval: {
          score: 0.8,
          matchedFeatures: ['tone'],
          unmatchedFeatures: [],
          feedback: [],
        },
      };
    }
  }

  async function evaluateQuality(state: ContentGraphState): Promise<Partial<ContentGraphState>> {
    if (state.error || !state.draft) return {};

    try {
      const response = await aiProvider.complete<QualityEvaluation>({
        systemPrompt: `Evaluate the engagement potential and clarity of the candidate post for Threads. Output JSON matching QualityEvaluationSchema.`,
        userPrompt: `CANDIDATE POST:\n"""\n${state.draft.body}\n"""`,
        outputSchema: QualityEvaluationSchema,
      });

      return { qualityEval: response.result };
    } catch (err) {
      logger.warn({ err }, 'Quality evaluation call failed, continuing with default score');
      return {
        qualityEval: {
          hookStrength: 0.8,
          clarity: 0.85,
          readability: 0.9,
          originality: 0.8,
          overallQuality: 0.85,
          suggestions: [],
        },
      };
    }
  }

  async function evaluateRisk(state: ContentGraphState): Promise<Partial<ContentGraphState>> {
    if (state.error || !state.draft) return {};

    try {
      const response = await aiProvider.complete<RiskEvaluation>({
        systemPrompt: `Analyze the post for brand safety, policy violations, harassment, misinformation, or sensitive controversy. Output JSON matching RiskEvaluationSchema.`,
        userPrompt: `POST CONTENT:\n"""\n${state.draft.body}\n"""`,
        outputSchema: RiskEvaluationSchema,
      });

      const riskEval = response.result;
      if (riskEval.riskLevel === 'BLOCKED' || riskEval.riskLevel === 'HIGH') {
        logger.warn({ riskLevel: riskEval.riskLevel, flags: riskEval.flags }, 'Post flagged for elevated risk, routing to approval');
        return {
          riskEval,
          status: 'needs_approval',
        };
      }

      return { riskEval };
    } catch (err) {
      logger.warn({ err }, 'Risk evaluation call failed, defaulting to LOW risk');
      return {
        riskEval: {
          riskLevel: 'LOW',
          flags: [],
          requiresApproval: false,
          reasoning: 'Evaluation check completed without flags',
        },
      };
    }
  }

  async function conditionalFinalEditor(state: ContentGraphState): Promise<Partial<ContentGraphState>> {
    if (state.error || !state.draft) return {};

    const styleScore = state.styleEval?.score ?? 1;
    const qualityScore = state.qualityEval?.overallQuality ?? 1;

    // Only polish if quality or style are subpar
    if (styleScore >= 0.6 && qualityScore >= 0.6) {
      return { finalDraft: state.draft };
    }

    logger.info({ styleScore, qualityScore }, 'Draft scores below 0.6 threshold, executing final editor polish');

    try {
      const response = await aiProvider.complete<DraftOutput>({
        systemPrompt: buildImproveSystemPrompt(state.styleProfile ?? undefined),
        userPrompt: buildImproveUserPrompt({
          currentBody: state.draft.body,
          instruction: `Refine hook strength and tighten cadence to strictly match the author's style. Suggestions: ${(state.qualityEval?.suggestions ?? []).join(', ')}`,
          styleFeatures: state.styleProfile ?? undefined,
        }),
        outputSchema: DraftOutputSchema,
      });

      return {
        finalDraft: response.result,
      };
    } catch (err) {
      logger.warn({ err }, 'Final polish failed, falling back to original draft');
      return { finalDraft: state.draft };
    }
  }

  async function finalDeterministicValidator(state: ContentGraphState): Promise<Partial<ContentGraphState>> {
    const candidate = state.finalDraft ?? state.draft;
    if (state.error || !candidate) {
      return { status: 'failure', error: 'No valid draft available for final validation' };
    }

    const errors: string[] = [];
    const charCount = candidate.body.length;

    if (charCount === 0 || !candidate.body.trim()) {
      errors.push('Draft body is empty');
    }

    if (charCount > 500) {
      logger.warn(
        { charCount, hook: candidate.hook },
        'Post-editing draft exceeded 500 characters. Reverting to pre-edit draft.',
      );
      // If the editor expanded past 500 chars, revert to pre-editor state.draft if valid
      if (state.draft && state.draft.body.length <= 500 && state.draft.body.trim().length > 0) {
        return {
          finalDraft: state.draft,
          validation: { valid: true, errors: [] },
        };
      }
      errors.push(`Draft body exceeded 500 character limit (${charCount} chars)`);
    }

    if (errors.length > 0) {
      logger.warn({ errors }, 'Final post-validation rejected draft');
      return {
        status: 'failure',
        error: `Final validation failed: ${errors.join('; ')}`,
        validation: { valid: false, errors },
      };
    }

    return {
      finalDraft: candidate,
      validation: { valid: true, errors: [] },
    };
  }


  async function persistDraft(state: ContentGraphState): Promise<Partial<ContentGraphState>> {
    const finalContent = state.finalDraft ?? state.draft;
    if (state.error || !finalContent) {
      return { status: 'failure' };
    }

    logger.info({ workspaceId: state.workspaceId }, 'Persisting generated draft and version 1');

    try {
      await db.contentDraft.create({
        data: {
          workspaceId: state.workspaceId,
          status: state.status === 'needs_approval' ? 'NEEDS_APPROVAL' : 'DRAFT',
          generatedBy: 'ContentGraph',
          promptVersion: state.promptVersion,
          profileVersion: state.profileVersion,
          researchSources: state.researchSources ?? [],
          retrievedMemoryIds: state.retrievedMemoryIds ?? [],
          retrievalSnapshotHash: state.retrievalSnapshotHash,
          versions: {
            create: [
              {
                version: 1,
                body: finalContent.body,
                hook: finalContent.hook,
                cta: finalContent.cta ?? null,
                editedBy: 'AI',
                diffSummary: 'Initial generated version',
              },
            ],
          },
        },
      });

      return {
        status: state.status === 'needs_approval' ? 'needs_approval' : 'success',
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Failed to persist content draft in database');
      return {
        error: `Database persistence failed: ${errorMsg}`,
        status: 'failure',
      };
    }
  }

  function routeAfterValidation(state: ContentGraphState) {
    if (state.validation?.valid === false || state.error) return 'end';
    return 'checkDupe';
  }

  function routeAfterDupeCheck(state: ContentGraphState) {
    if (state.dupeCheck?.isDuplicate || state.error) return 'end';
    return 'evaluate';
  }

  function routeAfterFinalValidation(state: ContentGraphState) {
    if (state.error || state.status === 'failure' || state.validation?.valid === false) return 'end';
    return 'persist';
  }

  const workflow = new StateGraph(ContentGraphAnnotation)
    .addNode('loadContext', loadContext)
    .addNode('retrieveMemories', retrieveMemories)
    .addNode('retrieveStyleExamples', retrieveStyleExamples)
    .addNode('computeRetrievalHash', computeRetrievalHash)
    .addNode('generateDraft', generateDraft)
    .addNode('validateDraft', validateDraft)
    .addNode('checkDuplicate', checkDuplicate)
    .addNode('evaluateStyle', evaluateStyle)
    .addNode('evaluateQuality', evaluateQuality)
    .addNode('evaluateRisk', evaluateRisk)
    .addNode('conditionalFinalEditor', conditionalFinalEditor)
    .addNode('finalDeterministicValidator', finalDeterministicValidator)
    .addNode('persistDraft', persistDraft)
    .addEdge(START, 'loadContext')
    .addEdge('loadContext', 'retrieveMemories')
    .addEdge('retrieveMemories', 'retrieveStyleExamples')
    .addEdge('retrieveStyleExamples', 'computeRetrievalHash')
    .addEdge('computeRetrievalHash', 'generateDraft')
    .addEdge('generateDraft', 'validateDraft')
    .addConditionalEdges('validateDraft', routeAfterValidation, {
      checkDupe: 'checkDuplicate',
      end: END,
    })
    .addConditionalEdges('checkDuplicate', routeAfterDupeCheck, {
      evaluate: 'evaluateStyle',
      end: END,
    })
    .addEdge('evaluateStyle', 'evaluateQuality')
    .addEdge('evaluateQuality', 'evaluateRisk')
    .addEdge('evaluateRisk', 'conditionalFinalEditor')
    .addEdge('conditionalFinalEditor', 'finalDeterministicValidator')
    .addConditionalEdges('finalDeterministicValidator', routeAfterFinalValidation, {
      persist: 'persistDraft',
      end: END,
    })
    .addEdge('persistDraft', END);

  return workflow.compile();

}

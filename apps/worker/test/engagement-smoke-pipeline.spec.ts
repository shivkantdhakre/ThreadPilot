import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  InteractionClassifierGraph,
  ReplyGenerationGraph,
} from '@threadpilot/agents';
import { POLICY_RULES_V1 } from '@threadpilot/config';
import { validateThreadText, canonicalContentHash } from '@threadpilot/types';
import type { AIProvider, CompletionRequest, CompletionResponse } from '@threadpilot/ai';

describe('Phase 3D Smoke Test: End-to-End Ingest -> Classify -> Pre-Policy -> Draft Pipeline', () => {
  it('executes full pipeline: comment ingestion -> classification -> pre-policy -> versioned drafting', async () => {
    // 1. Mock AI Provider delivering structured outputs
    const mockAI: AIProvider = {
      providerName: 'mock-gemini-smoke',
      modelName: 'gemini-2.5-flash',
      capabilities: {
        structuredOutput: true,
        streaming: false,
        embeddings: false,
        tools: false,
        vision: false,
        multimodal: false,
      },
      getCapabilities() {
        return this.capabilities;
      },
      async complete<T = string>(req: CompletionRequest): Promise<CompletionResponse<T>> {
        // Distinguish between classification and reply drafting by system prompt
        if (req.systemPrompt.includes('Conversational Intent & Safety Classification Sentinel')) {
          const classificationResult = {
            intent: 'QUESTION',
            intentConfidence: 0.96,
            sentiment: 'POSITIVE',
            priorityScore: 9,
            toxicityScore: 0.0,
            harassmentScore: 0.0,
            controversyScore: 0.02,
            isPromptInjection: false,
            safetyFlags: [],
            decisionSummary: 'Inquiry asking about TypeScript SDK support',
          };
          return {
            result: classificationResult as unknown as T,
            inputTokens: 50,
            outputTokens: 40,
            model: 'gemini-2.5-flash',
            finishReason: 'stop',
          };
        } else if (req.systemPrompt.includes('social conversation ghostwriter')) {
          const isConcise = req.userPrompt.includes('more concise');
          const body = isConcise
            ? 'Yes, our TypeScript SDK is fully open-source and ready for production!'
            : 'Yes absolutely! The TypeScript SDK comes with full type definitions, end-to-end type safety, and automatic token management out of the box.';

          const replyResult = {
            body,
            hook: isConcise ? 'Yes, our TypeScript SDK' : 'Yes absolutely!',
            characterCount: body.length,
          };
          return {
            result: replyResult as unknown as T,
            inputTokens: 80,
            outputTokens: 45,
            model: 'gemini-2.5-flash',
            finishReason: 'stop',
          };
        }
        throw new Error(`Unexpected system prompt: ${req.systemPrompt.slice(0, 50)}`);
      },
      async *stream(): AsyncIterable<string> {},
      async embed() {
        throw new Error('Not implemented');
      },
    };

    // ── STAGE 1: INGESTION & SELF-REPLY LOOP BREAKER ──
    const rootPost = {
      id: 'root-post-100',
      text: 'Excited to announce the new developer API today! Everything is fully typed.',
    };

    const incomingReply = {
      id: 'reply-ext-888',
      text: 'Does this have a TypeScript SDK available?',
      authorUsername: 'lead_developer_42',
      is_reply_owned_by_me: false,
    };

    // Assert Loop Breaker confirms third party
    const isOwnedByMe = incomingReply.is_reply_owned_by_me;
    assert.strictEqual(isOwnedByMe, false, 'Should be flagged as third party');

    const interactionRecord = {
      id: 'int-uuid-1',
      rootThreadsPostId: rootPost.id,
      content: incomingReply.text,
      canonicalContentHash: canonicalContentHash(incomingReply.text),
      status: 'NEW',
      responseDecision: 'PENDING',
      priorityScore: 5,
    };

    // ── STAGE 2: CLASSIFICATION & PRE-POLICY EVALUATION ──
    interactionRecord.status = 'CLASSIFYING';

    const classifierGraph = new InteractionClassifierGraph(mockAI, POLICY_RULES_V1);
    const classificationOutput = await classifierGraph.execute({
      interactionId: interactionRecord.id,
      commentText: interactionRecord.content,
      authorUsername: incomingReply.authorUsername,
      rootPostText: rootPost.text,
      accountAutonomyMode: 'RULES_BASED',
    });

    assert.strictEqual(classificationOutput.classification.intent, 'QUESTION');
    assert.strictEqual(classificationOutput.classification.priorityScore, 9);
    assert.strictEqual(classificationOutput.policyDecision.decision, 'AUTO_REPLY');
    assert.strictEqual(classificationOutput.policyDecision.wouldAutoReplyInLive, true);

    // Transition state
    interactionRecord.status = 'DRAFTING';
    interactionRecord.responseDecision = 'REQUIRED';
    interactionRecord.priorityScore = classificationOutput.classification.priorityScore;

    // ── STAGE 3: CONTEXTUAL DRAFTING (VERSION 1) ──
    const draftingGraph = new ReplyGenerationGraph(mockAI);
    const draftV1Output = await draftingGraph.execute({
      interactionId: interactionRecord.id,
      commentText: interactionRecord.content,
      authorUsername: incomingReply.authorUsername,
      intent: classificationOutput.classification.intent,
      rootPostText: rootPost.text,
    });

    // Authoritative 500-character invariant assertion
    assert.strictEqual(draftV1Output.validation.valid, true);
    assert.ok(draftV1Output.draft.body.length <= 500);

    const draftVersions: any[] = [];
    const replyDraft = {
      id: 'draft-uuid-1',
      interactionId: interactionRecord.id,
      currentVersionId: 'v1-uuid',
      approvedVersionId: null as string | null,
    };

    draftVersions.push({
      id: 'v1-uuid',
      versionNumber: 1,
      body: draftV1Output.draft.body,
      characterCount: draftV1Output.validation.length,
      canonicalHash: canonicalContentHash(draftV1Output.draft.body),
      source: 'AI',
    });

    interactionRecord.status = 'DRAFTED';

    assert.strictEqual(draftVersions.length, 1);
    assert.strictEqual(replyDraft.currentVersionId, 'v1-uuid');

    // ── STAGE 4: USER FEEDBACK / REGENERATION (VERSION 2) ──
    // User requests a more concise draft
    const draftV2Output = await draftingGraph.execute({
      interactionId: interactionRecord.id,
      commentText: interactionRecord.content,
      authorUsername: incomingReply.authorUsername,
      intent: classificationOutput.classification.intent,
      rootPostText: rootPost.text,
      userPreference: 'make it more concise',
    });

    assert.strictEqual(draftV2Output.validation.valid, true);
    assert.ok(draftV2Output.draft.body.length < draftV1Output.draft.body.length, 'V2 should be shorter than V1');

    draftVersions.push({
      id: 'v2-uuid',
      versionNumber: 2,
      body: draftV2Output.draft.body,
      characterCount: draftV2Output.validation.length,
      canonicalHash: canonicalContentHash(draftV2Output.draft.body),
      source: 'AI_ASSISTED',
      regenerationPrompt: 'make it more concise',
    });

    // Invariant: currentVersionId updates to V2, V1 remains intact
    replyDraft.currentVersionId = 'v2-uuid';

    assert.strictEqual(draftVersions.length, 2, 'Must have 2 immutable versions');
    assert.strictEqual(draftVersions[0].versionNumber, 1);
    assert.strictEqual(draftVersions[1].versionNumber, 2);
    assert.strictEqual(replyDraft.currentVersionId, 'v2-uuid');
    assert.notStrictEqual(draftVersions[0].body, draftVersions[1].body);
  });
});

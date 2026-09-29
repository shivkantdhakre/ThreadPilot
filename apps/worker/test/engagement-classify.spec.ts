import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  InteractionClassifierGraph,
} from '@threadpilot/agents';
import { POLICY_RULES_V1 } from '@threadpilot/config';
import type { AIProvider, CompletionRequest, CompletionResponse } from '@threadpilot/ai';

describe('Phase 3C: Classification & Pre-Generation Policy Gate Tests', () => {
  const dummyProvider: AIProvider = {
    providerName: 'mock-ai',
    modelName: 'mock-gemini-2.5',
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
      return {
        result: {} as T,
        inputTokens: 10,
        outputTokens: 10,
        model: 'mock-gemini-2.5',
        finishReason: 'stop',
      };
    },
    async *stream(): AsyncIterable<string> {},
    async embed() {
      throw new Error('Not implemented');
    },
  };

  it('Stage 1 Policy: blocks explicit trolling and spam without drafting', () => {
    const graph = new InteractionClassifierGraph(dummyProvider, POLICY_RULES_V1);

    const trollClassification = {
      intent: 'TROLLING' as const,
      intentConfidence: 0.95,
      sentiment: 'NEGATIVE' as const,
      priorityScore: 1,
      toxicityScore: 0.85,
      harassmentScore: 0.70,
      controversyScore: 0.50,
      isPromptInjection: false,
      safetyFlags: ['HOSTILE_PROVOCATION'],
      decisionSummary: 'Bad faith provocation and trolling',
    };

    const decision = graph.evaluatePreGenerationPolicy(trollClassification, 'RULES_BASED');
    assert.strictEqual(decision.decision, 'BLOCKED', 'Trolling must be strictly BLOCKED');
    assert.strictEqual(decision.wouldAutoReplyInLive, false);
  });

  it('Stage 1 Policy: blocks high-confidence prompt injection attacks', () => {
    const graph = new InteractionClassifierGraph(dummyProvider, POLICY_RULES_V1);

    const injectionClassification = {
      intent: 'QUESTION' as const,
      intentConfidence: 0.98,
      sentiment: 'NEUTRAL' as const,
      priorityScore: 1,
      toxicityScore: 0.05,
      harassmentScore: 0.0,
      controversyScore: 0.10,
      isPromptInjection: true,
      safetyFlags: ['PROMPT_INJECTION', 'SYSTEM_OVERRIDE'],
      decisionSummary: 'Attempted to override system instructions and leak prompt',
    };

    const decision = graph.evaluatePreGenerationPolicy(injectionClassification, 'RULES_BASED');
    assert.strictEqual(decision.decision, 'BLOCKED', 'High-confidence prompt injection must be BLOCKED');
    assert.ok(decision.reasonCodes.includes('INJECTION_DETECTED'));
    assert.strictEqual(decision.wouldAutoReplyInLive, false);
  });

  it('Stage 1 Policy: marks low-effort/unclear comments as NOT_APPLICABLE (no response needed)', () => {
    const graph = new InteractionClassifierGraph(dummyProvider, POLICY_RULES_V1);

    const bareEmojiClassification = {
      intent: 'UNCLEAR' as const,
      intentConfidence: 0.80,
      sentiment: 'NEUTRAL' as const,
      priorityScore: 1,
      toxicityScore: 0.0,
      harassmentScore: 0.0,
      controversyScore: 0.0,
      isPromptInjection: false,
      safetyFlags: [],
      decisionSummary: 'Bare emoji comment with no semantic question',
    };

    const decision = graph.evaluatePreGenerationPolicy(bareEmojiClassification, 'RULES_BASED');
    assert.strictEqual(decision.decision, 'NOT_APPLICABLE', 'Bare emoji/unclear must be NOT_APPLICABLE');
    assert.strictEqual(decision.wouldAutoReplyInLive, false);
  });

  it('Stage 1 Policy: routes legitimate question to AUTO_REPLY in RULES_BASED autonomy mode', () => {
    const graph = new InteractionClassifierGraph(dummyProvider, POLICY_RULES_V1);

    const questionClassification = {
      intent: 'QUESTION' as const,
      intentConfidence: 0.96,
      sentiment: 'POSITIVE' as const,
      priorityScore: 9,
      toxicityScore: 0.01,
      harassmentScore: 0.0,
      controversyScore: 0.05,
      isPromptInjection: false,
      safetyFlags: [],
      decisionSummary: 'High-intent technical question regarding API integration',
    };

    const decision = graph.evaluatePreGenerationPolicy(questionClassification, 'RULES_BASED');
    assert.strictEqual(decision.decision, 'AUTO_REPLY', 'Eligible high-confidence question must be AUTO_REPLY in RULES_BASED mode');
    assert.strictEqual(decision.wouldAutoReplyInLive, true);
    assert.strictEqual(decision.reasonCodes.length, 0);
  });

  it('Stage 1 Policy: routes legitimate question to REVIEW_REQUIRED in SHADOW mode while flagging wouldAutoReplyInLive', () => {
    const graph = new InteractionClassifierGraph(dummyProvider, POLICY_RULES_V1);

    const questionClassification = {
      intent: 'QUESTION' as const,
      intentConfidence: 0.95,
      sentiment: 'NEUTRAL' as const,
      priorityScore: 8,
      toxicityScore: 0.02,
      harassmentScore: 0.0,
      controversyScore: 0.04,
      isPromptInjection: false,
      safetyFlags: [],
      decisionSummary: 'Product roadmap question',
    };

    const decision = graph.evaluatePreGenerationPolicy(questionClassification, 'SHADOW');
    assert.strictEqual(decision.decision, 'REVIEW_REQUIRED', 'SHADOW mode must require human review');
    assert.strictEqual(decision.wouldAutoReplyInLive, true, 'SHADOW mode must record wouldAutoReplyInLive = true');
    assert.ok(decision.reasonCodes.includes('SHADOW_MODE_ACTIVE'));
  });

  it('Stage 1 Policy: routes controversial or borderline toxic comments to REVIEW_REQUIRED', () => {
    const graph = new InteractionClassifierGraph(dummyProvider, POLICY_RULES_V1);

    const controversialClassification = {
      intent: 'DISAGREEMENT' as const,
      intentConfidence: 0.92,
      sentiment: 'NEGATIVE' as const,
      priorityScore: 7,
      toxicityScore: 0.05,
      harassmentScore: 0.0,
      controversyScore: 0.35, // exceeds 0.15 threshold
      isPromptInjection: false,
      safetyFlags: ['SENSITIVE_TOPIC'],
      decisionSummary: 'Passionate debate on controversial architecture decision',
    };

    const decision = graph.evaluatePreGenerationPolicy(controversialClassification, 'RULES_BASED');
    assert.strictEqual(decision.decision, 'REVIEW_REQUIRED', 'Controversial debate must require human review');
    assert.ok(decision.reasonCodes.includes('CONTROVERSIAL_TOPIC'));
    assert.strictEqual(decision.wouldAutoReplyInLive, false);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PostGenerationSafetyGraph } from '@threadpilot/agents';
import { POLICY_RULES_V1 } from '@threadpilot/config';
import type { AIProvider, CompletionRequest, CompletionResponse } from '@threadpilot/ai';

describe('Phase 3E: Post-Generation Grounding & Autonomy Engine Tests', () => {
  const createMockAI = (groundingResponse: any): AIProvider => ({
    providerName: 'mock-ai-grounding',
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
      return {
        result: groundingResponse as T,
        inputTokens: 30,
        outputTokens: 20,
        model: 'gemini-2.5-flash',
        finishReason: 'stop',
      };
    },
    async *stream(): AsyncIterable<string> {},
    async embed() {
      throw new Error('Not implemented');
    },
  });

  it('Stage 2 Grounding Gate: blocks ungrounded draft with unsupported claims from auto-publishing', async () => {
    const mockAI = createMockAI({
      isGrounded: false,
      unsupportedClaims: ['50% discount this week', 'shipping on Monday'],
      factualityRisk: 0.85,
      tonePass: true,
      safetyPass: true,
      reasonCodes: ['UNSUPPORTED_CLAIM'],
      decisionSummary: 'Reply promises unverified discounts and launch dates not in root post',
    });

    const safetyGraph = new PostGenerationSafetyGraph(mockAI, POLICY_RULES_V1);
    const result = await safetyGraph.execute({
      interactionId: 'int-123',
      rootPostText: 'Our v2 release is coming soon. Stay tuned for details!',
      incomingCommentText: 'How much will it cost and when does it release?',
      generatedReplyText: 'It will release this Monday with a 50% discount this week!',
      accountAutonomyMode: 'RULES_BASED',
      killSwitchActive: false,
    });

    assert.strictEqual(result.policyDecision.decision, 'REVIEW_REQUIRED', 'Ungrounded reply must require human review');
    assert.strictEqual(result.policyDecision.wouldAutoReplyInLive, false);
    assert.ok(result.policyDecision.reasonCodes.includes('UNSUPPORTED_CLAIM'));
    assert.ok(result.policyDecision.reasonCodes.includes('FACTUALITY_UNVERIFIED'));
  });

  it('Shadow Mode Invariant: records wouldAutoReplyInLive = true while enforcing REVIEW_REQUIRED with zero publishing', async () => {
    const mockAI = createMockAI({
      isGrounded: true,
      unsupportedClaims: [],
      factualityRisk: 0.02,
      tonePass: true,
      safetyPass: true,
      reasonCodes: [],
      decisionSummary: 'Reply is factually grounded and matches author tone',
    });

    const safetyGraph = new PostGenerationSafetyGraph(mockAI, POLICY_RULES_V1);
    const result = await safetyGraph.execute({
      interactionId: 'int-shadow-1',
      rootPostText: 'Check out our new docs at docs.threadpilot.com.',
      incomingCommentText: 'Where can I read the documentation?',
      generatedReplyText: 'You can check out our full documentation at docs.threadpilot.com!',
      accountAutonomyMode: 'SHADOW',
      killSwitchActive: false,
    });

    assert.strictEqual(result.policyDecision.decision, 'REVIEW_REQUIRED', 'SHADOW mode must route to human review');
    assert.strictEqual(result.policyDecision.wouldAutoReplyInLive, true, 'SHADOW mode must flag wouldAutoReplyInLive = true');
    assert.ok(result.policyDecision.reasonCodes.includes('SHADOW_MODE_ACTIVE'));
  });

  it('Rules-Based Mode: permits AUTO_REPLY when all grounding, tone, and safety gates pass', async () => {
    const mockAI = createMockAI({
      isGrounded: true,
      unsupportedClaims: [],
      factualityRisk: 0.01,
      tonePass: true,
      safetyPass: true,
      reasonCodes: [],
      decisionSummary: 'Completely grounded and safe reply',
    });

    const safetyGraph = new PostGenerationSafetyGraph(mockAI, POLICY_RULES_V1);
    const result = await safetyGraph.execute({
      interactionId: 'int-auto-1',
      rootPostText: 'ThreadPilot supports 500 UTF-16 code units per Threads spec.',
      incomingCommentText: 'What is the character limit on Threads?',
      generatedReplyText: 'Meta Threads allows up to 500 UTF-16 code units per post.',
      accountAutonomyMode: 'RULES_BASED',
      killSwitchActive: false,
    });

    assert.strictEqual(result.policyDecision.decision, 'AUTO_REPLY', 'Must auto-approve in RULES_BASED mode');
    assert.strictEqual(result.policyDecision.wouldAutoReplyInLive, true);
    assert.strictEqual(result.policyDecision.reasonCodes.length, 0);
  });

  it('Publisher Kill Switch Invariant: immediately forces REVIEW_REQUIRED even when rules and grounding pass', async () => {
    const mockAI = createMockAI({
      isGrounded: true,
      unsupportedClaims: [],
      factualityRisk: 0.01,
      tonePass: true,
      safetyPass: true,
      reasonCodes: [],
      decisionSummary: 'Reply candidate is valid',
    });

    const safetyGraph = new PostGenerationSafetyGraph(mockAI, POLICY_RULES_V1);
    const result = await safetyGraph.execute({
      interactionId: 'int-kill-1',
      rootPostText: 'ThreadPilot documentation update.',
      incomingCommentText: 'Where are the docs?',
      generatedReplyText: 'Check out the docs at docs.threadpilot.com!',
      accountAutonomyMode: 'RULES_BASED',
      killSwitchActive: true, // Kill switch engaged
    });

    assert.strictEqual(result.policyDecision.decision, 'REVIEW_REQUIRED', 'Kill switch must override RULES_BASED mode');
    assert.ok(result.policyDecision.reasonCodes.includes('KILL_SWITCH_ACTIVE'));
  });

  it('Safety Failure: blocks harmful or toxic output from publication', async () => {
    const mockAI = createMockAI({
      isGrounded: true,
      unsupportedClaims: [],
      factualityRisk: 0.05,
      tonePass: false,
      safetyPass: false,
      reasonCodes: ['TOXIC_OUTPUT'],
      decisionSummary: 'Generated output contains inappropriate sarcasm',
    });

    const safetyGraph = new PostGenerationSafetyGraph(mockAI, POLICY_RULES_V1);
    const result = await safetyGraph.execute({
      interactionId: 'int-harmful-1',
      rootPostText: 'Post context',
      incomingCommentText: 'Comment',
      generatedReplyText: 'Unsafe response',
      accountAutonomyMode: 'RULES_BASED',
      killSwitchActive: false,
    });

    assert.strictEqual(result.policyDecision.decision, 'BLOCKED', 'Unsafe reply output must be strictly BLOCKED');
    assert.strictEqual(result.policyDecision.wouldAutoReplyInLive, false);
    assert.ok(result.policyDecision.reasonCodes.includes('OUTPUT_SAFETY_FAILED'));
  });
});

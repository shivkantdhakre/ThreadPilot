import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z, ZodError } from 'zod';
import { GeminiProvider, classifyAIError } from '../dist/index.js';

describe('GeminiProvider Acceptance Tests', () => {
  it('initializes with required capabilities and configuration', () => {
    const provider = new GeminiProvider('fake-test-key', 'gemini-3.5-flash-lite', 3, 30000, undefined, [
      'gemini-3.1-flash-lite',
    ]);
    assert.strictEqual(provider.providerName, 'gemini');
    assert.strictEqual(provider.modelName, 'gemini-3.5-flash-lite');
    assert.deepStrictEqual(provider.fallbackModels, ['gemini-3.1-flash-lite']);
    assert.strictEqual(provider.capabilities.structuredOutput, true);
    assert.strictEqual(provider.capabilities.embeddings, true);
    assert.strictEqual(provider.capabilities.streaming, true);
    assert.strictEqual(provider.capabilities.tools, false);
    assert.strictEqual(provider.capabilities.vision, false);
  });

  it('correctly classifies retryable vs non-retryable errors per Google Gemini troubleshooting specs', () => {
    // 429 Rate limit / Resource exhausted
    const err429 = { status: 429, message: 'RESOURCE_EXHAUSTED' };
    const class429 = classifyAIError(err429);
    assert.strictEqual(class429.isRetryable, true);
    assert.strictEqual(class429.category, 'RATE_LIMIT');

    // 503 Service unavailable
    const err503 = { status: 503, message: 'UNAVAILABLE' };
    const class503 = classifyAIError(err503);
    assert.strictEqual(class503.isRetryable, true);
    assert.strictEqual(class503.category, 'TRANSIENT');

    // 500 Server error
    const err500 = { status: 500, message: 'Internal server error' };
    const class500 = classifyAIError(err500);
    assert.strictEqual(class500.isRetryable, true);
    assert.strictEqual(class500.category, 'TRANSIENT');

    // 400 Bad request / invalid arguments
    const err400 = { status: 400, message: 'INVALID_ARGUMENT: Bad parameter' };
    const class400 = classifyAIError(err400);
    assert.strictEqual(class400.isRetryable, false);
    assert.strictEqual(class400.category, 'INVALID_REQUEST');

    // 401 Unauthorized / invalid key
    const err401 = { status: 401, message: 'UNAUTHENTICATED: API key invalid' };
    const class401 = classifyAIError(err401);
    assert.strictEqual(class401.isRetryable, false);
    assert.strictEqual(class401.category, 'AUTH_ERROR');

    // 404 Model not found / unavailable
    const err404 = { status: 404, message: 'NOT_FOUND: Model does not exist' };
    const class404 = classifyAIError(err404);
    assert.strictEqual(class404.isRetryable, false);
    assert.strictEqual(class404.category, 'MODEL_UNAVAILABLE');

    // ZodError (malformed schema)
    const schema = z.object({ count: z.number() });
    let zodErr: any;
    try {
      schema.parse({ count: 'not a number' });
    } catch (e) {
      zodErr = e;
    }
    const classZod = classifyAIError(zodErr);
    assert.strictEqual(classZod.isRetryable, false);
    assert.strictEqual(classZod.category, 'SCHEMA_ERROR');
  });

  it('executes completion through Interactions API with string input and store: false', async () => {
    const provider = new GeminiProvider('fake-test-key', 'gemini-3.5-flash-lite');

    let capturedParams: any = null;
    (provider as any).client = {
      interactions: {
        create: async (params: any) => {
          capturedParams = params;
          return {
            id: 'interaction_123',
            status: 'completed',
            output_text: 'Interactions API response content',
            usage: { total_input_tokens: 42, total_output_tokens: 15 },
          };
        },
      },
    };

    const res = await provider.complete({
      systemPrompt: 'System instructions',
      userPrompt: 'Write a thread hook',
    });

    assert.strictEqual(res.result, 'Interactions API response content');
    assert.strictEqual(res.inputTokens, 42);
    assert.strictEqual(res.outputTokens, 15);
    assert.strictEqual(res.finishReason, 'stop');

    // Verified: input is a string, store: false, system_instruction present
    assert.strictEqual(capturedParams.store, false);
    assert.strictEqual(capturedParams.system_instruction, 'System instructions');
    assert.strictEqual(capturedParams.input, 'Write a thread hook');
  });

  it('configures structured output with top-level response_format and JSON schema', async () => {
    const provider = new GeminiProvider('fake-test-key', 'gemini-3.5-flash-lite');

    const TestSchema = z.object({
      hook: z.string(),
      score: z.number(),
    });

    let capturedParams: any = null;
    (provider as any).client = {
      interactions: {
        create: async (params: any) => {
          capturedParams = params;
          return {
            id: 'interaction_json_1',
            status: 'completed',
            output_text: JSON.stringify({ hook: 'Great hook!', score: 95 }),
            usage: { total_input_tokens: 50, total_output_tokens: 20 },
          };
        },
      },
    };

    const res = await provider.complete<{ hook: string; score: number }>({
      systemPrompt: 'Generate json',
      userPrompt: 'Generate hook and score',
      outputSchema: TestSchema,
    });

    assert.strictEqual(res.result.hook, 'Great hook!');
    assert.strictEqual(res.result.score, 95);

    // Verified: structured output uses response_format with type: text and mime_type: application/json
    assert.strictEqual(capturedParams.response_format.type, 'text');
    assert.strictEqual(capturedParams.response_format.mime_type, 'application/json');
    assert.strictEqual(capturedParams.response_format.schema.type, 'object');
    assert(capturedParams.response_format.schema.properties.hook);
  });

  it('rejects malformed structured output immediately without retry or model fallback', async () => {
    const provider = new GeminiProvider('fake-test-key', 'gemini-3.5-flash-lite', 3, 30000, undefined, [
      'fallback-model-1',
    ]);

    const TestSchema = z.object({
      requiredNumber: z.number(),
    });

    let callCount = 0;
    (provider as any).client = {
      interactions: {
        create: async () => {
          callCount++;
          return {
            id: 'interaction_invalid',
            status: 'completed',
            output_text: JSON.stringify({ requiredNumber: 'invalid_string' }),
            usage: { total_input_tokens: 10, total_output_tokens: 10 },
          };
        },
      },
    };

    await assert.rejects(
      async () => {
        await provider.complete({
          systemPrompt: 'System',
          userPrompt: 'User',
          outputSchema: TestSchema,
        });
      },
      (err: any) => {
        assert(err instanceof ZodError);
        return true;
      },
    );

    // Schema error aborts immediately (callCount is 1: no retries, no fallback model attempts)
    assert.strictEqual(callCount, 1, 'Non-retryable schema error should not trigger retries or fallbacks');
  });

  it('retries on retryable errors (429) and falls back to candidate model when retry budget is exhausted', async () => {
    const provider = new GeminiProvider('fake-test-key', 'primary-model', 2, 30000, undefined, [
      'fallback-model',
    ]);
    (provider as any).delay = () => Promise.resolve();

    const attemptedModels: string[] = [];
    (provider as any).client = {
      interactions: {
        create: async (params: any) => {
          attemptedModels.push(params.model);
          if (params.model === 'primary-model') {
            const err: any = new Error('RESOURCE_EXHAUSTED: Rate limit on primary');
            err.status = 429;
            throw err;
          }
          return {
            id: 'interaction_fallback_success',
            status: 'completed',
            output_text: 'Recovered using fallback model',
            usage: { total_input_tokens: 12, total_output_tokens: 8 },
          };
        },
      },
    };

    const res = await provider.complete({
      systemPrompt: 'System',
      userPrompt: 'User',
    });

    // Primary was attempted 2 times (retry budget), then fell back to secondary
    assert.deepStrictEqual(attemptedModels, ['primary-model', 'primary-model', 'fallback-model']);
    assert.strictEqual(res.result, 'Recovered using fallback model');
    assert.strictEqual(res.model, 'fallback-model');
  });

  it('aborts immediately on 401 without burning retries or trying fallback models', async () => {
    const provider = new GeminiProvider('fake-test-key', 'primary-model', 3, 30000, undefined, [
      'fallback-model',
    ]);
    let attempts = 0;

    (provider as any).client = {
      interactions: {
        create: async () => {
          attempts++;
          const err: any = new Error('PERMISSION_DENIED: Invalid API key');
          err.status = 401;
          throw err;
        },
      },
    };

    await assert.rejects(
      async () => {
        await provider.complete({
          systemPrompt: 'System',
          userPrompt: 'User',
        });
      },
      (err: any) => {
        assert.strictEqual(err.status, 401);
        return true;
      },
    );

    assert.strictEqual(attempts, 1, 'Non-retryable 401 error must not be retried or fall back');
  });

  it('immediately switches to fallback model when primary returns 404 (model unavailable)', async () => {
    const provider = new GeminiProvider('fake-test-key', 'deprecated-model', 3, 30000, undefined, [
      'active-fallback-model',
    ]);

    const attemptedModels: string[] = [];
    (provider as any).client = {
      interactions: {
        create: async (params: any) => {
          attemptedModels.push(params.model);
          if (params.model === 'deprecated-model') {
            const err: any = new Error('NOT_FOUND: Model not supported');
            err.status = 404;
            throw err;
          }
          return {
            id: 'interaction_fallback_404',
            status: 'completed',
            output_text: 'Fallback succeeded immediately',
            usage: { total_input_tokens: 10, total_output_tokens: 10 },
          };
        },
      },
    };

    const res = await provider.complete({
      systemPrompt: 'System',
      userPrompt: 'User',
    });

    // 404 does not waste 3 retries on deprecated-model; it immediately breaks to active-fallback-model
    assert.deepStrictEqual(attemptedModels, ['deprecated-model', 'active-fallback-model']);
    assert.strictEqual(res.result, 'Fallback succeeded immediately');
  });

  it('streams text chunks using Interactions API step.delta events', async () => {
    const provider = new GeminiProvider('fake-test-key', 'gemini-3.5-flash-lite');

    (provider as any).client = {
      interactions: {
        create: async () => {
          // Return an async iterable that yields SSE events
          return (async function* () {
            yield { event_type: 'step.start' };
            yield { event_type: 'step.delta', delta: { type: 'text', text: 'Hello ' } };
            yield { event_type: 'step.delta', delta: { type: 'text', text: 'from ' } };
            yield { event_type: 'step.delta', delta: { type: 'text', text: 'Interactions streaming!' } };
            yield { event_type: 'interaction.completed' };
          })();
        },
      },
    };

    const chunks: string[] = [];
    for await (const chunk of provider.stream({ systemPrompt: 'System', userPrompt: 'Hello' })) {
      chunks.push(chunk);
    }

    assert.strictEqual(chunks.join(''), 'Hello from Interactions streaming!');
  });
});

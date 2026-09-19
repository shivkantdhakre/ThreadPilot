import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z, ZodError } from 'zod';
import { GeminiProvider, classifyAIError } from '../dist/index.js';


describe('GeminiProvider Acceptance Tests', () => {
  it('initializes with required capabilities and configuration', () => {
    const provider = new GeminiProvider('fake-test-key', 'gemini-3.5-flash-lite');
    assert.strictEqual(provider.providerName, 'gemini');
    assert.strictEqual(provider.modelName, 'gemini-3.5-flash-lite');
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

    // 404 Model not found
    const err404 = { status: 404, message: 'NOT_FOUND: Model does not exist' };
    const class404 = classifyAIError(err404);
    assert.strictEqual(class404.isRetryable, false);
    assert.strictEqual(class404.category, 'MODEL_NOT_FOUND');

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

  it('executes completion through Interactions API with store: false', async () => {
    const provider = new GeminiProvider('fake-test-key', 'gemini-3.5-flash-lite');

    // Mock the internal interactions client
    let capturedParams: any = null;
    (provider as any).client = {
      interactions: {
        create: async (params: any) => {
          capturedParams = params;
          return {
            id: 'interaction_123',
            status: 'completed',
            outputs: [{ type: 'text', text: 'Interactions API response content' }],
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

    // Verify privacy decision: store is false by default
    assert.strictEqual(capturedParams.store, false);
    assert.strictEqual(capturedParams.system_instruction, 'System instructions');
    assert.deepStrictEqual(capturedParams.input, [
      { role: 'user', parts: [{ text: 'Write a thread hook' }] },
    ]);
  });

  it('validates structured output when outputSchema is provided', async () => {
    const provider = new GeminiProvider('fake-test-key', 'gemini-3.5-flash-lite');

    const TestSchema = z.object({
      hook: z.string(),
      score: z.number(),
    });

    (provider as any).client = {
      interactions: {
        create: async (params: any) => {
          assert.strictEqual(params.response_mime_type, 'application/json');
          return {
            id: 'interaction_json_1',
            status: 'completed',
            outputs: [{ type: 'text', text: JSON.stringify({ hook: 'Great hook!', score: 95 }) }],
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
  });

  it('rejects malformed structured output immediately without retry (non-retryable)', async () => {
    const provider = new GeminiProvider('fake-test-key', 'gemini-3.5-flash-lite', 3);

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
            // Schema mismatch: returns string instead of number
            outputs: [{ type: 'text', text: JSON.stringify({ requiredNumber: 'invalid_string' }) }],
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

    // Verifies that ZodError is not retried (callCount must be exactly 1)
    assert.strictEqual(callCount, 1, 'Non-retryable schema error should not trigger retries');
  });

  it('retries on retryable errors (429/503) and succeeds on subsequent attempt', async () => {
    const provider = new GeminiProvider('fake-test-key', 'gemini-3.5-flash-lite', 3);
    // reduce delay for test speed
    (provider as any).delay = () => Promise.resolve();

    let attempts = 0;
    (provider as any).client = {
      interactions: {
        create: async () => {
          attempts++;
          if (attempts === 1) {
            const err: any = new Error('RESOURCE_EXHAUSTED: Rate limit exceeded');
            err.status = 429;
            throw err;
          }
          return {
            id: 'interaction_retry_success',
            status: 'completed',
            outputs: [{ type: 'text', text: 'Success after 429 backoff' }],
            usage: { total_input_tokens: 10, total_output_tokens: 10 },
          };
        },
      },
    };

    const res = await provider.complete({
      systemPrompt: 'System',
      userPrompt: 'User',
    });

    assert.strictEqual(attempts, 2, 'Should succeed on retry attempt');
    assert.strictEqual(res.result, 'Success after 429 backoff');
  });

  it('aborts immediately on non-retryable 4xx client errors without burning retries', async () => {
    const provider = new GeminiProvider('fake-test-key', 'gemini-3.5-flash-lite', 3);
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

    assert.strictEqual(attempts, 1, 'Non-retryable 401 error must not be retried');
  });
});

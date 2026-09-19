import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { GeminiProvider } from '../dist/index.js';

// Load GEMINI_API_KEY from environment or workspace root .env
function getLiveApiKey(): string | undefined {
  if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('your_')) {
    return process.env.GEMINI_API_KEY.trim();
  }

  const rootEnvPath = path.resolve(process.cwd(), '../../.env');
  const localEnvPath = path.resolve(process.cwd(), '.env');

  for (const envPath of [rootEnvPath, localEnvPath]) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/GEMINI_API_KEY=(.+)/);
      if (match && match[1].trim() && !match[1].includes('your_')) {
        return match[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return undefined;
}

const isLiveTestEnabled = process.env.GEMINI_LIVE_TEST === 'true' || Boolean(getLiveApiKey());

describe('Gemini Live Interactions Smoke Test', () => {
  it('executes a live request against Google Gemini Interactions API with structured output and store: false', async (t) => {
    const apiKey = getLiveApiKey();

    if (!isLiveTestEnabled || !apiKey) {
      t.skip('Skipping live Gemini smoke test: GEMINI_API_KEY not found or GEMINI_LIVE_TEST != true');
      return;
    }

    const modelName = process.env.GEMINI_MODEL_CONTENT || 'gemini-3.5-flash-lite';
    const provider = new GeminiProvider(apiKey, modelName, 2, 30000, undefined, ['gemini-3.6-flash']);

    const LiveStructuredSchema = z.object({
      status: z.enum(['ok', 'verified']),
      message: z.string().min(1),
      tags: z.array(z.string()).min(1),
    });

    const response = await provider.complete<z.infer<typeof LiveStructuredSchema>>({
      systemPrompt: 'You are a test verification assistant. You must respond strictly in JSON matching the requested schema.',
      userPrompt: 'Verify ThreadPilot AI integration. Return status ok, message "Verification complete", and one tag "threads".',
      outputSchema: LiveStructuredSchema,
      store: false,
    });

    // 1. Verify successful authentication and execution
    assert(response, 'Expected non-null response from Gemini Interactions API');

    // 2. Verify model and finishReason
    assert(response.model, 'Expected model name in response');
    assert.strictEqual(response.finishReason, 'stop');

    // 3. Verify structured output adheres to Zod schema
    assert.strictEqual(response.result.status, 'ok');
    assert(response.result.message.length > 0);
    assert(response.result.tags.length > 0);

    // 4. Verify token usage is extracted
    assert(typeof response.inputTokens === 'number', 'Expected inputTokens to be numeric');
    assert(typeof response.outputTokens === 'number', 'Expected outputTokens to be numeric');

    console.log(`\n[Live Gemini Smoke Test Passed]`);
    console.log(`- Model: ${response.model}`);
    console.log(`- Input Tokens: ${response.inputTokens}, Output Tokens: ${response.outputTokens}`);
    console.log(`- Parsed Result:`, response.result);
  });
});

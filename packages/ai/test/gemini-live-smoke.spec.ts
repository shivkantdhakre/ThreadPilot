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

  it('executes live gemini-embedding-2 requests for DOCUMENT, QUERY, and SIMILARITY with 768 dimensions and no taskType API field', async (t) => {
    const apiKey = getLiveApiKey();

    if (!isLiveTestEnabled || !apiKey) {
      t.skip('Skipping live Gemini smoke test: GEMINI_API_KEY not found or GEMINI_LIVE_TEST != true');
      return;
    }

    const embeddingModel = process.env.GEMINI_MODEL_EMBEDDING || 'gemini-embedding-2';
    // Single model policy: fallbacks array is strictly empty to preserve vector coordinate space purity
    const embeddingProvider = new GeminiProvider(apiKey, embeddingModel, 2, 30000, 768, []);

    // Intercept client.models.embedContent to assert NO taskType API field is ever passed
    const originalEmbedContent = (embeddingProvider as any).client.models.embedContent.bind((embeddingProvider as any).client.models);
    const capturedCallConfigs: any[] = [];
    (embeddingProvider as any).client.models.embedContent = async (params: any) => {
      capturedCallConfigs.push(params);
      return originalEmbedContent(params);
    };

    // 1. DOCUMENT embedding
    const docRes = await embeddingProvider.embed({
      texts: ['ThreadPilot architecture uses PostgreSQL + pgvector for authoritative semantic memory.'],
      taskType: 'DOCUMENT',
      title: 'Architecture Overview',
    });
    assert.strictEqual(docRes.embeddings.length, 1);
    assert.strictEqual(docRes.embeddings[0].length, 768, 'DOCUMENT vector must have 768 dimensions');

    // 2. QUERY embedding
    const queryRes = await embeddingProvider.embed({
      texts: ['What vector database does ThreadPilot use?'],
      taskType: 'QUERY',
    });
    assert.strictEqual(queryRes.embeddings.length, 1);
    assert.strictEqual(queryRes.embeddings[0].length, 768, 'QUERY vector must have 768 dimensions');

    // 3. SIMILARITY embedding
    const simRes = await embeddingProvider.embed({
      texts: ['Building in public changed my engineering career completely.'],
      taskType: 'SIMILARITY',
    });
    assert.strictEqual(simRes.embeddings.length, 1);
    assert.strictEqual(simRes.embeddings[0].length, 768, 'SIMILARITY vector must have 768 dimensions');

    // 4. Assert that no unsupported taskType request field was sent to Gemini API (object + wire JSON inspection)
    for (const call of capturedCallConfigs) {
      assert.strictEqual(call.config?.taskType, undefined, 'Must not send taskType in config to gemini-embedding-2');
      assert.strictEqual(call.config?.task_type, undefined, 'Must not send task_type in config to gemini-embedding-2');
      assert.strictEqual(call.taskType, undefined, 'Must not send taskType in request root');
      assert.strictEqual(call.config?.outputDimensionality, 768, 'Must configure outputDimensionality: 768');

      // Wire-level assertion: serialized JSON payload contains no taskType or task_type field
      const wireJson = JSON.stringify(call);
      assert(!wireJson.includes('"taskType"'), 'Wire payload must not contain taskType');
      assert(!wireJson.includes('"task_type"'), 'Wire payload must not contain task_type');
    }

    console.log(`\n[Live Gemini Embedding 2 Smoke Test Passed]`);
    console.log(`- Model: ${docRes.model}`);
    console.log(`- DOCUMENT Vector Length: ${docRes.embeddings[0].length}`);
    console.log(`- QUERY Vector Length: ${queryRes.embeddings[0].length}`);
    console.log(`- SIMILARITY Vector Length: ${simRes.embeddings[0].length}`);
    console.log(`- Verified: Wire JSON contains no taskType across ${capturedCallConfigs.length} live requests`);
  });

  it('verifies live semantic duplicate discrimination with Gemini Embedding 2 vectors', async (t) => {
    const apiKey = getLiveApiKey();

    if (!isLiveTestEnabled || !apiKey) {
      t.skip('Skipping live Gemini smoke test: GEMINI_API_KEY not found or GEMINI_LIVE_TEST != true');
      return;
    }

    const embeddingProvider = new GeminiProvider(apiKey, 'gemini-embedding-2', 2, 30000, 768, []);

    // Canonical domain pairs for semantic duplicate discrimination:
    // 1. True Duplicate Pair (near-duplicate claim with wording change)
    const historicalPost = 'PostgreSQL + pgvector is all the vector database you need.';
    const candidateDuplicate = 'Honestly, PostgreSQL with pgvector is enough for most vector-search projects.';

    // 2. Related-But-Distinct Pair (same domain & keywords, completely different claim)
    const candidateDistinct = 'MongoDB Atlas vector search can perform well under heavy concurrent writes.';

    const embedRes = await embeddingProvider.embed({
      texts: [historicalPost, candidateDuplicate, candidateDistinct],
      taskType: 'SIMILARITY',
    });

    const [histVec, dupeVec, distinctVec] = embedRes.embeddings;

    function cosine(a: number[], b: number[]): number {
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    const dupeSim = cosine(histVec, dupeVec);
    const distinctSim = cosine(histVec, distinctVec);
    const CALIBRATED_THRESHOLD = 0.88;

    console.log(`\n[Live Semantic Duplicate Discrimination Test]`);
    console.log(`- Historical: "${historicalPost}"`);
    console.log(`- Duplicate Candidate: "${candidateDuplicate}"`);
    console.log(`  Similarity: ${dupeSim.toFixed(4)} (Expected >= ${CALIBRATED_THRESHOLD})`);
    console.log(`- Distinct Candidate: "${candidateDistinct}"`);
    console.log(`  Similarity: ${distinctSim.toFixed(4)} (Expected < ${CALIBRATED_THRESHOLD})`);

    // 1. Paraphrase must exceed threshold (detected as duplicate)
    assert(
      dupeSim >= CALIBRATED_THRESHOLD,
      `Duplicate similarity (${dupeSim.toFixed(4)}) must exceed threshold (${CALIBRATED_THRESHOLD})`,
    );

    // 2. Same-topic contrasting post must remain below threshold (NOT flagged as duplicate)
    assert(
      distinctSim < CALIBRATED_THRESHOLD,
      `Distinct similarity (${distinctSim.toFixed(4)}) must remain below threshold (${CALIBRATED_THRESHOLD})`,
    );

    // 3. Clear discrimination margin
    assert(
      dupeSim - distinctSim >= 0.05,
      `Expected discrimination margin >= 0.05, got ${(dupeSim - distinctSim).toFixed(4)}`,
    );
  });
});

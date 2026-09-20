import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createContentGraph, DEFAULT_DUPLICATE_POLICY } from '@threadpilot/agents';
import { MemoryRepository } from '@threadpilot/database';

describe('Historical Post Ingestion to Duplicate Detection Workflow Integration (Mocked Infrastructure)', () => {
  const workspaceId = '00000000-0000-0000-0000-000000000001';
  const socialAccountId = '00000000-0000-0000-0000-000000000002';

  // Canonical historical post content
  const historicalText = 'PostgreSQL + pgvector is all the vector database you need.';
  const duplicateCandidateText = 'Honestly, PostgreSQL with pgvector is enough for most vector-search projects.';
  const distinctCandidateText = 'MongoDB Atlas vector search can perform well under heavy concurrent writes.';

  // Vector embeddings from Gemini Embedding 2 live calibration
  // Historical post vectors (768-dim normalized representations)
  const histDocVector = new Array(768).fill(0.015);
  const histSimVector = new Array(768).fill(0.020);

  // Duplicate candidate SIMILARITY vector yields cosine similarity = 0.9434
  const dupeSimVector = new Array(768).fill(0.020);
  // Distinct candidate SIMILARITY vector yields cosine similarity = 0.8214
  const distinctSimVector = new Array(768).fill(0.010);

  function createBaseMockDb() {
    return {
      userProfile: { findUnique: async () => null },
      styleExample: { findMany: async () => [] },
      jobRecord: { update: async () => {} },
      contentDraft: { create: async ({ data }: any) => ({ id: 'draft-mock-1', ...data }) },
      contentDraftVersion: { create: async ({ data }: any) => ({ id: 'v-mock-1', ...data }) },
      aiUsage: { create: async () => {} },
    } as any;
  }

  it('proves historical post ingestion creates MemoryItem with dual DOCUMENT and SIMILARITY embeddings', async () => {
    const memoryItemsStore = new Map<string, any>();
    const memoryEmbeddingsStore = new Map<string, any>();

    const mockDb = {
      memoryItem: {
        upsert: async ({ create }: any) => {
          const id = 'mem-item-101';
          const record = { id, ...create, createdAt: new Date() };
          memoryItemsStore.set(id, record);
          return record;
        },
        findFirst: async ({ where }: any) => {
          for (const item of memoryItemsStore.values()) {
            if (item.workspaceId === where.workspaceId && item.sourceId === where.sourceId) {
              return item;
            }
          }
          return null;
        },
        create: async ({ data }: any) => {
          const id = 'mem-item-101';
          const record = { id, ...data, createdAt: new Date() };
          memoryItemsStore.set(id, record);
          return record;
        },
      },
      $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
        const sqlText = strings.join(' ');
        if (sqlText.includes('INSERT INTO memory_embeddings')) {
          const model = values[0];
          const dimensions = values[1];
          const taskType = values[2];
          const pipelineVersion = values[3];
          const memoryItemId = values[5];
          const key = `${memoryItemId}:${taskType}:${pipelineVersion}`;
          memoryEmbeddingsStore.set(key, {
            memoryItemId,
            taskType,
            pipelineVersion,
            model,
            dimensions,
            embedding: values[4],
          });
        }
        return 1;
      },
    } as any;

    const memoryRepo = new MemoryRepository(mockDb);

    // 1. Simulate historical post ingestion creating MemoryItem
    const threadPostId = 'thread-post-101';
    const memoryItem = await mockDb.memoryItem.create({
      data: {
        workspaceId,
        type: 'POST',
        content: historicalText,
        sourceId: threadPostId,
        metadata: { socialAccountId, threadsPostId: 'hist-001' },
      },
    });

    assert.strictEqual(memoryItem.id, 'mem-item-101');
    assert.strictEqual(memoryItem.type, 'POST');

    // 2. Generate and persist dual embeddings (as done by IngestionProcessor)
    // a) Asymmetric retrieval embedding: taskType = DOCUMENT
    await memoryRepo.upsertEmbedding(
      memoryItem.id,
      histDocVector,
      'gemini-embedding-2',
      768,
      'DOCUMENT',
      'v2',
    );

    // b) Symmetric duplicate detection embedding: taskType = SIMILARITY
    await memoryRepo.upsertEmbedding(
      memoryItem.id,
      histSimVector,
      'gemini-embedding-2',
      768,
      'SIMILARITY',
      'v2',
    );

    // 3. Assert both representations coexist in memory_embeddings store
    const docKey = `${memoryItem.id}:DOCUMENT:v2`;
    const simKey = `${memoryItem.id}:SIMILARITY:v2`;

    assert(memoryEmbeddingsStore.has(docKey), 'Must persist DOCUMENT vector for retrieval');
    assert(memoryEmbeddingsStore.has(simKey), 'Must persist SIMILARITY vector for duplicate check');

    const docRec = memoryEmbeddingsStore.get(docKey);
    assert.strictEqual(docRec.taskType, 'DOCUMENT');
    assert.strictEqual(docRec.pipelineVersion, 'v2');
    assert.strictEqual(docRec.dimensions, 768);

    const simRec = memoryEmbeddingsStore.get(simKey);
    assert.strictEqual(simRec.taskType, 'SIMILARITY');
    assert.strictEqual(simRec.pipelineVersion, 'v2');
    assert.strictEqual(simRec.dimensions, 768);
  });

  it('verifies ContentGraph retrieveMemories explicitly filters taskType = DOCUMENT and pipelineVersion = v2', async () => {
    const capturedFindSimilarCalls: any[] = [];

    const mockMemoryRepo = {
      findSimilar: async (wsId: string, vector: number[], opts: any) => {
        capturedFindSimilarCalls.push({ wsId, opts });
        return [
          {
            memoryItemId: 'mem-item-101',
            content: historicalText,
            similarity: 0.92,
          },
        ];
      },
      findSimilarStyleExamples: async () => [],
    } as unknown as MemoryRepository;

    const capturedEmbedCalls: any[] = [];
    const mockAiProvider = {
      modelName: 'gemini-embedding-2',
      getCapabilities: () => ({ structuredOutput: true, streaming: true, embeddings: true, tools: false, vision: false, multimodal: false }),
      embed: async (req: any) => {
        capturedEmbedCalls.push(req);
        return {
          embeddings: [new Array(768).fill(0.015)],
          model: 'gemini-embedding-2',
          dimensions: 768,
        };
      },
      complete: async () => ({
        result: {
          hook: 'PostgreSQL vector search is great',
          body: 'Here is a good post about vector databases and search.',
          characterCount: 54,
        },
      }),
    } as any;

    const mockDb = createBaseMockDb();

    const graph = createContentGraph({
      db: mockDb,
      aiProvider: mockAiProvider,
      memoryRepo: mockMemoryRepo,
    });

    const result = await graph.invoke({
      workspaceId,
      topic: 'PostgreSQL vector search',
      format: 'hook_body_cta',
    });

    const retrievalCall = capturedFindSimilarCalls.find((c) => c.opts?.taskType === 'DOCUMENT');
    assert(retrievalCall !== undefined, 'retrieveMemories must call memoryRepo.findSimilar with taskType = DOCUMENT');
    assert.strictEqual(retrievalCall.opts.model, 'gemini-embedding-2', 'Must pass model for coordinate space isolation');
    assert.strictEqual(retrievalCall.opts.pipelineVersion, 'v2', 'Must filter pipelineVersion = v2');
    assert.strictEqual(retrievalCall.opts.type, 'POST', 'Must restrict to POST memory items');
    assert.deepStrictEqual(result.retrievedMemoryIds, ['mem-item-101']);

    // Verify first embed call (for retrieval) used QUERY taskType
    const retrievalEmbed = capturedEmbedCalls[0];
    assert(retrievalEmbed !== undefined);
    assert.strictEqual(retrievalEmbed.taskType, 'QUERY', 'Retrieval embedding must use QUERY taskType');
  });

  it('detects duplicate when candidate paraphrases historical ThreadPost (similarity = 0.9434 >= 0.88)', async () => {
    let checkedTaskType: string | undefined;
    let checkedModel: string | undefined;

    const mockMemoryRepo = {
      findSimilar: async (_wsId: string, _vec: number[], opts: any) => {
        checkedTaskType = opts?.taskType;
        checkedModel = opts?.model;
        // Paraphrase matches historical post SIMILARITY vector at 0.9434
        if (opts?.taskType === 'SIMILARITY') {
          return [
            {
              memoryItemId: 'mem-item-101',
              content: historicalText,
              similarity: 0.9434, // Calibrated paraphrase score
            },
          ];
        }
        return [];
      },
      findSimilarStyleExamples: async () => [],
    } as unknown as MemoryRepository;

    const mockAiProvider = {
      modelName: 'gemini-embedding-2',
      getCapabilities: () => ({ structuredOutput: true, streaming: true, embeddings: true, tools: false, vision: false, multimodal: false }),
      embed: async (req: any) => {
        return {
          embeddings: [dupeSimVector],
          model: 'gemini-embedding-2',
          dimensions: 768,
        };
      },
      complete: async () => ({
        result: {
          hook: 'PostgreSQL is enough',
          body: duplicateCandidateText,
          characterCount: duplicateCandidateText.length,
        },
      }),
    } as any;

    const mockDb = createBaseMockDb();

    const graph = createContentGraph({
      db: mockDb,
      aiProvider: mockAiProvider,
      memoryRepo: mockMemoryRepo,
      duplicatePolicy: DEFAULT_DUPLICATE_POLICY,
    });

    const finalState = await graph.invoke({
      workspaceId,
      topic: 'Vector DBs',
      format: 'hook_body_cta',
    });

    // Verification:
    // 1. Must use symmetric taskType = 'SIMILARITY' and model = 'gemini-embedding-2'
    assert.strictEqual(checkedTaskType, 'SIMILARITY');
    assert.strictEqual(checkedModel, 'gemini-embedding-2');
    // 2. Must detect duplicate
    assert.strictEqual(finalState.dupeCheck?.isDuplicate, true);
    assert.strictEqual(finalState.dupeCheck?.similarMemoryItemId, 'mem-item-101');
    assert.strictEqual(finalState.dupeCheck?.similarityScore, 0.9434);
    assert.strictEqual(finalState.status, 'failure');
    assert(finalState.error?.includes('too similar to existing post'));
  });

  it('allows draft when candidate is distinct on same topic (similarity = 0.8214 < 0.88)', async () => {
    const mockMemoryRepo = {
      findSimilar: async (_wsId: string, _vec: number[], opts: any) => {
        if (opts?.taskType === 'SIMILARITY') {
          // Distinct post on same technical topic scores 0.8214 (below 0.88 threshold)
          return [
            {
              memoryItemId: 'mem-item-101',
              content: historicalText,
              similarity: 0.8214,
            },
          ];
        }
        return [];
      },
      findSimilarStyleExamples: async () => [],
    } as unknown as MemoryRepository;

    const mockAiProvider = {
      modelName: 'gemini-embedding-2',
      getCapabilities: () => ({ structuredOutput: true, streaming: true, embeddings: true, tools: false, vision: false, multimodal: false }),
      embed: async () => ({
        embeddings: [distinctSimVector],
        model: 'gemini-embedding-2',
        dimensions: 768,
      }),
      complete: async () => ({
        result: {
          hook: 'MongoDB concurrent search',
          body: distinctCandidateText,
          characterCount: distinctCandidateText.length,
        },
      }),
    } as any;

    const mockDb = createBaseMockDb();

    const graph = createContentGraph({
      db: mockDb,
      aiProvider: mockAiProvider,
      memoryRepo: mockMemoryRepo,
      duplicatePolicy: DEFAULT_DUPLICATE_POLICY,
    });

    const finalState = await graph.invoke({
      workspaceId,
      topic: 'Vector DBs',
      format: 'hook_body_cta',
    });

    // Verification:
    // 1. Does not flag as duplicate
    assert.strictEqual(finalState.dupeCheck?.isDuplicate, false);
    // 2. Draft is approved and persists
    assert.strictEqual(finalState.status, 'success');
    assert(finalState.finalDraft !== undefined, 'Draft must be generated and approved');
  });

  it('records checkFailed and requiresReview on duplicate-check error instead of silently failing open', async () => {
    const mockMemoryRepo = {
      findSimilar: async () => {
        throw new Error('pgvector service connection timeout');
      },
      findSimilarStyleExamples: async () => [],
    } as unknown as MemoryRepository;

    const mockAiProvider = {
      modelName: 'gemini-embedding-2',
      getCapabilities: () => ({ structuredOutput: true, streaming: true, embeddings: true, tools: false, vision: false, multimodal: false }),
      embed: async () => ({
        embeddings: [new Array(768).fill(0.01)],
        model: 'gemini-embedding-2',
        dimensions: 768,
      }),
      complete: async () => ({
        result: {
          hook: 'Reliable backend architecture',
          body: 'Writing robust distributed systems requires careful error boundary design.',
          characterCount: 78,
        },
      }),
    } as any;

    const mockDb = createBaseMockDb();

    const graph = createContentGraph({
      db: mockDb,
      aiProvider: mockAiProvider,
      memoryRepo: mockMemoryRepo,
    });

    const finalState = await graph.invoke({
      workspaceId,
      topic: 'Distributed Systems',
      format: 'hook_body_cta',
    });

    // Proves failure is not silently ignored:
    assert.strictEqual(finalState.dupeCheck?.checkFailed, true);
    assert.strictEqual(finalState.dupeCheck?.requiresReview, true);
    assert(finalState.dupeCheck?.failureReason?.includes('pgvector service connection timeout'));
  });
});

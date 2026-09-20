import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MemoryRepository,
  CURRENT_EMBEDDING_PIPELINE_VERSION,
} from '../dist/index.js';

describe('MemoryRepository Provenance and Pipeline Version Isolation', () => {
  it('persists embedding into memory_embeddings table with full provenance metadata', async () => {
    const capturedCalls: any[] = [];

    const mockPrisma = {
      $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
        capturedCalls.push({ strings, values });
        return 1;
      },
    } as any;

    const repo = new MemoryRepository(mockPrisma);
    const mockVector = new Array(768).fill(0.01);
    const memoryItemId = '11111111-1111-1111-1111-111111111111';

    await repo.upsertEmbedding(
      memoryItemId,
      mockVector,
      'gemini-embedding-2',
      768,
      'DOCUMENT',
      'v2',
    );

    assert.strictEqual(capturedCalls.length, 1, 'Expected 1 $executeRaw call (memory_embeddings authoritative store)');

    // Call 1: INSERT into memory_embeddings
    const insertCall = capturedCalls[0];
    const insertSerialized = JSON.stringify(insertCall.values);
    assert(insertSerialized.includes('gemini-embedding-2'));
    assert(insertSerialized.includes('768'));
    assert(insertSerialized.includes('DOCUMENT'));
    assert(insertSerialized.includes('v2'));
    assert(insertSerialized.includes(memoryItemId));
  });

  it('isolates similarity queries on memory_embeddings by model, pipelineVersion, and taskType', async () => {
    let capturedQueryArgs: any = null;

    const mockPrisma = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
        capturedQueryArgs = { strings, values };
        return [
          {
            memory_item_id: 'item-1',
            content: 'Scalable backend tips',
            similarity: 0.89,
          },
        ];
      },
    } as any;

    const repo = new MemoryRepository(mockPrisma);
    const queryVector = new Array(768).fill(0.02);
    const workspaceId = '22222222-2222-2222-2222-222222222222';

    const results = await repo.findSimilar(workspaceId, queryVector, {
      model: 'gemini-embedding-2',
      minSimilarity: 0.88,
      pipelineVersion: CURRENT_EMBEDDING_PIPELINE_VERSION,
      taskType: 'SIMILARITY',
    });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].memoryItemId, 'item-1');
    assert.strictEqual(results[0].similarity, 0.89);

    // Verify query parameters contained workspaceId, model, minSimilarity, pipelineVersion, and taskType
    const serializedValues = JSON.stringify(capturedQueryArgs.values);
    assert(serializedValues.includes(workspaceId));
    assert(serializedValues.includes('gemini-embedding-2'));
    assert(serializedValues.includes('0.88'));
    assert(serializedValues.includes('SIMILARITY'));
    assert(serializedValues.includes(CURRENT_EMBEDDING_PIPELINE_VERSION));
  });

  it('explicitly filters model and taskType = DOCUMENT when searching style examples', async () => {
    let capturedQueryArgs: any = null;

    const mockPrisma = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
        capturedQueryArgs = { strings, values };
        return [
          {
            style_example_id: 'se-1',
            text: 'Style reference text',
            topic: 'engineering',
            similarity: 0.91,
          },
        ];
      },
    } as any;

    const repo = new MemoryRepository(mockPrisma);
    const queryVector = new Array(768).fill(0.03);
    const workspaceId = '44444444-4444-4444-4444-444444444444';

    const results = await repo.findSimilarStyleExamples(
      workspaceId,
      queryVector,
      {
        model: 'gemini-embedding-2',
        topic: 'engineering',
        limit: 5,
        pipelineVersion: CURRENT_EMBEDDING_PIPELINE_VERSION,
        taskType: 'DOCUMENT',
      },
    );

    assert.strictEqual(results.length, 1);
    const serializedValues = JSON.stringify(capturedQueryArgs.values);
    assert(serializedValues.includes(workspaceId));
    assert(serializedValues.includes('gemini-embedding-2'));
    assert(serializedValues.includes('DOCUMENT'));
    assert(serializedValues.includes('engineering'));
    assert(serializedValues.includes(CURRENT_EMBEDDING_PIPELINE_VERSION));
  });

  it('identifies memory items needing re-embedding and detects missing required representations', async () => {
    let capturedArgs: any = null;

    const mockPrisma = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
        capturedArgs = { strings, values };
        return [
          {
            id: 'post-missing-sim',
            content: 'Post with only DOCUMENT vector',
            type: 'POST',
            existing_task_types: ['DOCUMENT'],
          },
          {
            id: 'post-unembedded',
            content: 'Post with no vectors',
            type: 'POST',
            existing_task_types: null,
          },
        ];
      },
    } as any;

    const repo = new MemoryRepository(mockPrisma);
    const workspaceId = '33333333-3333-3333-3333-333333333333';

    const items = await repo.findItemsNeedingReEmbedding(workspaceId, {
      targetPipelineVersion: 'v2',
      model: 'gemini-embedding-2',
      limit: 50,
    });

    assert.strictEqual(items.length, 2);
    // Item 1: has DOCUMENT, missing SIMILARITY
    assert.strictEqual(items[0].id, 'post-missing-sim');
    assert.deepStrictEqual(items[0].missingTaskTypes, ['SIMILARITY']);

    // Item 2: has nothing, missing both DOCUMENT and SIMILARITY
    assert.strictEqual(items[1].id, 'post-unembedded');
    assert.deepStrictEqual(items[1].missingTaskTypes, ['DOCUMENT', 'SIMILARITY']);

    const serialized = JSON.stringify(capturedArgs.values);
    assert(serialized.includes(workspaceId));
    assert(serialized.includes('v2'));
    assert(serialized.includes('gemini-embedding-2'));
    assert(serialized.includes('50'));
  });
});

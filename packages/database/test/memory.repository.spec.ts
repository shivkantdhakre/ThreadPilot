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

    assert.strictEqual(capturedCalls.length, 2, 'Expected 2 $executeRaw calls (memory_embeddings + memory_items)');

    // Call 1: INSERT into memory_embeddings
    const insertCall = capturedCalls[0];
    const insertSerialized = JSON.stringify(insertCall.values);
    assert(insertSerialized.includes('gemini-embedding-2'));
    assert(insertSerialized.includes('768'));
    assert(insertSerialized.includes('DOCUMENT'));
    assert(insertSerialized.includes('v2'));
    assert(insertSerialized.includes(memoryItemId));

    // Call 2: Legacy backward-compat update on memory_items
    const updateCall = capturedCalls[1];
    const updateSerialized = JSON.stringify(updateCall.values);
    assert(updateSerialized.includes(memoryItemId));
    assert(updateSerialized.includes('gemini-embedding-2'));
  });

  it('isolates similarity queries on memory_embeddings by pipelineVersion and taskType', async () => {
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
      minSimilarity: 0.88,
      pipelineVersion: CURRENT_EMBEDDING_PIPELINE_VERSION,
      taskType: 'SIMILARITY',
    });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].memoryItemId, 'item-1');
    assert.strictEqual(results[0].similarity, 0.89);

    // Verify query parameters contained workspaceId, minSimilarity, pipelineVersion, and taskType
    const serializedValues = JSON.stringify(capturedQueryArgs.values);
    assert(serializedValues.includes(workspaceId));
    assert(serializedValues.includes('0.88'));
    assert(serializedValues.includes('SIMILARITY'));
    assert(serializedValues.includes(CURRENT_EMBEDDING_PIPELINE_VERSION));
  });

  it('explicitly filters taskType = DOCUMENT when searching style examples', async () => {
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
      'engineering',
      5,
      CURRENT_EMBEDDING_PIPELINE_VERSION,
      'DOCUMENT',
    );

    assert.strictEqual(results.length, 1);
    const serializedValues = JSON.stringify(capturedQueryArgs.values);
    assert(serializedValues.includes(workspaceId));
    assert(serializedValues.includes('DOCUMENT'));
    assert(serializedValues.includes('engineering'));
    assert(serializedValues.includes(CURRENT_EMBEDDING_PIPELINE_VERSION));
  });

  it('identifies memory items needing re-embedding when pipeline version is outdated', async () => {
    let capturedArgs: any = null;

    const mockPrisma = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
        capturedArgs = { strings, values };
        return [
          { id: 'old-1', content: 'Legacy post needing v2 embedding', type: 'POST' },
        ];
      },
    } as any;

    const repo = new MemoryRepository(mockPrisma);
    const workspaceId = '33333333-3333-3333-3333-333333333333';

    const items = await repo.findItemsNeedingReEmbedding(workspaceId, 'v2', 50);

    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].id, 'old-1');
    assert(capturedArgs.values.includes(workspaceId));
    assert(capturedArgs.values.includes('v2'));
    assert(capturedArgs.values.includes(50));
  });
});

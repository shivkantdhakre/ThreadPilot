import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MemoryRepository,
  CURRENT_EMBEDDING_PIPELINE_VERSION,
} from '../dist/index.js';

describe('MemoryRepository Provenance and Pipeline Version Isolation', () => {
  it('persists embedding with full provenance metadata including pipeline version', async () => {
    let capturedExecuteRawArgs: any = null;

    const mockPrisma = {
      $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
        capturedExecuteRawArgs = { strings, values };
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

    assert(capturedExecuteRawArgs !== null, 'Expected $executeRaw to be called');
    const { values } = capturedExecuteRawArgs;

    // values[0] is vectorLiteral
    assert.strictEqual(values[0], `[${mockVector.join(',')}]`);
    // values[1] is embeddingModel
    assert.strictEqual(values[1], 'gemini-embedding-2');
    // values[2] is metadataUpdate JSON
    const parsedMetadata = JSON.parse(values[2]);
    assert.deepStrictEqual(parsedMetadata, {
      embeddingModel: 'gemini-embedding-2',
      embeddingDimensions: 768,
      taskType: 'DOCUMENT',
      embeddingPipelineVersion: 'v2',
    });
    // values[3] is memoryItemId
    assert.strictEqual(values[3], memoryItemId);
  });

  it('isolates similarity queries by pipelineVersion to prevent mixing incompatible vector spaces', async () => {
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

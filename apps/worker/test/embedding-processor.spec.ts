import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EmbeddingProcessor } from '../dist/processors/embedding.processor.js';
import type { EmbeddingJobPayload } from '@threadpilot/types';

describe('EmbeddingProcessor Integration & Retry Resilience', () => {
  const workspaceId = '00000000-0000-0000-0000-000000000001';
  const memoryItemId = 'mem-101';
  const postText = 'PostgreSQL + pgvector is all the vector database you need.';
  const sampleVector = new Array(768).fill(0.02);

  it('successfully generates and persists missing SIMILARITY representation via BullMQ process()', async () => {
    let capturedUpsert: any = null;
    let capturedEmbedRequest: any = null;

    const mockAiProvider = {
      modelName: 'gemini-embedding-2',
      embed: async (req: any) => {
        capturedEmbedRequest = req;
        return {
          embeddings: [sampleVector],
          model: 'gemini-embedding-2',
          dimensions: 768,
        };
      },
    };

    const mockAiFactory = {
      getProvider: () => mockAiProvider,
    } as any;

    const processor = new EmbeddingProcessor(mockAiFactory);

    // Override memoryRepo for test isolation
    (processor as any).memoryRepo = {
      hasEmbedding: async () => false,
      upsertEmbedding: async (
        id: string,
        vec: number[],
        model: string,
        dims: number,
        taskType: string,
        version: string,
      ) => {
        capturedUpsert = { id, vec, model, dims, taskType, version };
      },
    };

    const job = {
      data: {
        requestId: 'req-001',
        workspaceId,
        memoryItemId,
        text: postText,
        taskType: 'SIMILARITY',
        model: 'gemini-embedding-2',
        pipelineVersion: 'v2',
      } satisfies EmbeddingJobPayload,
    } as any;

    // Test BullMQ WorkerHost process() entrypoint
    await processor.process(job);

    // Assert correct taskType was requested
    assert.deepStrictEqual(capturedEmbedRequest, {
      texts: [postText],
      taskType: 'SIMILARITY',
    });

    // Assert vector was persisted with full provenance
    assert.strictEqual(capturedUpsert.id, memoryItemId);
    assert.strictEqual(capturedUpsert.taskType, 'SIMILARITY');
    assert.strictEqual(capturedUpsert.model, 'gemini-embedding-2');
    assert.strictEqual(capturedUpsert.dims, 768);
    assert.strictEqual(capturedUpsert.version, 'v2');
  });

  it('skips Gemini API call when MemoryEmbedding already exists (preflight DB check)', async () => {
    let apiCalled = false;
    let upsertCalled = false;

    const mockAiProvider = {
      modelName: 'gemini-embedding-2',
      embed: async () => {
        apiCalled = true;
        return {
          embeddings: [sampleVector],
          model: 'gemini-embedding-2',
          dimensions: 768,
        };
      },
    };

    const mockAiFactory = {
      getProvider: () => mockAiProvider,
    } as any;

    const processor = new EmbeddingProcessor(mockAiFactory);

    // Mock hasEmbedding returning true (already present in DB)
    (processor as any).memoryRepo = {
      hasEmbedding: async () => true,
      upsertEmbedding: async () => {
        upsertCalled = true;
      },
    };

    const job = {
      data: {
        requestId: 'req-idempotent-001',
        workspaceId,
        memoryItemId,
        text: postText,
        taskType: 'SIMILARITY',
        model: 'gemini-embedding-2',
        pipelineVersion: 'v2',
      } satisfies EmbeddingJobPayload,
    } as any;

    await processor.process(job);

    assert.strictEqual(apiCalled, false, 'Gemini API must not be called if representation exists in DB');
    assert.strictEqual(upsertCalled, false, 'DB upsert must not be called if representation exists in DB');
  });

  it('recovers from transient provider failure on retry and completes persistence', async () => {
    let attemptCount = 0;
    let persistedSuccessfully = false;

    const mockAiProvider = {
      modelName: 'gemini-embedding-2',
      embed: async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('503 Service Unavailable (transient upstream overload)');
        }
        return {
          embeddings: [sampleVector],
          model: 'gemini-embedding-2',
          dimensions: 768,
        };
      },
    };

    const mockAiFactory = {
      getProvider: () => mockAiProvider,
    } as any;

    const processor = new EmbeddingProcessor(mockAiFactory);

    (processor as any).memoryRepo = {
      hasEmbedding: async () => false,
      upsertEmbedding: async () => {
        persistedSuccessfully = true;
      },
    };

    const job = {
      data: {
        requestId: 'req-retry-001',
        workspaceId,
        memoryItemId,
        text: postText,
        taskType: 'SIMILARITY',
        model: 'gemini-embedding-2',
        pipelineVersion: 'v2',
      } satisfies EmbeddingJobPayload,
    } as any;

    // Attempt 1: Fails with transient 503 error
    await assert.rejects(
      async () => {
        await processor.process(job);
      },
      /503 Service Unavailable/,
      'Attempt 1 must throw transient error to trigger BullMQ retry',
    );
    assert.strictEqual(persistedSuccessfully, false);
    assert.strictEqual(attemptCount, 1);

    // Attempt 2: BullMQ retries the job; succeeds
    await processor.process(job);
    assert.strictEqual(attemptCount, 2);
    assert.strictEqual(persistedSuccessfully, true);
  });
});

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

  it('prevents redundant external Gemini calls via representation-level Redis lock during concurrent worker execution', async () => {
    let apiCallCount = 0;
    const redisLocks = new Map<string, string>();

    const mockRedis = {
      set: async (key: string, val: string, mode: string, duration: number, flag: string) => {
        if (redisLocks.has(key)) {
          return null; // lock already held
        }
        redisLocks.set(key, val);
        return 'OK';
      },
      eval: async (script: string, numkeys: number, key: string, token: string) => {
        if (redisLocks.get(key) === token) {
          redisLocks.delete(key);
          return 1;
        }
        return 0;
      },
      del: async (key: string) => {
        redisLocks.delete(key);
        return 1;
      },
    } as any;

    const mockAiProvider = {
      modelName: 'gemini-embedding-2',
      embed: async () => {
        apiCallCount++;
        // Simulate a 40ms external network call
        await new Promise((res) => setTimeout(res, 40));
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

    // Both Worker A and Worker B are configured with the shared mock Redis
    const workerA = new EmbeddingProcessor(mockAiFactory, mockRedis);
    const workerB = new EmbeddingProcessor(mockAiFactory, mockRedis);

    let dbStored = false;
    const sharedMemoryRepo = {
      hasEmbedding: async () => dbStored,
      upsertEmbedding: async () => {
        dbStored = true;
      },
    };

    (workerA as any).memoryRepo = sharedMemoryRepo;
    (workerB as any).memoryRepo = sharedMemoryRepo;

    const job = {
      data: {
        requestId: 'req-concurrent-001',
        workspaceId,
        memoryItemId,
        text: postText,
        taskType: 'SIMILARITY',
        model: 'gemini-embedding-2',
        pipelineVersion: 'v2',
      } satisfies EmbeddingJobPayload,
    } as any;

    // Concurrently trigger Worker A and Worker B for the exact same memoryItem representation
    await Promise.all([workerA.process(job), workerB.process(job)]);

    // The representation lock must ensure only ONE external Gemini API call occurred!
    assert.strictEqual(
      apiCallCount,
      1,
      'External Gemini API should be invoked exactly once across concurrent workers for the same representation',
    );
    assert.strictEqual(dbStored, true, 'Embedding must be successfully persisted');
    assert.strictEqual(redisLocks.size, 0, 'Lock must be released after completion');
  });

  it('guarantees lock ownership safety: does not delete lock if token was replaced by another worker', async () => {
    const lockKey = `embedding-lock:${memoryItemId}:gemini-embedding-2:SIMILARITY:v2`;
    let activeToken = 'worker-b-token';

    const mockRedis = {
      set: async () => 'OK',
      eval: async (script: string, numkeys: number, key: string, token: string) => {
        // Only delete if token matches
        if (activeToken === token) {
          activeToken = '';
          return 1;
        }
        return 0;
      },
    } as any;

    const mockAiProvider = {
      modelName: 'gemini-embedding-2',
      embed: async () => ({
        embeddings: [sampleVector],
        model: 'gemini-embedding-2',
        dimensions: 768,
      }),
    };

    const mockAiFactory = { getProvider: () => mockAiProvider } as any;
    const worker = new EmbeddingProcessor(mockAiFactory, mockRedis);

    (worker as any).memoryRepo = {
      hasEmbedding: async () => false,
      upsertEmbedding: async () => {},
    };

    const job = {
      data: {
        requestId: 'req-ownership-001',
        workspaceId,
        memoryItemId,
        text: postText,
        taskType: 'SIMILARITY',
        model: 'gemini-embedding-2',
        pipelineVersion: 'v2',
      } satisfies EmbeddingJobPayload,
    } as any;

    await worker.process(job);

    // Because activeToken was simulated as 'worker-b-token', worker A's release eval must NOT delete it!
    assert.strictEqual(activeToken, 'worker-b-token', 'Worker B token must remain intact');
  });
});


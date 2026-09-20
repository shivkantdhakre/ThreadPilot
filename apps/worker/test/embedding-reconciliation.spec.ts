import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EmbeddingReconciliationService } from '../dist/services/embedding-reconciliation.service.js';

describe('EmbeddingReconciliationService Unit & Logic Test', () => {
  const workspaceId = '00000000-0000-0000-0000-000000000001';

  it('detects missing representations and enqueues BullMQ jobs with hyphenated jobIds', async () => {
    const enqueuedJobs: Array<{ name: string; data: any; opts: any }> = [];

    const mockQueue = {
      add: async (name: string, data: any, opts: any) => {
        enqueuedJobs.push({ name, data, opts });
        return { id: opts?.jobId ?? 'job-1' };
      },
    } as any;

    const mockAiFactory = {
      getProvider: () => ({
        modelName: 'gemini-embedding-2',
      }),
    } as any;

    const service = new EmbeddingReconciliationService(mockQueue, mockAiFactory);

    // Mock memoryRepo returning 2 items:
    // Item 1: POST missing SIMILARITY
    // Item 2: POST missing BOTH DOCUMENT and SIMILARITY
    (service as any).memoryRepo = {
      findItemsNeedingReEmbedding: async (wsId: string, options: any) => {
        return [
          {
            id: 'mem-item-1',
            content: 'First post text',
            type: 'POST',
            missingTaskTypes: ['SIMILARITY'],
          },
          {
            id: 'mem-item-2',
            content: 'Second post text',
            type: 'POST',
            missingTaskTypes: ['DOCUMENT', 'SIMILARITY'],
          },
        ];
      },
    };

    const result = await service.reconcileWorkspace(workspaceId, 'gemini-embedding-2', 'v2');

    assert.strictEqual(result.checked, 2);
    assert.strictEqual(result.enqueued, 3); // 1 + 2 = 3 jobs

    // Verify all enqueued jobs are targeting the EMBEDDING queue
    assert(enqueuedJobs.every((j) => j.name === 'EMBEDDING'));

    // Verify deterministic BullMQ job IDs DO NOT contain colons
    for (const job of enqueuedJobs) {
      assert(
        !job.opts.jobId.includes(':'),
        `BullMQ custom jobId must not contain colons: ${job.opts.jobId}`,
      );
      assert(job.opts.jobId.startsWith('embedding-'));
    }

    // Verify specific job IDs
    const jobIds = enqueuedJobs.map((j) => j.opts.jobId);
    assert(jobIds.includes('embedding-mem-item-1-gemini-embedding-2-SIMILARITY-v2'));
    assert(jobIds.includes('embedding-mem-item-2-gemini-embedding-2-DOCUMENT-v2'));
    assert(jobIds.includes('embedding-mem-item-2-gemini-embedding-2-SIMILARITY-v2'));
  });

  it('enqueues 0 jobs when all representations are complete', async () => {
    const enqueuedJobs: any[] = [];
    const mockQueue = {
      add: async (name: string, data: any, opts: any) => {
        enqueuedJobs.push({ name, data, opts });
      },
    } as any;

    const mockAiFactory = {
      getProvider: () => ({ modelName: 'gemini-embedding-2' }),
    } as any;

    const service = new EmbeddingReconciliationService(mockQueue, mockAiFactory);

    (service as any).memoryRepo = {
      findItemsNeedingReEmbedding: async () => [],
    };

    const result = await service.reconcileWorkspace(workspaceId);
    assert.strictEqual(result.checked, 0);
    assert.strictEqual(result.enqueued, 0);
    assert.strictEqual(enqueuedJobs.length, 0);
  });
});

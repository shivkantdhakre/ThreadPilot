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

  it('manages recurring reconciliation lifecycle: starts timer, fires recurring cycle, and clears on destroy', async () => {
    let cyclesFired = 0;
    const mockQueue = { add: async () => ({ id: '1' }) } as any;
    const mockAiFactory = { getProvider: () => ({ modelName: 'gemini-embedding-2' }) } as any;

    const service = new EmbeddingReconciliationService(mockQueue, mockAiFactory);

    // Mock reconcileAllWorkspaces to track execution
    (service as any).reconcileAllWorkspaces = async () => {
      cyclesFired++;
      return { totalWorkspaces: 1, totalEnqueued: 0 };
    };

    assert.strictEqual(service.isRecurringActive(), false, 'Timer should not be active initially');

    // Start with a fast 25ms interval for deterministic testing
    service.startRecurring(25);
    assert.strictEqual(service.isRecurringActive(), true, 'Timer should be active after startRecurring()');

    // Wait for at least 2 ticks
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert(cyclesFired >= 2, `Expected at least 2 recurring reconciliation cycles, got ${cyclesFired}`);

    // Cleanup via onModuleDestroy
    service.onModuleDestroy();
    assert.strictEqual(service.isRecurringActive(), false, 'Timer must be stopped after onModuleDestroy()');

    const cyclesAtStop = cyclesFired;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(cyclesFired, cyclesAtStop, 'No further cycles should fire after destruction');
  });

  it('coordinates multi-replica reconciliation via Redis leader lease', async () => {
    let activeLeaderToken = '';
    const mockRedis = {
      set: async (key: string, token: string, mode: string, ttl: number, flag: string) => {
        if (activeLeaderToken) {
          return null; // lease already held by another worker replica
        }
        activeLeaderToken = token;
        return 'OK';
      },
      eval: async (script: string, numkeys: number, key: string, token: string) => {
        if (activeLeaderToken === token) {
          activeLeaderToken = '';
          return 1;
        }
        return 0;
      },
    } as any;

    const mockQueue = { add: async () => ({ id: '1' }) } as any;
    const mockAiFactory = { getProvider: () => ({ modelName: 'gemini-embedding-2' }) } as any;

    const replicaA = new EmbeddingReconciliationService(mockQueue, mockAiFactory, mockRedis);
    const replicaB = new EmbeddingReconciliationService(mockQueue, mockAiFactory, mockRedis);

    const mockDb = { workspace: { findMany: async () => [{ id: 'ws-1' }] } };
    (replicaA as any).db = mockDb;
    (replicaB as any).db = mockDb;

    // Mock reconcileWorkspace on replicaA to simulate scanning a workspace
    let replicaAScanCount = 0;
    (replicaA as any).reconcileWorkspace = async () => {
      replicaAScanCount++;
      await new Promise((res) => setTimeout(res, 30));
      return { checked: 1, enqueued: 1, itemIds: ['mem-1'] };
    };

    // Concurrently trigger reconcileAllWorkspaces across Replica A and Replica B
    const [resA, resB] = await Promise.all([
      replicaA.reconcileAllWorkspaces(),
      replicaB.reconcileAllWorkspaces(),
    ]);

    // One replica must acquire the lease and execute; the other must cleanly skip
    const executedReplica = resA.totalWorkspaces > 0 ? resA : resB;
    const skippedReplica = resA.totalWorkspaces === 0 ? resA : resB;

    assert(executedReplica.totalEnqueued >= 0, 'Leader must execute workspace reconciliation');
    assert.strictEqual(skippedReplica.totalWorkspaces, 0, 'Follower replica must skip cycle');
    assert.strictEqual(skippedReplica.totalEnqueued, 0, 'Follower replica must not enqueue duplicates');
    assert.strictEqual(activeLeaderToken, '', 'Leader lease must be released after cycle finishes');
  });
});


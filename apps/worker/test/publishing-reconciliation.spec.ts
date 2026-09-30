import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PublishingReconciliationService } from '../dist/services/publishing-reconciliation.service.js';

describe('PublishingReconciliationService Leader Fencing & Safe Enqueue Tests', () => {
  function createService(overrides: {
    redisAcquireResult?: string | null;
    heartbeatResult?: number;
    jobState?: string;
  } = {}) {
    const queueJobs = new Map<string, any>();
    const addedJobs: any[] = [];

    const mockRedis = {
      set: async (key: string, val: string, ...args: any[]) => {
        return overrides.redisAcquireResult !== undefined ? overrides.redisAcquireResult : 'OK';
      },
      eval: async (script: string, numKeys: number, ...args: any[]) => {
        return overrides.heartbeatResult !== undefined ? overrides.heartbeatResult : 1;
      },
    };

    const mockPublishQueue = {
      getJob: async (jobId: string) => {
        if (!overrides.jobState) return null;
        return {
          id: jobId,
          getState: async () => overrides.jobState,
          remove: async () => {
            queueJobs.delete(jobId);
          },
        };
      },
      add: async (name: string, data: any, opts: any) => {
        addedJobs.push({ name, data, opts });
        return { id: opts.jobId };
      },
    };

    const mockPublishingService = {};
    const mockDb = {
      $queryRaw: async () => [],
      $executeRaw: async () => 0,
    };

    const service = new PublishingReconciliationService(
      mockRedis as any,
      mockPublishQueue as any,
      mockPublishingService as any,
      mockDb as any,
    );

    return { service, mockRedis, mockPublishQueue, addedJobs };
  }

  describe('Distributed Leader Fencing', () => {
    it('aborts reconciliation immediately if another worker holds the leader lease', async () => {
      // Simulate leader lease already held by peer worker
      const { service, addedJobs } = createService({ redisAcquireResult: null });

      await service.reconcile();

      assert.strictEqual(addedJobs.length, 0, 'No jobs should be enqueued when lease is not held');
    });

    it('proceeds through scans when leader lease is successfully acquired', async () => {
      const { service } = createService({ redisAcquireResult: 'OK' });

      let releaseScriptCalled = false;
      service['redis'].eval = async (script: string) => {
        if (script.includes('del')) releaseScriptCalled = true;
        return 1;
      };

      await service.reconcile();

      assert.strictEqual(releaseScriptCalled, true, 'Must release leader lease on completion');
    });
  });

  describe('Safe Enqueue Invariants (Duplicate Prevention)', () => {
    it('returns ALREADY_IN_FLIGHT and does NOT duplicate if job is already waiting or active in BullMQ', async () => {
      const { service, addedJobs } = createService({ jobState: 'waiting' });

      const result = await service['safeEnqueue'](
        'PUBLISH',
        {
          requestId: 'req-1',
          workspaceId: '00000000-0000-0000-0000-000000000001',
          scheduledPostId: 'sp-1',
        },
        { jobId: 'publish-sp-1' },
      );

      assert.strictEqual(result, 'ALREADY_IN_FLIGHT');
      assert.strictEqual(addedJobs.length, 0, 'Must not duplicate in-flight job');
    });

    it('removes stale completed/failed job and enqueues fresh job', async () => {
      const { service, addedJobs } = createService({ jobState: 'completed' });

      const result = await service['safeEnqueue'](
        'PUBLISH',
        {
          requestId: 'req-2',
          workspaceId: '00000000-0000-0000-0000-000000000001',
          scheduledPostId: 'sp-2',
        },
        { jobId: 'publish-sp-2' },
      );

      assert.strictEqual(result, 'ENQUEUED');
      assert.strictEqual(addedJobs.length, 1);
      assert.strictEqual(addedJobs[0].opts.jobId, 'publish-sp-2');
    });

    it('enqueues brand new job when no existing job is in BullMQ', async () => {
      const { service, addedJobs } = createService(); // no jobState -> getJob returns null

      const result = await service['safeEnqueue'](
        'PUBLISH',
        {
          requestId: 'req-3',
          workspaceId: '00000000-0000-0000-0000-000000000001',
          scheduledPostId: 'sp-3',
        },
        { jobId: 'publish-sp-3' },
      );

      assert.strictEqual(result, 'ENQUEUED');
      assert.strictEqual(addedJobs.length, 1);
      assert.strictEqual(addedJobs[0].opts.jobId, 'publish-sp-3');
    });
  });
});

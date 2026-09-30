import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EngagementReconciliationService } from '../dist/services/engagement-reconciliation.service.js';

describe('Phase 3G: EngagementReconciliationService Scans 0–6 & CAS Fencing Invariants', () => {
  function createTestHarness(overrides: {
    redisAcquireSuccess?: boolean;
    outboxEvents?: any[];
    staleClassifications?: any[];
    staleExecutions?: any[];
    retryableExecutions?: any[];
    staleSyncs?: any[];
  } = {}) {
    const {
      redisAcquireSuccess = true,
      outboxEvents = [],
      staleClassifications = [],
      staleExecutions = [],
      retryableExecutions = [],
      staleSyncs = [],
    } = overrides;

    const enqueuedPublishJobs: any[] = [];
    const enqueuedClassifyJobs: any[] = [];
    const dbUpdates: { model: string; where: any; data: any }[] = [];

    const mockRedis: any = {
      set: async (key: string, val: string, px: string, ttl: number, nx: string) => {
        return redisAcquireSuccess ? 'OK' : null;
      },
      get: async (key: string) => 'leader-token',
      pexpire: async (key: string, ttl: number) => 1,
    };

    const mockPublishQueue: any = {
      getJob: async (id: string) => null,
      add: async (name: string, data: any, opts: any) => {
        enqueuedPublishJobs.push({ name, data, opts });
        return { id: opts?.jobId || 'job-pub-1' };
      },
    };

    const mockClassifyQueue: any = {
      add: async (name: string, data: any, opts: any) => {
        enqueuedClassifyJobs.push({ name, data, opts });
        return { id: opts?.jobId || 'job-cls-1' };
      },
    };

    const mockIngestQueue: any = {
      add: async () => ({ id: 'job-ing-1' }),
    };

    const mockPublishingService: any = {
      threadsApi: {
        getContainerPublishingStatus: async () => ({ status: 'FINISHED' }),
        getPublishingLimit: async () => ({ quota_usage: 0 }),
      },
    };

    const mockDb: any = {
      eventOutbox: {
        findMany: async () => outboxEvents,
        update: async (args: any) => {
          dbUpdates.push({ model: 'eventOutbox', where: args.where, data: args.data });
          return {};
        },
      },
      interaction: {
        findMany: async () => staleClassifications,
        update: async (args: any) => {
          dbUpdates.push({ model: 'interaction', where: args.where, data: args.data });
          return {};
        },
      },
      replyExecution: {
        findMany: async (args: any) => {
          if (args.where?.status === 'CLAIMED') return staleExecutions;
          if (args.where?.status === 'RETRYABLE_FAILURE') return retryableExecutions;
          return [];
        },
        update: async (args: any) => {
          dbUpdates.push({ model: 'replyExecution', where: args.where, data: args.data });
          return {};
        },
      },
      engagementSyncState: {
        findMany: async () => staleSyncs,
        update: async (args: any) => {
          dbUpdates.push({ model: 'engagementSyncState', where: args.where, data: args.data });
          return {};
        },
      },
    };

    let editorialScanCalled = false;
    const mockEditorialService: any = {
      processPendingEditorialFeedback: async () => {
        editorialScanCalled = true;
      },
    };

    const service = new EngagementReconciliationService(
      mockRedis,
      mockPublishQueue,
      mockClassifyQueue,
      mockIngestQueue,
      mockPublishingService,
      mockDb,
      mockEditorialService,
    );

    return {
      service,
      enqueuedPublishJobs,
      enqueuedClassifyJobs,
      dbUpdates,
      getEditorialScanCalled: () => editorialScanCalled,
    };
  }

  it('Distributed Leader Lease: skips execution if Redis lock is held by another worker', async () => {
    const harness = createTestHarness({ redisAcquireSuccess: false });
    await harness.service.reconcile();

    assert.strictEqual(harness.enqueuedPublishJobs.length, 0);
    assert.strictEqual(harness.enqueuedClassifyJobs.length, 0);
    assert.strictEqual(harness.dbUpdates.length, 0);
    assert.strictEqual(harness.getEditorialScanCalled(), false);
  });

  it('Scan 0: Outbox Dispatcher dispatches pending outbox events to BullMQ and marks PROCESSED', async () => {
    const outboxEvents = [
      {
        id: 'evt-1',
        workspaceId: 'ws-1',
        eventType: 'REPLY_EXECUTION_DISPATCH',
        payload: {
          replyExecutionId: 'exec-1',
          interactionId: 'int-1',
          socialAccountId: 'acc-1',
        },
      },
    ];

    const harness = createTestHarness({ outboxEvents });
    await harness.service.reconcile();

    assert.strictEqual(harness.enqueuedPublishJobs.length, 1);
    assert.strictEqual(harness.enqueuedPublishJobs[0].opts.jobId, 'reply-publish_exec-1');
    assert.strictEqual(harness.enqueuedPublishJobs[0].data.replyExecutionId, 'exec-1');

    const outboxUpdate = harness.dbUpdates.find(u => u.model === 'eventOutbox');
    assert.ok(outboxUpdate);
    assert.strictEqual(outboxUpdate.data.status, 'PROCESSED');
  });

  it('Scan 1: Stale Classification Reclaimer resets stuck CLASSIFYING interactions to NEW and re-enqueues', async () => {
    const staleClassifications = [
      {
        id: 'int-stuck-1',
        workspaceId: 'ws-1',
        socialAccountId: 'acc-1',
        status: 'CLASSIFYING',
      },
    ];

    const harness = createTestHarness({ staleClassifications });
    await harness.service.reconcile();

    assert.strictEqual(harness.enqueuedClassifyJobs.length, 1);
    assert.strictEqual(harness.enqueuedClassifyJobs[0].opts.jobId, 'classify_int-stuck-1');

    const interactionUpdate = harness.dbUpdates.find(u => u.model === 'interaction');
    assert.ok(interactionUpdate);
    assert.strictEqual(interactionUpdate.where.id, 'int-stuck-1');
    assert.strictEqual(interactionUpdate.data.status, 'NEW');
  });

  it('Scan 2: Stale Execution Reclaimer resets expired CLAIMED executions to QUEUED and re-enqueues', async () => {
    const staleExecutions = [
      {
        id: 'exec-expired-1',
        workspaceId: 'ws-1',
        socialAccountId: 'acc-1',
        interactionId: 'int-1',
        status: 'CLAIMED',
      },
    ];

    const harness = createTestHarness({ staleExecutions });
    await harness.service.reconcile();

    const publishJob = harness.enqueuedPublishJobs.find(j => j.opts.jobId === 'reply-publish_exec-expired-1');
    assert.ok(publishJob);

    const execUpdate = harness.dbUpdates.find(u => u.model === 'replyExecution' && u.where.id === 'exec-expired-1');
    assert.ok(execUpdate);
    assert.strictEqual(execUpdate.data.status, 'QUEUED');
    assert.strictEqual(execUpdate.data.claimedBy, null);
    assert.strictEqual(execUpdate.data.leaseUntil, null);
  });

  it('Scan 3: Retry Scanner enqueues RETRYABLE_FAILURE executions ready for backoff retry', async () => {
    const retryableExecutions = [
      {
        id: 'exec-retry-1',
        workspaceId: 'ws-1',
        socialAccountId: 'acc-1',
        interactionId: 'int-1',
        status: 'RETRYABLE_FAILURE',
        attemptCount: 1,
      },
    ];

    const harness = createTestHarness({ retryableExecutions });
    await harness.service.reconcile();

    const retryJob = harness.enqueuedPublishJobs.find(j => j.opts.jobId === 'reply-publish_exec-retry-1');
    assert.ok(retryJob);

    const execUpdate = harness.dbUpdates.find(u => u.model === 'replyExecution' && u.where.id === 'exec-retry-1');
    assert.ok(execUpdate);
    assert.strictEqual(execUpdate.data.status, 'QUEUED');
  });

  it('Scan 5: Stale Sync Lease Reclaimer resets expired SYNCING leases back to IDLE', async () => {
    const staleSyncs = [
      {
        id: 'sync-stale-1',
        rootThreadsPostId: 'p-100',
        syncStatus: 'SYNCING',
      },
    ];

    const harness = createTestHarness({ staleSyncs });
    await harness.service.reconcile();

    const syncUpdate = harness.dbUpdates.find(u => u.model === 'engagementSyncState' && u.where.id === 'sync-stale-1');
    assert.ok(syncUpdate);
    assert.strictEqual(syncUpdate.data.syncStatus, 'IDLE');
    assert.strictEqual(syncUpdate.data.leaseToken, null);
  });

  it('Scan 6: Editorial Personalization triggers vector indexing of pending feedback', async () => {
    const harness = createTestHarness();
    await harness.service.reconcile();

    assert.strictEqual(harness.getEditorialScanCalled(), true);
  });
});

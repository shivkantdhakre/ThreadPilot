import { describe, it } from 'node:test';
import assert from 'node:assert';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy';

import { ContentService } from '../dist/content/content.service.js';
import { BadRequestException } from '@nestjs/common';

describe('ContentService Phase 2 Scheduling & Resolution Tests', () => {
  function createService(overrides: { db?: any; publishQueue?: any; redis?: any; config?: any } = {}) {
    const mockDb: any = overrides.db || {
      socialAccount: { findFirst: async () => null },
      contentDraft: { findFirst: async () => null },
      publishedPost: { findUnique: async () => null },
      scheduledPost: { findFirst: async () => null },
      workspace: { findFirst: async () => null },
    };

    const mockPublishQueue: any = overrides.publishQueue || {
      add: async () => ({ id: 'mock-bull-job' }),
      getJob: async () => null,
    };

    const mockRedis: any = overrides.redis || {
      set: async () => 'OK',
      del: async () => 1,
    };

    const mockConfig: any = overrides.config || {
      get: (key: string, def?: any) => {
        if (key === 'TOKEN_ENCRYPTION_KEY') return 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
        if (key === 'TOKEN_ENCRYPTION_KEY_VERSION') return 1;
        if (key === 'THREADS_API_BASE_URL') return 'https://graph.threads.net/v1.0';
        return def;
      },
    };

    const mockJobDispatcher: any = {
      dispatchContentGeneration: async () => {},
      dispatchContentImprovement: async () => {},
    };

    return new ContentService(mockJobDispatcher, mockPublishQueue, mockRedis, mockConfig, mockDb);
  }

  describe('scheduleDraft Validation Contracts', () => {
    it('rejects scheduledAt without explicit UTC indicator or offset', async () => {
      const service = createService();
      await assert.rejects(
        () =>
          service.scheduleDraft('ws-1', 'draft-1', {
            scheduledAt: '2026-09-25T14:30:00', // Missing Z or timezone offset
            timezone: 'UTC',
            socialAccountId: 'acc-1',
          }),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.ok(err.message.includes('explicit UTC (Z) or offset'));
          return true;
        },
      );
    });

    it('rejects scheduledAt in the past', async () => {
      const service = createService();
      await assert.rejects(
        () =>
          service.scheduleDraft('ws-1', 'draft-1', {
            scheduledAt: '2020-01-01T00:00:00Z',
            timezone: 'UTC',
            socialAccountId: 'acc-1',
          }),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.ok(err.message.includes('must be in the future'));
          return true;
        },
      );
    });

    it('rejects invalid IANA timezone', async () => {
      const service = createService();
      const futureTime = new Date(Date.now() + 3600_000).toISOString();
      await assert.rejects(
        () =>
          service.scheduleDraft('ws-1', 'draft-1', {
            scheduledAt: futureTime,
            timezone: 'Mars/Phobos',
            socialAccountId: 'acc-1',
          }),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.ok(err.message.includes('Invalid IANA timezone'));
          return true;
        },
      );
    });

    it('rejects when social account is not connected or not found', async () => {
      const service = createService();
      const futureTime = new Date(Date.now() + 3600_000).toISOString();
      await assert.rejects(
        () =>
          service.scheduleDraft('ws-1', 'draft-1', {
            scheduledAt: futureTime,
            timezone: 'America/New_York',
            socialAccountId: 'acc-nonexistent',
          }),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.ok(err.message.includes('Social account not found'));
          return true;
        },
      );
    });

    it('successfully schedules a draft with canonical outbound text and BullMQ job', async () => {
      const futureTime = new Date(Date.now() + 3600_000).toISOString();
      let addedJob: any = null;
      const mockPublishQueue = {
        add: async (name: string, payload: any, opts: any) => {
          addedJob = { name, payload, opts };
          return { id: opts.jobId };
        },
        getJob: async () => null,
      };

      const mockDb: any = {
        socialAccount: {
          findFirst: async () => ({ id: 'acc-1', workspaceId: 'ws-1', isConnected: true }),
        },
        contentDraft: {
          findFirst: async () => ({
            id: 'draft-1',
            status: 'READY',
            versions: [
              {
                id: 'ver-1',
                body: 'Hello World  \r\n\r\nwith trailing whitespace   ',
                hook: 'Hook text',
                cta: 'CTA text',
              },
            ],
          }),
        },
        publishedPost: {
          findUnique: async () => null,
        },
        scheduledPost: {
          findFirst: async () => null,
          update: async () => ({}),
        },
        scheduledPostDispatch: {
          update: async () => ({}),
        },
        $transaction: async (fn: any) => {
          const tx = {
            scheduledPost: {
              create: async ({ data }: any) => ({
                id: 'sched-1',
                ...data,
              }),
            },
            scheduledPostDispatch: {
              create: async ({ data }: any) => ({
                id: 'disp-1',
                ...data,
              }),
            },
          };
          return fn(tx);
        },
      };

      const service = createService({ db: mockDb, publishQueue: mockPublishQueue });
      const result = await service.scheduleDraft('ws-1', 'draft-1', {
        scheduledAt: futureTime,
        timezone: 'UTC',
        socialAccountId: 'acc-1',
      });

      assert.strictEqual(result.id, 'sched-1');
      assert.strictEqual(result.status, 'SCHEDULED');
      // Verify canonical text transformation (trims outer whitespace, preserves internal content)
      assert.strictEqual(
        result.contentSnapshot.body,
        'Hello World  \r\n\r\nwith trailing whitespace',
      );
      // Verify BullMQ job dispatch
      assert.ok(addedJob);
      assert.strictEqual(addedJob.opts.jobId, 'publish-sched-1');
      assert.strictEqual(addedJob.payload.scheduledPostId, 'sched-1');
    });
  });

  describe('cancelSchedule Contracts', () => {
    it('cancels scheduled post and attempts cleanup of 0..5 lifecycle jobs', async () => {
      const removedJobs: string[] = [];
      const mockPublishQueue = {
        getJob: async (id: string) => ({
          remove: async () => {
            removedJobs.push(id);
          },
        }),
      };
      const mockDb: any = {
        $executeRaw: async () => 1, // 1 row updated
      };

      const service = createService({ db: mockDb, publishQueue: mockPublishQueue });
      const res = await service.cancelSchedule('ws-1', 'sched-1');

      assert.strictEqual(res.success, true);
      // publish-sched-1 + 6 retry jobs (0..5) + 6 reclaim jobs (0..5) = 13 jobs
      assert.strictEqual(removedJobs.length, 13);
      assert.ok(removedJobs.includes('publish-sched-1'));
      assert.ok(removedJobs.includes('publish-sched-1-retry-0'));
      assert.ok(removedJobs.includes('publish-sched-1-reclaim-5'));
    });

    it('rejects cancellation when post is not in cancellable status (e.g. RECOVERY_REQUIRED)', async () => {
      const mockDb: any = {
        $executeRaw: async () => 0, // CAS match failed
      };

      const service = createService({ db: mockDb });
      await assert.rejects(
        () => service.cancelSchedule('ws-1', 'sched-1'),
        (err: any) => {
          assert.ok(err.message.includes('requires explicit operator resolution'));
          return true;
        },
      );
    });
  });

  describe('resolveSchedule Operator Certification Contracts', () => {
    it('rejects CONFIRM_NOT_PUBLISHED if operator certification confirmUnpublished is false', async () => {
      const mockDb: any = {
        workspace: {
          findFirst: async () => ({ id: 'ws-1' }),
        },
        scheduledPost: {
          findFirst: async () => ({
            id: 'sched-1',
            status: 'RECOVERY_REQUIRED',
            socialAccountId: 'acc-1',
            containerId: null,
          }),
        },
      };

      const service = createService({ db: mockDb });
      await assert.rejects(
        () =>
          service.resolveSchedule('ws-1', 'usr-1', 'sched-1', {
            action: 'CONFIRM_NOT_PUBLISHED',
            confirmUnpublished: false,
          }),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.ok(err.message.includes('Operator certification required'));
          return true;
        },
      );
    });

    it('rejects CONFIRM_PUBLISHED if threadsPostId is missing', async () => {
      const mockDb: any = {
        workspace: {
          findFirst: async () => ({ id: 'ws-1' }),
        },
        scheduledPost: {
          findFirst: async () => ({
            id: 'sched-1',
            status: 'RECOVERY_REQUIRED',
            socialAccountId: 'acc-1',
          }),
        },
      };

      const service = createService({ db: mockDb });
      await assert.rejects(
        () =>
          service.resolveSchedule('ws-1', 'usr-1', 'sched-1', {
            action: 'CONFIRM_PUBLISHED',
          } as any),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.ok(err.message.includes('threadsPostId is required'));
          return true;
        },
      );
    });
  });
});

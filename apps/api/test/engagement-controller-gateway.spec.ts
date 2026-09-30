import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EngagementService } from '../dist/engagement/engagement.service.js';
import { prisma } from '@threadpilot/database';

describe('Phase 3F: EngagementService Keyset Pagination, Optimistic Locking & Operator Recovery Gateway Tests', () => {
  function createTestService() {
    const enqueuedIngestJobs: any[] = [];
    const enqueuedDraftJobs: any[] = [];
    const enqueuedPublishJobs: any[] = [];

    const mockIngestQueue: any = {
      add: async (name: string, data: any, opts: any) => {
        enqueuedIngestJobs.push({ name, data, opts });
        return { id: 'job-ing-1' };
      },
    };
    const mockDraftQueue: any = {
      add: async (name: string, data: any, opts: any) => {
        enqueuedDraftJobs.push({ name, data, opts });
        return { id: 'job-dft-1' };
      },
    };
    const mockPublishQueue: any = {
      add: async (name: string, data: any, opts: any) => {
        enqueuedPublishJobs.push({ name, data, opts });
        return { id: 'job-pub-1' };
      },
    };

    const service = new EngagementService(
      mockIngestQueue,
      mockDraftQueue,
      mockPublishQueue,
    );

    return {
      service,
      enqueuedIngestJobs,
      enqueuedDraftJobs,
      enqueuedPublishJobs,
    };
  }

  describe('Keyset & Cursor Pagination Contracts', () => {
    it('listInteractions: limits items and returns meta with nextCursor when hasMore is true', async () => {
      const { service } = createTestService();
      const mockInteractions = [
        { id: 'int-1', priorityScore: 9, createdAt: new Date() },
        { id: 'int-2', priorityScore: 8, createdAt: new Date() },
        { id: 'int-3', priorityScore: 7, createdAt: new Date() }, // 3 items for limit 2
      ];

      const originalFindMany = prisma.interaction.findMany;
      prisma.interaction.findMany = (async (args: any) => {
        return mockInteractions;
      }) as any;

      try {
        const result = await service.listInteractions('ws-1', { limit: 2 });
        assert.strictEqual(result.data.length, 2);
        assert.strictEqual(result.meta.count, 2);
        assert.strictEqual(result.meta.hasMore, true);
        assert.strictEqual(result.meta.nextCursor, 'int-2');
      } finally {
        prisma.interaction.findMany = originalFindMany;
      }
    });

    it('listInteractions: returns nextCursor = null when hasMore is false', async () => {
      const { service } = createTestService();
      const mockInteractions = [
        { id: 'int-1', priorityScore: 9, createdAt: new Date() },
      ];

      const originalFindMany = prisma.interaction.findMany;
      prisma.interaction.findMany = (async () => mockInteractions) as any;

      try {
        const result = await service.listInteractions('ws-1', { limit: 10 });
        assert.strictEqual(result.data.length, 1);
        assert.strictEqual(result.meta.hasMore, false);
        assert.strictEqual(result.meta.nextCursor, null);
      } finally {
        prisma.interaction.findMany = originalFindMany;
      }
    });
  });

  describe('If-Match Optimistic Concurrency Control (Conflict Detection)', () => {
    it('throws 409 ConflictException when ifMatchVersionNumber mismatches current draft version', async () => {
      const { service } = createTestService();
      const mockInteraction = {
        id: 'int-1',
        workspaceId: 'ws-1',
        replyDraft: {
          id: 'draft-1',
          currentVersion: {
            id: 'ver-2',
            versionNumber: 2, // current is v2
          },
        },
      };

      const originalFindFirst = prisma.interaction.findFirst;
      prisma.interaction.findFirst = (async () => mockInteraction) as any;

      try {
        // User provides stale If-Match version 1
        await assert.rejects(
          () => service.updateDraft('ws-1', 'int-1', 'New updated reply body', 1, 'user-1'),
          (err: any) => {
            assert.ok(err instanceof ConflictException);
            const response = err.getResponse();
            assert.strictEqual((response as any).error, 'STALE_VERSION');
            assert.strictEqual((response as any).currentVersionNumber, 2);
            return true;
          },
        );
      } finally {
        prisma.interaction.findFirst = originalFindFirst;
      }
    });

    it('succeeds and creates new monotonic version when ifMatchVersionNumber matches', async () => {
      const { service } = createTestService();
      const mockInteraction = {
        id: 'int-1',
        workspaceId: 'ws-1',
        replyDraft: {
          id: 'draft-1',
          currentVersion: {
            id: 'ver-2',
            versionNumber: 2,
          },
        },
      };

      let createdVersion: any = null;
      let updatedDraft: any = null;

      const originalFindFirst = prisma.interaction.findFirst;
      const originalTransaction = prisma.$transaction;

      prisma.interaction.findFirst = (async () => mockInteraction) as any;
      prisma.$transaction = (async (cb: any) => {
        const mockTx = {
          replyDraftVersion: {
            create: async (args: any) => {
              createdVersion = args.data;
              return { id: 'ver-3', ...args.data };
            },
          },
          replyDraft: {
            update: async (args: any) => {
              updatedDraft = args.data;
              return {};
            },
          },
          interaction: {
            update: async () => ({}),
          },
        };
        return cb(mockTx);
      }) as any;

      try {
        const result = await service.updateDraft('ws-1', 'int-1', 'Valid updated reply text', 2, 'user-1');
        assert.strictEqual(result.success, true);
        assert.ok(createdVersion);
        assert.strictEqual(createdVersion.versionNumber, 3, 'New version must be v3');
        assert.strictEqual(createdVersion.body, 'Valid updated reply text');
        assert.strictEqual(updatedDraft.currentVersionId, 'ver-3');
      } finally {
        prisma.interaction.findFirst = originalFindFirst;
        prisma.$transaction = originalTransaction;
      }
    });
  });

  describe('Draft Approval & Outbox Fencing', () => {
    it('approveDraft: validates version existence, creates execution, and enqueues to publish queue', async () => {
      const { service, enqueuedPublishJobs } = createTestService();
      const mockInteraction = {
        id: 'int-app-1',
        workspaceId: 'ws-1',
        socialAccountId: 'acc-1',
        replyDraft: {
          id: 'draft-app-1',
          currentVersionId: 'ver-app-1',
        },
      };

      const mockVersion = {
        id: 'ver-app-1',
        replyDraftId: 'draft-app-1',
        versionNumber: 1,
        body: 'Approved content text',
      };

      const originalFindFirst = prisma.interaction.findFirst;
      const originalFindUnique = prisma.replyDraftVersion.findUnique;
      const originalTransaction = prisma.$transaction;

      prisma.interaction.findFirst = (async () => mockInteraction) as any;
      prisma.replyDraftVersion.findUnique = (async () => mockVersion) as any;
      prisma.$transaction = (async (cb: any) => {
        const mockTx = {
          $executeRaw: async () => 1, // CAS check succeeds (1 row updated)
          replyDraft: { update: async () => ({}) },
          replyExecution: {
            create: async (args: any) => ({
              id: 'exec-app-1',
              status: 'CREATED',
              ...args.data,
            }),
          },
          eventOutbox: {
            create: async () => ({ id: 'outbox-1' }),
          },
          interaction: {
            update: async () => ({}),
          },
          auditLog: {
            create: async () => ({}),
          },
        };
        return cb(mockTx);
      }) as any;

      try {
        const result = await service.approveDraft('ws-1', 'int-app-1', 'ver-app-1', 'user-1');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.replyExecutionId, 'exec-app-1');
        assert.strictEqual(enqueuedPublishJobs.length, 1);
        assert.strictEqual(enqueuedPublishJobs[0].data.replyExecutionId, 'exec-app-1');
      } finally {
        prisma.interaction.findFirst = originalFindFirst;
        prisma.replyDraftVersion.findUnique = originalFindUnique;
        prisma.$transaction = originalTransaction;
      }
    });
  });

  describe('Operator Ambiguity Resolution Actions', () => {
    it('resolveExecution: CONFIRMED_PUBLISHED records external post ID and marks interaction REPLIED', async () => {
      const { service } = createTestService();
      const mockExecution = {
        id: 'exec-rec-1',
        workspaceId: 'ws-1',
        status: 'RECOVERY_REQUIRED',
        recoveryResolution: 'OPERATOR_REQUIRED',
        interaction: { id: 'int-rec-1', status: 'RECOVERY_REQUIRED' },
        replyDraft: { id: 'dft-rec-1' },
      };

      const originalFindFirst = prisma.replyExecution.findFirst;
      const originalTransaction = prisma.$transaction;

      let recordedExecStatus = '';
      let recordedIntStatus = '';
      let recordedExternalId = '';

      prisma.replyExecution.findFirst = (async () => mockExecution) as any;
      prisma.$transaction = (async (cb: any) => {
        const mockTx = {
          replyExecution: {
            update: async (args: any) => {
              recordedExecStatus = args.data.status;
              recordedExternalId = args.data.publishedThreadPostId;
              return { id: 'exec-rec-1', status: args.data.status };
            },
          },
          replyDraft: { update: async () => ({}) },
          interaction: {
            update: async (args: any) => {
              recordedIntStatus = args.data.status;
              return {};
            },
          },
          auditLog: {
            create: async () => ({}),
          },
        };
        return cb(mockTx);
      }) as any;

      try {
        const result = await service.resolveExecution(
          'ws-1',
          'exec-rec-1',
          {
            resolution: 'CONFIRMED_PUBLISHED',
            externalPostId: 'threads-confirmed-999',
            notes: 'Verified manually on profile feed',
          },
          'admin-1',
        );

        assert.strictEqual(result.success, true);
        assert.strictEqual(recordedExecStatus, 'PUBLISHED');
        assert.strictEqual(recordedExternalId, 'threads-confirmed-999');
        assert.strictEqual(recordedIntStatus, 'REPLIED');
      } finally {
        prisma.replyExecution.findFirst = originalFindFirst;
        prisma.$transaction = originalTransaction;
      }
    });
  });
});

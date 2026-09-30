import { describe, it } from 'node:test';
import assert from 'node:assert';
import { StyleProcessor } from '../dist/processors/style.processor.js';
import { prisma } from '@threadpilot/database';

describe('StyleProcessor Unit & Invariant Tests', () => {
  function createProcessor(overrides: { graphState?: any; graphThrows?: boolean } = {}) {
    const progressUpdates: any[] = [];
    const mockProgressService = {
      update: async (requestId: string, payload: any) => {
        progressUpdates.push({ requestId, ...payload });
      },
    };

    const mockAiFactory = {
      getProvider: () => ({
        chat: async () => ({ text: 'mock AI response' }),
      }),
    };

    const processor = new StyleProcessor(mockProgressService as any, mockAiFactory as any);

    return { processor, progressUpdates };
  }

  it('idempotency: skips processing when JobRecord is already COMPLETE', async () => {
    const { processor, progressUpdates } = createProcessor();

    const origFindUnique = prisma.jobRecord.findUnique;
    (prisma.jobRecord as any).findUnique = async () => ({
      id: 'job-1',
      requestId: 'req-completed-1',
      status: 'COMPLETE',
    });

    try {
      const mockJob: any = {
        data: {
          requestId: 'req-completed-1',
          workspaceId: '00000000-0000-0000-0000-000000000001',
          socialAccountId: 'acc-1',
        },
      };

      await processor.handle(mockJob);

      // Verify no progress updates occurred because it returned early
      assert.strictEqual(progressUpdates.length, 0);
    } finally {
      prisma.jobRecord.findUnique = origFindUnique;
    }
  });

  it('records failure and updates progress when graph fails', async () => {
    const { processor, progressUpdates } = createProcessor();

    const origFindUnique = prisma.jobRecord.findUnique;
    const origUserProfileFindUnique = prisma.userProfile.findUnique;
    (prisma.jobRecord as any).findUnique = async () => ({
      id: 'job-2',
      requestId: 'req-fail-2',
      status: 'PENDING',
    });

    (prisma.userProfile as any).findUnique = async () => null;

    try {
      const mockJob: any = {
        data: {
          requestId: 'req-fail-2',
          workspaceId: '00000000-0000-0000-0000-000000000001',
          socialAccountId: 'acc-nonexistent',
        },
      };

      await assert.rejects(async () => {
        await processor.handle(mockJob);
      });

      // Verify that progress service logged running before failure
      assert.ok(progressUpdates.length > 0);
      assert.strictEqual(progressUpdates[0].status, 'RUNNING');
    } finally {
      prisma.jobRecord.findUnique = origFindUnique;
      prisma.userProfile.findUnique = origUserProfileFindUnique;
    }
  });
});

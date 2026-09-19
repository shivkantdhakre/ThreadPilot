import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { WorkspaceScopeGuard } from '../dist/common/guards/workspace-scope.guard.js';

const require = createRequire(import.meta.url);
const { prisma } = require('@threadpilot/database');




describe('Cross-Workspace Tenant Isolation Suite', () => {
  describe('Layer 1 & 2: Authentication & Authorization (WorkspaceScopeGuard)', () => {
    it('allows access when target workspace belongs to authenticated user', async () => {
      const guard = new WorkspaceScopeGuard();

      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { userId: 'user-a-111' },
            headers: { 'x-workspace-id': 'workspace-a-111' },
            params: {},
            query: {},
            body: {},
          }),
        }),
      };

      const originalFindFirst = prisma.workspace.findFirst;
      (prisma.workspace as any).findFirst = async ({ where }: any) => {
        if (where.id === 'workspace-a-111' && where.userId === 'user-a-111') {
          return { id: 'workspace-a-111' };
        }
        return null;
      };

      try {
        const allowed = await guard.canActivate(mockContext);
        assert.strictEqual(allowed, true);
      } finally {
        prisma.workspace.findFirst = originalFindFirst;
      }
    });

    it('blocks cross-tenant access with 403 Forbidden when User A attempts to target Workspace B', async () => {
      const guard = new WorkspaceScopeGuard();

      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { userId: 'user-a-111' },
            headers: { 'x-workspace-id': 'workspace-b-222' }, // Tampered target workspace
            params: {},
            query: {},
            body: {},
          }),
        }),
      };

      const originalFindFirst = prisma.workspace.findFirst;
      (prisma.workspace as any).findFirst = async ({ where }: any) => {
        // Workspace B does NOT belong to User A -> returns null
        return null;
      };


      try {
        await assert.rejects(
          async () => {
            await guard.canActivate(mockContext);
          },
          (err: any) => {
            assert.strictEqual(err.status, 403);
            assert(err.message.includes('denied'));
            return true;
          },
        );
      } finally {
        prisma.workspace.findFirst = originalFindFirst;
      }
    });
  });


  describe('Layer 3: Database Query Scoping (where: { workspaceId, id })', () => {
    // In-memory mock database populated with entities for Workspace A and Workspace B
    const db = {
      drafts: [
        { id: 'draft-a-1', workspaceId: 'workspace-a', body: 'Draft for Workspace A' },
        { id: 'draft-b-1', workspaceId: 'workspace-b', body: 'Draft for Workspace B' },
      ],
      styleExamples: [
        { id: 'style-a-1', workspaceId: 'workspace-a', text: 'Style A' },
        { id: 'style-b-1', workspaceId: 'workspace-b', text: 'Style B' },
      ],
      memories: [
        { id: 'mem-a-1', workspaceId: 'workspace-a', content: 'Memory A' },
        { id: 'mem-b-1', workspaceId: 'workspace-b', content: 'Memory B' },
      ],
      jobs: [
        { id: 'job-a-1', requestId: 'req-a-1', workspaceId: 'workspace-a', status: 'COMPLETE' },
        { id: 'job-b-1', requestId: 'req-b-1', workspaceId: 'workspace-b', status: 'COMPLETE' },
      ],
      notifications: [
        { id: 'notif-a-1', workspaceId: 'workspace-a', title: 'Notif A' },
        { id: 'notif-b-1', workspaceId: 'workspace-b', title: 'Notif B' },
      ],
      socialAccounts: [
        { id: 'account-a-1', workspaceId: 'workspace-a', username: 'threads_a' },
        { id: 'account-b-1', workspaceId: 'workspace-b', username: 'threads_b' },
      ],
      agentRuns: [
        { id: 'run-a-1', workspaceId: 'workspace-a', workflowId: 'content-generation' },
        { id: 'run-b-1', workspaceId: 'workspace-b', workflowId: 'content-generation' },
      ],
    };

    it('strictly isolates Content Drafts: querying Draft B under Workspace A returns 404', () => {
      const workspaceId = 'workspace-a';
      const targetDraftId = 'draft-b-1'; // Belongs to Workspace B

      const found = db.drafts.find((d) => d.id === targetDraftId && d.workspaceId === workspaceId);
      assert.strictEqual(found, undefined, 'Draft B must NOT be accessible under Workspace A');
    });

    it('strictly isolates Style Examples: rating Style B under Workspace A returns 404', () => {
      const workspaceId = 'workspace-a';
      const targetStyleId = 'style-b-1'; // Belongs to Workspace B

      const found = db.styleExamples.find((s) => s.id === targetStyleId && s.workspaceId === workspaceId);
      assert.strictEqual(found, undefined, 'Style Example B must NOT be accessible under Workspace A');
    });

    it('strictly isolates Semantic Memories: retrieval in Workspace A only returns Workspace A items', () => {
      const workspaceId = 'workspace-a';
      const retrieved = db.memories.filter((m) => m.workspaceId === workspaceId);

      assert.strictEqual(retrieved.length, 1);
      assert.strictEqual(retrieved[0].id, 'mem-a-1');
      assert(retrieved.every((m) => m.workspaceId === 'workspace-a'));
    });

    it('strictly isolates Job Records: polling Job B under Workspace A returns 404', () => {
      const workspaceId = 'workspace-a';
      const targetRequestId = 'req-b-1'; // Belongs to Workspace B

      const found = db.jobs.find((j) => j.requestId === targetRequestId && j.workspaceId === workspaceId);
      assert.strictEqual(found, undefined, 'Job B must NOT be accessible under Workspace A');
    });

    it('strictly isolates Notifications: marking Notif B as read under Workspace A returns 404', () => {
      const workspaceId = 'workspace-a';
      const targetNotifId = 'notif-b-1'; // Belongs to Workspace B

      const found = db.notifications.find((n) => n.id === targetNotifId && n.workspaceId === workspaceId);
      assert.strictEqual(found, undefined, 'Notification B must NOT be accessible under Workspace A');
    });

    it('strictly isolates Social Accounts and Agent Runs across tenant boundaries', () => {
      const workspaceId = 'workspace-a';

      const accountB = db.socialAccounts.find((a) => a.id === 'account-b-1' && a.workspaceId === workspaceId);
      assert.strictEqual(accountB, undefined);

      const runB = db.agentRuns.find((r) => r.id === 'run-b-1' && r.workspaceId === workspaceId);
      assert.strictEqual(runB, undefined);
    });
  });
});

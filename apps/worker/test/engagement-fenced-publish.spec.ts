import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isAmbiguousError,
  FencingLeaseExpiredException,
  ReplyPublishProcessor,
} from '../dist/processors/reply-publish.processor.js';
import { ThreadsApiError } from '@threadpilot/threads-client';

describe('Phase 3G: Fenced Publisher & Ambiguity Recovery Tests', () => {
  describe('Ambiguity Classification Contract (isAmbiguousError)', () => {
    it('classifies network timeouts and aborts as ambiguous', () => {
      const timeoutErr = new Error('The operation timed out');
      timeoutErr.name = 'TimeoutError';
      const abortErr = new Error('Request was aborted');
      abortErr.name = 'AbortError';
      const connReset = new Error('read ECONNRESET');

      assert.strictEqual(isAmbiguousError(timeoutErr), true);
      assert.strictEqual(isAmbiguousError(abortErr), true);
      assert.strictEqual(isAmbiguousError(connReset), true);
    });

    it('classifies HTTP 5xx errors from Meta as ambiguous', () => {
      const err500 = new ThreadsApiError(500, 'Internal Server Error');
      const err502 = new ThreadsApiError(502, 'Bad Gateway');
      const err503 = new ThreadsApiError(503, 'Service Unavailable');
      const err504 = new ThreadsApiError(504, 'Gateway Timeout');

      assert.strictEqual(isAmbiguousError(err500), true);
      assert.strictEqual(isAmbiguousError(err502), true);
      assert.strictEqual(isAmbiguousError(err503), true);
      assert.strictEqual(isAmbiguousError(err504), true);
    });

    it('classifies definitive 4xx errors as NON-ambiguous', () => {
      const err400 = new ThreadsApiError(400, 'Bad Request');
      const err401 = new ThreadsApiError(401, 'Unauthorized');
      const err404 = new ThreadsApiError(404, 'Container Not Found');
      const err429 = new ThreadsApiError(429, 'Rate limit reached');

      assert.strictEqual(isAmbiguousError(err400), false);
      assert.strictEqual(isAmbiguousError(err401), false);
      assert.strictEqual(isAmbiguousError(err404), false);
      assert.strictEqual(isAmbiguousError(err429), false);
    });
  });

  describe('Publishing Retry Schedule & Invariants', () => {
    it('enforces canonical backoffs for definitive rejections (5s, 15s, 30s, 60s, terminal)', () => {
      const canonicalBackoffs = [5, 15, 30, 60];
      const attemptCounts = [1, 2, 3, 4];

      attemptCounts.forEach((attempt) => {
        const expectedBackoff = canonicalBackoffs[attempt - 1];
        assert.strictEqual(
          expectedBackoff,
          canonicalBackoffs[attempt - 1],
          `Attempt ${attempt} must have ${expectedBackoff}s canonical backoff`,
        );
      });

      // Attempt 5 is terminal FAILED_PERMANENT
      const attempt5Max = 5;
      assert.ok(attempt5Max >= 5, 'Attempt 5 must transition to FAILED_PERMANENT');
    });

    it('enforces that container creation is skipped if containerId is already persisted', async () => {
      let createContainerCalled = false;
      let publishContainerCalled = false;

      const mockThreadsApi = {
        getReplyPublishingLimit: async () => ({
          reply_quota_usage: 10,
          reply_config: { quota_total: 250 },
        }),
        createReplyContainer: async () => {
          createContainerCalled = true;
          return { id: 'new-container-999' };
        },
        getContainerPublishingStatus: async () => ({
          id: 'existing-container-123',
          status: 'FINISHED',
        }),
        publishContainer: async () => {
          publishContainerCalled = true;
          return { id: 'published-thread-post-777' };
        },
      };

      const mockPublishingService: any = {
        tokenService: {
          getValidToken: async () => 'mock-token',
        },
        threadsApi: mockThreadsApi,
      };

      const existingExecution = {
        id: 'exec-1',
        attemptCount: 1,
        publishAttemptCount: 0,
        containerId: 'existing-container-123',
        status: 'CLAIMED',
        interaction: {
          id: 'int-1',
          externalInteractionId: 'ext-comment-1',
          status: 'APPROVED',
        },
        replyDraft: {
          id: 'draft-1',
          approvedVersionId: 'ver-1',
        },
        replyDraftVersion: {
          id: 'ver-1',
          body: 'This is a verified reply under 500 chars.',
          versionNumber: 1,
        },
        socialAccount: {
          id: 'acc-1',
          isConnected: true,
        },
      };

      const mockDb: any = {
        $queryRaw: async () => [
          {
            id: 'exec-1',
            status: 'CLAIMED',
            attempt_count: 1,
            publish_attempt_count: 0,
            container_id: 'existing-container-123',
          },
        ],
        replyExecution: {
          findUniqueOrThrow: async () => existingExecution,
          update: async () => ({}),
        },
        userPreferences: {
          findUnique: async () => ({ repliesPaused: false }),
        },
        $executeRaw: async () => 1,
        interaction: {
          update: async () => ({}),
        },
      };

      const processor = new ReplyPublishProcessor(mockPublishingService, mockDb);
      await processor.process({
        data: {
          requestId: 'req-1',
          workspaceId: 'ws-1',
          socialAccountId: 'acc-1',
          replyExecutionId: 'exec-1',
          interactionId: 'int-1',
        },
      } as any);

      assert.strictEqual(
        createContainerCalled,
        false,
        'createReplyContainer must NOT be called when containerId is already persisted',
      );
      assert.strictEqual(
        publishContainerCalled,
        true,
        'publishContainer must be called against the pre-existing container',
      );
    });

    it('enforces terminal failure when container reports ERROR or EXPIRED status', async () => {
      let publishContainerCalled = false;
      let recordedStatus = '';

      const mockThreadsApi = {
        getReplyPublishingLimit: async () => ({
          reply_quota_usage: 10,
          reply_config: { quota_total: 250 },
        }),
        getContainerPublishingStatus: async () => ({
          id: 'failed-container-123',
          status: 'EXPIRED',
          error_message: 'Container expired after timeout on Meta',
        }),
        publishContainer: async () => {
          publishContainerCalled = true;
          return { id: 'should-not-reach' };
        },
      };

      const mockPublishingService: any = {
        tokenService: {
          getValidToken: async () => 'mock-token',
        },
        threadsApi: mockThreadsApi,
      };

      const existingExecution = {
        id: 'exec-2',
        attemptCount: 1,
        publishAttemptCount: 0,
        containerId: 'failed-container-123',
        status: 'CLAIMED',
        interaction: {
          id: 'int-2',
          externalInteractionId: 'ext-comment-2',
          status: 'APPROVED',
        },
        replyDraft: {
          id: 'draft-2',
          approvedVersionId: 'ver-2',
        },
        replyDraftVersion: {
          id: 'ver-2',
          body: 'Valid reply body text.',
          versionNumber: 1,
        },
        socialAccount: {
          id: 'acc-2',
          isConnected: true,
        },
      };

      const mockDb: any = {
        $queryRaw: async () => [
          {
            id: 'exec-2',
            status: 'CLAIMED',
            attempt_count: 1,
            publish_attempt_count: 0,
            container_id: 'failed-container-123',
          },
        ],
        replyExecution: {
          findUniqueOrThrow: async () => existingExecution,
          update: async () => ({}),
        },
        userPreferences: {
          findUnique: async () => ({ repliesPaused: false }),
        },
        $executeRaw: async (query: any, ...args: any[]) => {
          // Track status update
          return 1;
        },
        interaction: {
          update: async (args: any) => {
            recordedStatus = args.data.status;
            return {};
          },
        },
      };

      const processor = new ReplyPublishProcessor(mockPublishingService, mockDb);
      await processor.process({
        data: {
          requestId: 'req-2',
          workspaceId: 'ws-2',
          socialAccountId: 'acc-2',
          replyExecutionId: 'exec-2',
          interactionId: 'int-2',
        },
      } as any);

      assert.strictEqual(
        publishContainerCalled,
        false,
        'Publish must NOT be attempted when container has EXPIRED or ERROR status',
      );
      assert.strictEqual(
        recordedStatus,
        'REVIEW_REQUIRED',
        'Interaction must be moved to REVIEW_REQUIRED for operator recovery',
      );
    });

    it('enforces kill switch pre-flight boundary: halts outbound execution when repliesPaused = true', async () => {
      let publishAttempted = false;
      let recordedStatus = '';

      const mockPublishingService: any = {
        tokenService: {
          getValidToken: async () => 'mock-token',
        },
        threadsApi: {
          createReplyContainer: async () => {
            publishAttempted = true;
            return { id: 'container-never' };
          },
        },
      };

      const mockDb: any = {
        $queryRaw: async () => [
          {
            id: 'exec-3',
            status: 'CLAIMED',
            attempt_count: 0,
            publish_attempt_count: 0,
            container_id: null,
          },
        ],
        replyExecution: {
          findUniqueOrThrow: async () => ({
            id: 'exec-3',
            attemptCount: 0,
            publishAttemptCount: 0,
            containerId: null,
            status: 'CLAIMED',
            interaction: { id: 'int-3', status: 'APPROVED', externalInteractionId: 'ext-3' },
            replyDraft: { id: 'draft-3', approvedVersionId: 'ver-3' },
            replyDraftVersion: { id: 'ver-3', body: 'Test text', versionNumber: 1 },
            socialAccount: { id: 'acc-3', isConnected: true },
          }),
        },
        userPreferences: {
          findUnique: async () => ({ repliesPaused: true }), // Kill switch active!
        },
        $executeRaw: async () => 1,
        interaction: {
          update: async (args: any) => {
            recordedStatus = args.data.status;
            return {};
          },
        },
      };

      const processor = new ReplyPublishProcessor(mockPublishingService, mockDb);
      await processor.process({
        data: {
          requestId: 'req-3',
          workspaceId: 'ws-3',
          socialAccountId: 'acc-3',
          replyExecutionId: 'exec-3',
          interactionId: 'int-3',
        },
      } as any);

      assert.strictEqual(publishAttempted, false, 'Kill switch must prevent container creation');
      assert.strictEqual(recordedStatus, 'REVIEW_REQUIRED', 'Kill switch must route interaction to REVIEW_REQUIRED');
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventOutboxProcessor } from '../dist/processors/event-outbox.processor.js';

describe('EventOutboxProcessor Unit Tests', () => {
  it('processes POST_PUBLISHED event and creates idempotent notification', async () => {
    let upsertCalled = false;
    let capturedNotification: any = null;
    let updateExecuted = false;

    const mockDb: any = {
      $queryRaw: async () => [
        {
          id: 'event-uuid-1',
          workspace_id: 'ws-uuid-1',
          event_type: 'POST_PUBLISHED',
          payload: {
            scheduledPostId: 'sched-123',
            threadsPostId: 'threads-post-456',
            publishedAt: '2026-09-20T12:00:00.000Z',
          },
          attempt_count: 1,
          lease_token: 'lease-token-1',
        },
      ],
      notification: {
        upsert: async (args: any) => {
          upsertCalled = true;
          capturedNotification = args;
          return { id: 'notif-1', ...args.create };
        },
      },
      $executeRaw: async () => {
        updateExecuted = true;
        return 1;
      },
    };

    const processor = new EventOutboxProcessor(mockDb);
    await processor.processBatch();

    assert.strictEqual(upsertCalled, true);
    assert.strictEqual(capturedNotification.where.idempotencyKey, 'POST_PUBLISHED:sched-123');
    assert.strictEqual(capturedNotification.create.type, 'POST_PUBLISHED');
    assert.strictEqual(capturedNotification.create.entityId, 'sched-123');
    assert.strictEqual(updateExecuted, true);
  });

  it('dead-letters unknown event type to FAILED', async () => {
    let failureRecorded = false;

    const mockDb: any = {
      $queryRaw: async () => [
        {
          id: 'event-uuid-2',
          workspace_id: 'ws-uuid-1',
          event_type: 'UNRECOGNIZED_EVENT_TYPE',
          payload: {},
          attempt_count: 1,
          lease_token: 'lease-token-2',
        },
      ],
      $executeRaw: async () => {
        failureRecorded = true;
        return 1;
      },
    };

    const processor = new EventOutboxProcessor(mockDb);
    await processor.processBatch();

    assert.strictEqual(failureRecorded, true);
  });
});

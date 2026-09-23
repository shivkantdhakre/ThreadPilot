import { describe, it } from 'node:test';
import assert from 'node:assert';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy';

import { IngestionService } from '../dist/ingestion/ingestion.service.js';

describe('IngestionService Count Semantics & Filtering Regression Tests', () => {
  const workspaceId = 'ws-ingest-123';

  it('getLatestStatus counts strictly INGESTED posts and segregates PUBLISHED posts', async () => {
    let capturedWhere: any = null;

    const mockDb: any = {
      jobRecord: {
        findFirst: async () => ({
          id: 'job-1',
          type: 'INGESTION',
          status: 'COMPLETED',
          progressMessage: 'Completed importing posts',
        }),
      },
      threadPost: {
        count: async ({ where }: any) => {
          capturedWhere = where;
          // In DB, suppose we have 45 INGESTED posts and 5 PUBLISHED posts
          if (where.sourceType === 'INGESTED') {
            return 45;
          }
          return 50; // Total all posts
        },
      },
    };

    const mockJobDispatcher: any = {
      dispatchIngestion: async () => {},
    };

    const service = new IngestionService(mockJobDispatcher, mockDb);
    const status = await service.getLatestStatus(workspaceId);

    // Verify filter applied
    assert.strictEqual(capturedWhere.sourceType, 'INGESTED', 'Expected query to filter by sourceType: INGESTED');
    assert.strictEqual(capturedWhere.socialAccount.workspaceId, workspaceId);

    // Verify count strictly matches INGESTED
    assert.strictEqual(status.totalIngested, 45, 'totalIngested should only count INGESTED posts');
    assert.strictEqual(status.latestJob?.id, 'job-1');
  });

  it('listIngestedPosts queries only posts where sourceType is INGESTED', async () => {
    let capturedCountWhere: any = null;
    let capturedFindWhere: any = null;

    const mockPosts = [
      { id: 'p1', text: 'Historical post 1', sourceType: 'INGESTED', postedAt: new Date('2026-08-01') },
      { id: 'p2', text: 'Historical post 2', sourceType: 'INGESTED', postedAt: new Date('2026-08-02') },
    ];

    const mockDb: any = {
      threadPost: {
        count: async ({ where }: any) => {
          capturedCountWhere = where;
          return mockPosts.length;
        },
        findMany: async ({ where, skip, take }: any) => {
          capturedFindWhere = where;
          return mockPosts;
        },
      },
    };

    const mockJobDispatcher: any = {
      dispatchIngestion: async () => {},
    };

    const service = new IngestionService(mockJobDispatcher, mockDb);
    const result = await service.listIngestedPosts(workspaceId, { page: 1, limit: 10 });

    assert.strictEqual(capturedCountWhere.sourceType, 'INGESTED');
    assert.strictEqual(capturedFindWhere.sourceType, 'INGESTED');
    assert.strictEqual(result.data.length, 2);
    assert.strictEqual(result.meta.total, 2);
    for (const post of result.data) {
      assert.strictEqual(post.sourceType, 'INGESTED', 'Post list must only contain INGESTED posts');
    }
  });
});

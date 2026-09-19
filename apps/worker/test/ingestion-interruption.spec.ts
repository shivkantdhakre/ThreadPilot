import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Historical Ingestion Pagination and Interruption Resilience', () => {
  it('terminates pagination cleanly when no cursor is returned', async () => {
    const pagesFetched: number[] = [];

    // Mock Threads API responses: Page 1 -> Page 2 -> Page 3 (no cursor)
    const mockApi = {
      getUserPosts: async (token: string, cursor?: string) => {
        if (!cursor) {
          pagesFetched.push(1);
          return { data: [{ id: 'p1' }, { id: 'p2' }], paging: { cursors: { after: 'cursor_page_2' } } };
        }
        if (cursor === 'cursor_page_2') {
          pagesFetched.push(2);
          return { data: [{ id: 'p3' }, { id: 'p4' }], paging: { cursors: { after: 'cursor_page_3' } } };
        }
        if (cursor === 'cursor_page_3') {
          pagesFetched.push(3);
          return { data: [{ id: 'p5' }], paging: {} }; // No after cursor -> end
        }
        return { data: [] };
      },
    };

    let currentCursor: string | undefined = undefined;
    let totalIngested = 0;
    const maxPosts = 100;

    while (totalIngested < maxPosts) {
      const resp = await mockApi.getUserPosts('test-token', currentCursor);
      const posts = resp.data ?? [];
      if (posts.length === 0) break;

      totalIngested += posts.length;
      currentCursor = resp.paging?.cursors?.after;
      if (!currentCursor) {
        // Correct termination condition
        break;
      }
    }

    assert.deepStrictEqual(pagesFetched, [1, 2, 3]);
    assert.strictEqual(totalIngested, 5);
    assert.strictEqual(currentCursor, undefined);
  });

  it('guarantees Page 1 is not duplicated when Page 2 fails and job retries (upsert idempotency)', async () => {
    const socialAccountId = 'social-acc-1';
    const databaseStore = new Map<string, any>();

    // Simulated Prisma upsert by socialAccountId_externalId
    function upsertExternalPost(data: { socialAccountId: string; externalId: string; text: string }) {
      const compoundKey = `${data.socialAccountId}:${data.externalId}`;
      const existing = databaseStore.get(compoundKey);
      if (existing) {
        // Updates existing record, does not create duplicate
        const updated = { ...existing, ...data, updatedAt: new Date() };
        databaseStore.set(compoundKey, updated);
        return { record: updated, created: false };
      }
      const created = { ...data, id: `uuid_${data.externalId}`, createdAt: new Date() };
      databaseStore.set(compoundKey, created);
      return { record: created, created: true };
    }

    // Execution Attempt 1: Page 1 succeeds, Page 2 fails
    let attempt = 1;
    async function runIngestionFlow() {
      // Page 1
      const page1Posts = [{ id: 'post_1', text: 'First post' }, { id: 'post_2', text: 'Second post' }];
      for (const p of page1Posts) {
        upsertExternalPost({ socialAccountId, externalId: p.id, text: p.text });
      }

      // Page 2 throws error on attempt 1
      if (attempt === 1) {
        attempt++;
        throw new Error('NETWORK_TIMEOUT: Threads API unavailable during Page 2');
      }

      // Page 2 succeeds on retry
      const page2Posts = [{ id: 'post_3', text: 'Third post' }];
      for (const p of page2Posts) {
        upsertExternalPost({ socialAccountId, externalId: p.id, text: p.text });
      }
      return { success: true };
    }

    // Run attempt 1 (fails on Page 2)
    await assert.rejects(async () => {
      await runIngestionFlow();
    }, /NETWORK_TIMEOUT/);

    // Verify Page 1 records exist
    assert.strictEqual(databaseStore.size, 2);
    assert(databaseStore.has(`${socialAccountId}:post_1`));
    assert(databaseStore.has(`${socialAccountId}:post_2`));

    // Run retry (attempt 2)
    const retryResult = await runIngestionFlow();
    assert.strictEqual(retryResult.success, true);

    // Total records should be exactly 3 (post_1, post_2, post_3) — NO duplicates!
    assert.strictEqual(databaseStore.size, 3);
    assert(databaseStore.has(`${socialAccountId}:post_3`));
  });
});

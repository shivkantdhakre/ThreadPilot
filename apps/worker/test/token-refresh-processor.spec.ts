import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TokenRefreshProcessor } from '../dist/processors/token-refresh.processor.js';

describe('TokenRefreshProcessor Invariant & Flow Tests', () => {
  function createProcessor(overrides: { getValidTokenThrows?: boolean; refreshThrows?: boolean } = {}) {
    const progressUpdates: any[] = [];
    const mockProgressService = {
      update: async (requestId: string, payload: any) => {
        progressUpdates.push({ requestId, ...payload });
      },
    };

    const mockRedis = {
      set: async () => 'OK',
      get: async () => null,
      del: async () => 1,
    };

    const mockConfig = {
      get: (key: string, def: any) => {
        const c: Record<string, any> = {
          TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
          TOKEN_ENCRYPTION_KEY_VERSION: 1,
          THREADS_API_BASE_URL: 'https://graph.threads.net',
          THREADS_APP_ID: 'app_1',
          THREADS_APP_SECRET: 'secret_1',
        };
        return c[key] !== undefined ? c[key] : def;
      },
    };

    const processor = new TokenRefreshProcessor(
      mockRedis as any,
      mockConfig as any,
      mockProgressService as any,
    );

    let getValidTokenCalled = false;
    let refreshCalled = false;

    (processor as any).tokenService = {
      getValidToken: async (id: string) => {
        getValidTokenCalled = true;
        if (overrides.getValidTokenThrows) {
          throw new Error('OAuth token revoked by user');
        }
        return 'fresh-valid-token-123';
      },
      refresh: async (id: string) => {
        refreshCalled = true;
        if (overrides.refreshThrows) {
          throw new Error('Meta API 500 server error');
        }
        return 'force-refreshed-token-456';
      },
    };

    return {
      processor,
      progressUpdates,
      getCalls: () => ({ getValidTokenCalled, refreshCalled }),
    };
  }

  it('standard flow: calls getValidToken when force is false and updates progress to COMPLETE', async () => {
    const { processor, progressUpdates, getCalls } = createProcessor();

    const mockJob: any = {
      data: {
        requestId: 'req-token-1',
        socialAccountId: '00000000-0000-0000-0000-000000000001',
        force: false,
      },
    };

    await processor.handle(mockJob);

    const calls = getCalls();
    assert.strictEqual(calls.getValidTokenCalled, true);
    assert.strictEqual(calls.refreshCalled, false);

    assert.strictEqual(progressUpdates.length, 2);
    assert.strictEqual(progressUpdates[0].status, 'RUNNING');
    assert.strictEqual(progressUpdates[1].status, 'COMPLETE');
    assert.strictEqual(progressUpdates[1].progress, 100);
  });

  it('force flow: calls refresh directly when force is true', async () => {
    const { processor, progressUpdates, getCalls } = createProcessor();

    const mockJob: any = {
      data: {
        requestId: 'req-token-2',
        socialAccountId: '00000000-0000-0000-0000-000000000001',
        force: true,
      },
    };

    await processor.handle(mockJob);

    const calls = getCalls();
    assert.strictEqual(calls.getValidTokenCalled, false);
    assert.strictEqual(calls.refreshCalled, true);

    assert.strictEqual(progressUpdates[1].status, 'COMPLETE');
  });

  it('failure flow: catches error, logs FAILED status, and propagates exception to BullMQ for retry', async () => {
    const { processor, progressUpdates } = createProcessor({ getValidTokenThrows: true });

    const mockJob: any = {
      data: {
        requestId: 'req-token-fail',
        socialAccountId: '00000000-0000-0000-0000-000000000001',
        force: false,
      },
    };

    await assert.rejects(
      async () => {
        await processor.handle(mockJob);
      },
      (err: any) => {
        assert.match(err.message, /OAuth token revoked/);
        return true;
      },
    );

    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    assert.strictEqual(lastUpdate.status, 'FAILED');
    assert.strictEqual(lastUpdate.progress, 0);
  });
});

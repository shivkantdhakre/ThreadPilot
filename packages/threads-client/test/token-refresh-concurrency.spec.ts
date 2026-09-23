import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ThreadsTokenService, TokenEncryptionService } from '../dist/index.js';

describe('ThreadsTokenService Concurrency & Token Refresh Invariant Tests', () => {
  const encKey = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE='; // 32-byte base64 key
  const encryption = new TokenEncryptionService(encKey, 1);
  const socialAccountId = 'acc-test-concurrency-1';

  function createMockRedis() {
    const store = new Map<string, { value: string; expiresAt: number }>();
    return {
      set: async (key: string, value: string, options: { nx?: boolean; ex?: number }) => {
        const item = store.get(key);
        const isExpired = item ? Date.now() > item.expiresAt : true;
        if (options.nx && item && !isExpired) {
          return null; // Key already exists
        }
        const ttl = options.ex ?? 30;
        store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
        return 'OK';
      },
      del: async (key: string) => {
        const existed = store.delete(key);
        return existed ? 1 : 0;
      },
      get: async (key: string) => {
        const item = store.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
          store.delete(key);
          return null;
        }
        return item.value;
      },
    };
  }

  it('10 concurrent callers: exactly 1 Meta refresh call, all callers receive identical refreshed token', async () => {
    const oldTokenPlain = 'old-threads-access-token-123';
    const newTokenPlain = 'refreshed-threads-access-token-456';

    let currentDbToken = {
      socialAccountId,
      accessTokenEncrypted: encryption.encrypt(oldTokenPlain),
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days left (< 7 days threshold)
      revokedAt: null,
      lastRefreshedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    };

    const mockDb: any = {
      oAuthToken: {
        findUnique: async () => ({ ...currentDbToken }),
        findUniqueOrThrow: async () => ({ ...currentDbToken }),
        update: async ({ data }: any) => {
          currentDbToken = {
            ...currentDbToken,
            ...data,
          };
          return currentDbToken;
        },
      },
    };

    const mockRedis = createMockRedis();

    let metaRefreshCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/refresh_access_token')) {
        metaRefreshCallCount++;
        // Simulate a slight network delay (20ms) so concurrent callers pile up
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(
          JSON.stringify({
            access_token: newTokenPlain,
            token_type: 'bearer',
            expires_in: 60 * 24 * 60 * 60,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return originalFetch(input);
    }) as any;

    try {
      const tokenService = new ThreadsTokenService(
        mockDb,
        encryption,
        mockRedis,
        'https://graph.threads.net/v1.0',
      );

      // Launch 10 concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        tokenService.getValidToken(socialAccountId),
      );

      const results = await Promise.all(promises);

      // 1. Invariant: Exactly one Meta refresh request
      assert.strictEqual(metaRefreshCallCount, 1, 'Expected exactly 1 Meta refresh call');

      // 2. Invariant: All 10 callers receive the identical fresh token
      assert.strictEqual(results.length, 10);
      for (const token of results) {
        assert.strictEqual(token, newTokenPlain, 'Caller received stale or mismatched token');
      }

      // 3. Invariant: Lock is released
      const lock = await mockRedis.get(`token-refresh:${socialAccountId}`);
      assert.strictEqual(lock, null, 'Refresh lock was not released');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('2 concurrent callers: exactly 1 Meta refresh call, both callers receive identical refreshed token', async () => {
    const oldTokenPlain = 'old-threads-access-token-2-callers';
    const newTokenPlain = 'refreshed-threads-access-token-2-callers';

    let currentDbToken = {
      socialAccountId,
      accessTokenEncrypted: encryption.encrypt(oldTokenPlain),
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      lastRefreshedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    };

    const mockDb: any = {
      oAuthToken: {
        findUnique: async () => ({ ...currentDbToken }),
        findUniqueOrThrow: async () => ({ ...currentDbToken }),
        update: async ({ data }: any) => {
          currentDbToken = { ...currentDbToken, ...data };
          return currentDbToken;
        },
      },
    };

    const mockRedis = createMockRedis();
    let metaRefreshCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/refresh_access_token')) {
        metaRefreshCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(
          JSON.stringify({
            access_token: newTokenPlain,
            token_type: 'bearer',
            expires_in: 60 * 24 * 60 * 60,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return originalFetch(input);
    }) as any;

    try {
      const tokenService = new ThreadsTokenService(
        mockDb,
        encryption,
        mockRedis,
        'https://graph.threads.net/v1.0',
      );

      const results = await Promise.all([
        tokenService.getValidToken(socialAccountId),
        tokenService.getValidToken(socialAccountId),
      ]);

      assert.strictEqual(metaRefreshCallCount, 1, 'Expected exactly 1 Meta refresh call for 2 callers');
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0], newTokenPlain);
      assert.strictEqual(results[1], newTokenPlain);
      const lock = await mockRedis.get(`token-refresh:${socialAccountId}`);
      assert.strictEqual(lock, null, 'Lock was not released');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('high-contention callers (50 concurrent): exactly 1 Meta refresh call, all 50 callers receive identical fresh token', async () => {
    const oldTokenPlain = 'old-threads-access-token-50-callers';
    const newTokenPlain = 'refreshed-threads-access-token-50-callers';

    let currentDbToken = {
      socialAccountId,
      accessTokenEncrypted: encryption.encrypt(oldTokenPlain),
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      lastRefreshedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    };

    const mockDb: any = {
      oAuthToken: {
        findUnique: async () => ({ ...currentDbToken }),
        findUniqueOrThrow: async () => ({ ...currentDbToken }),
        update: async ({ data }: any) => {
          currentDbToken = { ...currentDbToken, ...data };
          return currentDbToken;
        },
      },
    };

    const mockRedis = createMockRedis();
    let metaRefreshCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/refresh_access_token')) {
        metaRefreshCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return new Response(
          JSON.stringify({
            access_token: newTokenPlain,
            token_type: 'bearer',
            expires_in: 60 * 24 * 60 * 60,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return originalFetch(input);
    }) as any;

    try {
      const tokenService = new ThreadsTokenService(
        mockDb,
        encryption,
        mockRedis,
        'https://graph.threads.net/v1.0',
      );

      const promises = Array.from({ length: 50 }, () =>
        tokenService.getValidToken(socialAccountId),
      );

      const results = await Promise.all(promises);

      assert.strictEqual(metaRefreshCallCount, 1, 'Expected exactly 1 Meta refresh call for 50 callers');
      assert.strictEqual(results.length, 50);
      for (const token of results) {
        assert.strictEqual(token, newTokenPlain, 'A caller received stale or mismatched token');
      }
      const lock = await mockRedis.get(`token-refresh:${socialAccountId}`);
      assert.strictEqual(lock, null, 'Lock was not released');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('refresh fails: all concurrent callers receive failure, lock is released, and subsequent call can retry', async () => {
    const oldTokenPlain = 'old-failing-token-123';

    const currentDbToken = {
      socialAccountId,
      accessTokenEncrypted: encryption.encrypt(oldTokenPlain),
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // < 7 days
      revokedAt: null,
      lastRefreshedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    };

    const mockDb: any = {
      oAuthToken: {
        findUnique: async () => ({ ...currentDbToken }),
        findUniqueOrThrow: async () => ({ ...currentDbToken }),
        update: async () => {
          throw new Error('Should not update on failed refresh');
        },
      },
    };

    const mockRedis = createMockRedis();

    let metaRefreshCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/refresh_access_token')) {
        metaRefreshCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(
          JSON.stringify({ error: { message: 'OAuthException: Invalid token', type: 'OAuthException', code: 190 } }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return originalFetch(input);
    }) as any;

    try {
      const tokenService = new ThreadsTokenService(
        mockDb,
        encryption,
        mockRedis,
        'https://graph.threads.net/v1.0',
      );

      // Launch 10 concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        tokenService.getValidToken(socialAccountId),
      );

      const results = await Promise.allSettled(promises);

      // 1. Invariant: All callers were rejected
      for (const res of results) {
        assert.strictEqual(res.status, 'rejected');
        assert.ok(
          (res as PromiseRejectedResult).reason.message.includes('Token refresh failed: 400'),
          `Unexpected error message: ${(res as PromiseRejectedResult).reason.message}`,
        );
      }

      // 2. Invariant: Exactly one refresh was attempted
      assert.strictEqual(metaRefreshCallCount, 1);

      // 3. Invariant: Lock is released
      const lock = await mockRedis.get(`token-refresh:${socialAccountId}`);
      assert.strictEqual(lock, null, 'Lock was not released after failure');

      // 4. Invariant: Subsequent call can acquire lock and retry
      let secondAttemptExecuted = false;
      globalThis.fetch = (async () => {
        secondAttemptExecuted = true;
        return new Response(
          JSON.stringify({ access_token: 'recovered-token', expires_in: 5000000 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as any;

      mockDb.oAuthToken.update = async () => ({ ...currentDbToken, expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) });
      mockDb.oAuthToken.findUniqueOrThrow = async () => ({
        ...currentDbToken,
        accessTokenEncrypted: encryption.encrypt('recovered-token'),
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });

      const retryResult = await tokenService.getValidToken(socialAccountId);
      assert.strictEqual(retryResult, 'recovered-token');
      assert.strictEqual(secondAttemptExecuted, true, 'Subsequent call failed to retry');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('normal non-concurrent access with valid token (> 7 days) returns token without refresh', async () => {
    const validTokenPlain = 'valid-unexpired-token-789';
    const mockDb: any = {
      oAuthToken: {
        findUnique: async () => ({
          socialAccountId,
          accessTokenEncrypted: encryption.encrypt(validTokenPlain),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days left
          revokedAt: null,
        }),
      },
    };

    const mockRedis = createMockRedis();
    const tokenService = new ThreadsTokenService(
      mockDb,
      encryption,
      mockRedis,
      'https://graph.threads.net/v1.0',
    );

    const token = await tokenService.getValidToken(socialAccountId);
    assert.strictEqual(token, validTokenPlain);
    const lock = await mockRedis.get(`token-refresh:${socialAccountId}`);
    assert.strictEqual(lock, null);
  });

  it('revoked token throws error immediately without refresh or lock', async () => {
    const mockDb: any = {
      oAuthToken: {
        findUnique: async () => ({
          socialAccountId,
          accessTokenEncrypted: encryption.encrypt('some-token'),
          expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          revokedAt: new Date(),
        }),
      },
    };

    const mockRedis = createMockRedis();
    const tokenService = new ThreadsTokenService(
      mockDb,
      encryption,
      mockRedis,
      'https://graph.threads.net/v1.0',
    );

    await assert.rejects(
      () => tokenService.getValidToken(socialAccountId),
      (err: any) => {
        assert.ok(err.message.includes('has been revoked'));
        return true;
      },
    );
  });
});

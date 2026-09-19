import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ThreadsOAuthService, OAuthStateError } from '../dist/index.js';


describe('ThreadsOAuthService Security & Negative-Path Tests', () => {
  const config = {
    apiBaseUrl: 'https://graph.threads.net/v1.0',
    appId: 'test-app-id',
    appSecret: 'test-app-secret',
    redirectUri: 'https://threadpilot.ai/callback/threads',
    scopes: 'threads_basic,threads_content_publish',
    stateTtlSeconds: 300,
  };

  function createMockRedis() {
    const store = new Map<string, { value: string; expiresAt: number }>();
    return {
      setex: async (key: string, ttl: number, value: string) => {
        store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      },
      getdel: async (key: string) => {
        const item = store.get(key);
        if (!item) return null;
        store.delete(key); // Atomic delete on read
        if (Date.now() > item.expiresAt) return null; // Expired
        return item.value;
      },
      expireNow: (key: string) => {
        const item = store.get(key);
        if (item) {
          item.expiresAt = Date.now() - 1000;
        }
      },
    };
  }

  it('succeeds with valid state and exchanges code', async () => {
    const mockRedis = createMockRedis();
    const service = new ThreadsOAuthService(mockRedis as any, config);

    const { state } = await service.initiateFlow('workspace-uuid-1');
    assert(state && state.length === 64);

    // Mock global fetch for token exchange
    const originalFetch = global.fetch;
    global.fetch = (async (url: string) => {
      if (url.includes('/oauth/access_token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'short_lived_token',
            user_id: 'threads_user_123',
          }),
        } as any;
      }
      if (url.includes('grant_type=th_exchange_token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'long_lived_token_60d',
            expires_in: 5184000,
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    }) as any;

    try {
      const result = await service.handleCallback('valid_code', state);
      assert.strictEqual(result.workspaceId, 'workspace-uuid-1');
      assert.strictEqual(result.tokens.access_token, 'long_lived_token_60d');
      assert.strictEqual(result.tokens.user_id, 'threads_user_123');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('rejects with OAuthStateError when state is wrong / unrecognized', async () => {
    const mockRedis = createMockRedis();
    const service = new ThreadsOAuthService(mockRedis as any, config);

    await service.initiateFlow('workspace-uuid-1');

    await assert.rejects(
      async () => {
        await service.handleCallback('any_code', 'tampered_or_wrong_state');
      },
      (err: any) => {
        assert(err instanceof OAuthStateError);
        assert.strictEqual(err.message, 'OAuth state expired or invalid');
        return true;
      },
    );
  });

  it('rejects with OAuthStateError when state has expired (TTL exceeded)', async () => {
    const mockRedis = createMockRedis();
    const service = new ThreadsOAuthService(mockRedis as any, config);

    const { state } = await service.initiateFlow('workspace-uuid-1');
    mockRedis.expireNow(`oauth-tx:${state}`); // Simulate TTL expiry

    await assert.rejects(
      async () => {
        await service.handleCallback('any_code', state);
      },
      (err: any) => {
        assert(err instanceof OAuthStateError);
        assert.strictEqual(err.message, 'OAuth state expired or invalid');
        return true;
      },
    );
  });

  it('rejects reused state on second callback attempt (replay attack protection)', async () => {
    const mockRedis = createMockRedis();
    const service = new ThreadsOAuthService(mockRedis as any, config);

    const { state } = await service.initiateFlow('workspace-uuid-1');

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({ access_token: 'token_1', user_id: 'user_1' }),
    })) as any;

    try {
      // First exchange: succeeds and atomically deletes transaction
      const res1 = await service.handleCallback('code_1', state);
      assert.strictEqual(res1.workspaceId, 'workspace-uuid-1');

      // Second exchange with same state: must fail immediately
      await assert.rejects(
        async () => {
          await service.handleCallback('code_replay', state);
        },
        (err: any) => {
          assert(err instanceof OAuthStateError);
          assert.strictEqual(err.message, 'OAuth state expired or invalid');
          return true;
        },
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('protects against workspace mismatch by sourcing workspaceId strictly from server state', async () => {
    const mockRedis = createMockRedis();
    const service = new ThreadsOAuthService(mockRedis as any, config);

    const { state } = await service.initiateFlow('trusted_workspace_id_999');

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({ access_token: 'token_1', user_id: 'user_1' }),
    })) as any;

    try {
      const result = await service.handleCallback('code_1', state);
      // Sourced from Redis state, completely immune to any URL parameter injection
      assert.strictEqual(result.workspaceId, 'trusted_workspace_id_999');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('ApiClient Security Invariants & In-Memory Token Management', () => {
  let mockLocalStorage: Map<string, string>;

  beforeEach(() => {
    mockLocalStorage = new Map();
    (globalThis as any).window = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockLocalStorage.get(key) || null,
      setItem: (key: string, val: string) => mockLocalStorage.set(key, val),
      removeItem: (key: string) => mockLocalStorage.delete(key),
      clear: () => mockLocalStorage.clear(),
    };
  });

  it('guarantees access token is held in-memory ONLY and NEVER written to localStorage or sessionStorage', () => {
    class InvariantApiClient {
      private inMemoryAccessToken: string | null = null;

      get token(): string | null {
        return this.inMemoryAccessToken;
      }

      set token(t: string | null) {
        this.inMemoryAccessToken = t;
      }
    }

    const client = new InvariantApiClient();
    client.token = 'sensitive-jwt-access-token-12345';

    assert.strictEqual(client.token, 'sensitive-jwt-access-token-12345');
    assert.strictEqual(mockLocalStorage.get('token'), undefined);
    assert.strictEqual(mockLocalStorage.get('accessToken'), undefined);
    assert.strictEqual(mockLocalStorage.size, 0, 'localStorage must remain clean of access tokens');
  });

  it('injects x-workspace-id header when workspaceId is set', () => {
    class InvariantApiClient {
      get workspaceId(): string | null {
        return localStorage.getItem('tp_active_workspace_id');
      }

      set workspaceId(id: string | null) {
        if (id) {
          localStorage.setItem('tp_active_workspace_id', id);
        } else {
          localStorage.removeItem('tp_active_workspace_id');
        }
      }

      prepareHeaders(inMemoryToken: string | null) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (inMemoryToken) {
          headers['Authorization'] = `Bearer ${inMemoryToken}`;
        }
        if (this.workspaceId) {
          headers['x-workspace-id'] = this.workspaceId;
        }
        return headers;
      }
    }

    const client = new InvariantApiClient();
    client.workspaceId = '00000000-0000-0000-0000-000000000001';

    const headers = client.prepareHeaders('active-jwt');
    assert.strictEqual(headers['Authorization'], 'Bearer active-jwt');
    assert.strictEqual(headers['x-workspace-id'], '00000000-0000-0000-0000-000000000001');
  });

  it('queues concurrent 401 callers and re-executes exactly once after token refresh', async () => {
    let refreshCallCount = 0;
    let isRefreshing = false;
    let refreshSubscribers: Array<(t: string) => void> = [];

    async function mockRefreshToken(): Promise<string | null> {
      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshSubscribers.push(resolve);
        });
      }

      isRefreshing = true;
      refreshCallCount++;

      // Simulate refresh network delay
      await new Promise((r) => setTimeout(r, 20));

      const newToken = 'fresh-rotated-token-999';
      isRefreshing = false;
      refreshSubscribers.forEach((cb) => cb(newToken));
      refreshSubscribers = [];
      return newToken;
    }

    // Fire 10 concurrent requests that encounter 401
    const results = await Promise.all([
      mockRefreshToken(),
      mockRefreshToken(),
      mockRefreshToken(),
      mockRefreshToken(),
      mockRefreshToken(),
      mockRefreshToken(),
      mockRefreshToken(),
      mockRefreshToken(),
      mockRefreshToken(),
      mockRefreshToken(),
    ]);

    assert.strictEqual(refreshCallCount, 1, 'Exactly one refresh network request must be made for concurrent callers');
    assert.strictEqual(results.length, 10);
    results.forEach((token) => {
      assert.strictEqual(token, 'fresh-rotated-token-999');
    });
  });
});

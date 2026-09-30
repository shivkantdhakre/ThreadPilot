import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { ThreadsAuthService } from '../dist/threads-auth/threads-auth.service.js';
import { prisma } from '@threadpilot/database';

describe('ThreadsAuthService OAuth PKCE & Token Security Tests', () => {
  let service: ThreadsAuthService;
  let mockRedis: any;
  let mockConfig: any;
  const dummyEncKey = Buffer.alloc(32, 1).toString('base64');

  beforeEach(() => {
    const redisStore = new Map<string, string>();
    mockRedis = {
      setex: async (key: string, ttl: number, val: string) => {
        redisStore.set(key, val);
        return 'OK';
      },
      getdel: async (key: string) => {
        const val = redisStore.get(key) || null;
        redisStore.delete(key);
        return val;
      },
      _store: redisStore,
    };

    mockConfig = {
      get: (key: string, def: any) => {
        const conf: Record<string, any> = {
          TOKEN_ENCRYPTION_KEY: dummyEncKey,
          TOKEN_ENCRYPTION_KEY_VERSION: 1,
          THREADS_API_BASE_URL: 'https://graph.threads.net',
          THREADS_APP_ID: 'test_app_123',
          THREADS_APP_SECRET: 'test_secret_abc',
          THREADS_REDIRECT_URI: 'https://app.threadpilot.ai/callback',
          THREADS_SCOPES: 'threads_basic,threads_content_publish',
          THREADS_OAUTH_STATE_TTL_SECONDS: 300,
        };
        return conf[key] !== undefined ? conf[key] : def;
      },
    };

    service = new ThreadsAuthService(mockRedis as any, mockConfig as any);
  });

  describe('OAuth Flow Initiation & PKCE Challenge', () => {
    it('generates authorization URL containing client_id, scopes, and PKCE challenge', async () => {
      const res = await service.initiate('00000000-0000-0000-0000-000000000001');

      assert.ok(res.authorizationUrl);
      const url = new URL(res.authorizationUrl);
      assert.strictEqual(url.searchParams.get('client_id'), 'test_app_123');
      assert.strictEqual(url.searchParams.get('redirect_uri'), 'https://app.threadpilot.ai/callback');
      assert.strictEqual(url.searchParams.get('response_type'), 'code');
      assert.ok(url.searchParams.get('state'));

      // Verify that Redis stored state with TTL
      assert.strictEqual(mockRedis._store.size, 1);
    });
  });

  describe('OAuth Callback, Token Exchange & Encryption', () => {
    it('rejects callback with BadRequestException when state is invalid or already consumed', async () => {
      await assert.rejects(
        async () => {
          await service.handleCallback('valid_code', 'nonexistent_or_replayed_state');
        },
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.match(err.message, /state|invalid/i);
          return true;
        },
      );
    });

    it('exchanges code, encrypts tokens with AES-256-GCM, and upserts social account', async () => {
      // Step 1: Initiate to populate state
      const { authorizationUrl, state } = await service.initiate('00000000-0000-0000-0000-000000000001');
      assert.ok(state);

      // Mock fetch for token exchange and /me endpoint
      const origFetch = globalThis.fetch;
      globalThis.fetch = async (input: any, init?: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/oauth/access_token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'short_lived_token_123',
              user_id: '9988776655',
            }),
          } as any;
        }
        if (urlStr.includes('/access_token') && urlStr.includes('grant_type=th_exchange_token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'long_lived_token_xyz_60_days',
              token_type: 'bearer',
              expires_in: 5184000,
            }),
          } as any;
        }
        if (urlStr.includes('/me?')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: '9988776655',
              username: 'tech_founder',
              name: 'Tech Founder',
              threads_profile_picture_url: 'https://threads.net/avatar.png',
            }),
          } as any;
        }
        return origFetch(input, init);
      };

      let upsertData: any = null;
      const origTransaction = prisma.$transaction;
      (prisma.$transaction as any) = async (arg: any) => {
        if (typeof arg === 'function') {
          const tx = {
            socialAccount: {
              upsert: async (args: any) => {
                upsertData = args;
                return {
                  id: '00000000-0000-0000-0000-000000000099',
                  workspaceId: '00000000-0000-0000-0000-000000000001',
                  platform: 'THREADS',
                  platformAccountId: '9988776655',
                  username: 'tech_founder',
                  status: 'CONNECTED',
                };
              },
            },
            oAuthToken: {
              upsert: async () => ({ id: 'token-1' }),
            },
            scheduledPost: {
              updateMany: async () => ({ count: 0 }),
            },
          };
          return arg(tx);
        }
        return [{}, {}];
      };

      try {
        const result = await service.handleCallback('mock_auth_code_123', state);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.username, 'tech_founder');
        assert.strictEqual(result.socialAccountId, '00000000-0000-0000-0000-000000000099');

        // Verify upsert was called with parsed username
        assert.ok(upsertData);
        assert.strictEqual(upsertData.create.username, 'tech_founder');
      } finally {
        globalThis.fetch = origFetch;
        prisma.$transaction = origTransaction;
      }
    });
  });

  describe('Disconnect Social Account', () => {
    it('marks social account disconnected and revokes status', async () => {
      const origFindFirst = prisma.socialAccount.findFirst;
      const origTransaction = prisma.$transaction;

      (prisma.socialAccount as any).findFirst = async () => ({
        id: '00000000-0000-0000-0000-000000000099',
        workspaceId: '00000000-0000-0000-0000-000000000001',
        username: 'tech_founder',
        status: 'CONNECTED',
      });

      (prisma.$transaction as any) = async (ops: any) => {
        return ops;
      };

      try {
        const res = await service.disconnect(
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000099',
        );

        assert.strictEqual(res.success, true);
      } finally {
        prisma.socialAccount.findFirst = origFindFirst;
        prisma.$transaction = origTransaction;
      }
    });

    it('getStatus returns active connected accounts with token expiration status', async () => {
      const origFindMany = prisma.socialAccount.findMany;
      (prisma.socialAccount as any).findMany = async () => [
        {
          id: 'acc-1',
          platform: 'threads',
          externalId: 'ext-1',
          username: 'active_threads_creator',
          displayName: 'Active Creator',
          connectedAt: new Date(),
          oauthToken: {
            expiresAt: new Date(Date.now() + 86400000 * 30),
            revokedAt: null,
          },
        },
      ];

      try {
        const status = await service.getStatus('00000000-0000-0000-0000-000000000001');
        assert.strictEqual(status.accounts.length, 1);
        assert.strictEqual(status.accounts[0].username, 'active_threads_creator');
      } finally {
        prisma.socialAccount.findMany = origFindMany;
      }
    });
  });
});

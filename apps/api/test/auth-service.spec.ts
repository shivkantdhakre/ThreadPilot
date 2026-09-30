import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../dist/auth/auth.service.js';
import { PasswordService } from '../dist/auth/password.service.js';
import { TokenService } from '../dist/auth/token.service.js';
import { RefreshTokenService } from '../dist/auth/refresh-token.service.js';
import { prisma } from '@threadpilot/database';

describe('AuthService & Token Security Invariant Tests', () => {
  let authService: AuthService;
  let passwordService: PasswordService;
  let tokenService: TokenService;
  let refreshTokenService: RefreshTokenService;

  beforeEach(() => {
    const mockConfig = {
      get: (_key: string, def: any) => def,
    } as any;
    passwordService = new PasswordService(mockConfig);
    tokenService = new TokenService(
      { sign: () => 'mock-access-token-jwt' } as any,
      mockConfig,
    );

    refreshTokenService = new RefreshTokenService(passwordService, tokenService, mockConfig);
    authService = new AuthService(passwordService, tokenService, refreshTokenService);
  });

  describe('Registration & Tenant Provisioning', () => {
    it('successfully registers user with hashed password and creates initial workspace', async () => {
      const origFindUnique = prisma.user.findUnique;
      const origTransaction = prisma.$transaction;
      const origCreate = prisma.refreshToken.create;

      const createdUser = {
        id: 'usr-test-100',
        email: 'founder@acme.inc',
        passwordHash: 'argon2id$mock-hash',
      };
      const createdWorkspace = {
        id: 'ws-test-100',
        name: 'Acme Workspace',
        slug: 'acme-workspace',
      };

      (prisma.user as any).findUnique = async () => null;
      (prisma.$transaction as any) = async (cb: any) => {
        const tx = {
          user: {
            create: async () => createdUser,
          },
          workspace: {
            create: async () => createdWorkspace,
          },
          userProfile: {
            create: async () => ({ id: 'up-100' }),
          },
          userPreferences: {
            create: async () => ({ id: 'pref-100' }),
          },
        };
        return cb(tx);
      };
      (prisma.refreshToken as any).create = async () => ({ id: 'rt-100' });

      try {
        const result = await authService.register({
          email: 'founder@acme.inc',
          password: 'SecurePassword123!',
          workspaceName: 'Acme Workspace',
        });

        assert.strictEqual(result.accessToken, 'mock-access-token-jwt');
        assert.ok(typeof result.refreshToken === 'string' && result.refreshToken.includes('.'));
        assert.strictEqual(result.user.email, 'founder@acme.inc');
        assert.strictEqual(result.user.workspaceId, 'ws-test-100');
        assert.strictEqual(result.workspace?.name, 'Acme Workspace');
      } finally {
        prisma.user.findUnique = origFindUnique;
        prisma.$transaction = origTransaction;
        prisma.refreshToken.create = origCreate;
      }
    });

    it('rejects registration with ConflictException (409) when email already exists', async () => {
      const origFindUnique = prisma.user.findUnique;
      (prisma.user as any).findUnique = async () => ({ id: 'existing-user-id' });

      try {
        await assert.rejects(
          async () => {
            await authService.register({
              email: 'existing@acme.inc',
              password: 'Password123!',
              workspaceName: 'Acme Workspace',
            });
          },
          (err: any) => {
            assert.ok(err instanceof ConflictException);
            assert.match(err.message, /already exists/i);
            return true;
          },
        );
      } finally {
        prisma.user.findUnique = origFindUnique;
      }
    });
  });

  describe('Login & Credential Verification', () => {
    it('authenticates valid credentials and returns access token + refresh token + workspaces', async () => {
      const origFindUnique = prisma.user.findUnique;
      const origCreate = prisma.refreshToken.create;

      const passwordHash = await passwordService.hash('CorrectPassword123!');
      (prisma.user as any).findUnique = async () => ({
        id: 'usr-test-200',
        email: 'engineer@acme.inc',
        passwordHash,
        workspaces: [
          { id: 'ws-200', name: 'Primary Workspace', slug: 'primary-workspace', role: 'OWNER' },
        ],
      });

      (prisma.refreshToken as any).create = async () => ({ id: 'rt-200' });

      try {
        const result = await authService.login({
          email: 'engineer@acme.inc',
          password: 'CorrectPassword123!',
        });

        assert.strictEqual(result.accessToken, 'mock-access-token-jwt');
        assert.ok(result.refreshToken.includes('.'));
        assert.strictEqual(result.user.id, 'usr-test-200');
        assert.strictEqual(result.workspaces?.length, 1);
        assert.strictEqual(result.workspaces?.[0]?.name, 'Primary Workspace');
      } finally {
        prisma.user.findUnique = origFindUnique;
        prisma.refreshToken.create = origCreate;
      }
    });

    it('rejects login with UnauthorizedException (401) on wrong password', async () => {
      const origFindUnique = prisma.user.findUnique;
      const passwordHash = await passwordService.hash('CorrectPassword123!');

      (prisma.user as any).findUnique = async () => ({
        id: 'usr-test-200',
        email: 'engineer@acme.inc',
        passwordHash,
        workspaces: [],
      });

      try {
        await assert.rejects(
          async () => {
            await authService.login({
              email: 'engineer@acme.inc',
              password: 'WrongPassword999!',
            });
          },
          (err: any) => {
            assert.ok(err instanceof UnauthorizedException);
            return true;
          },
        );
      } finally {
        prisma.user.findUnique = origFindUnique;
      }
    });

    it('rejects login with UnauthorizedException (401) when user does not exist', async () => {
      const origFindUnique = prisma.user.findUnique;
      (prisma.user as any).findUnique = async () => null;

      try {
        await assert.rejects(
          async () => {
            await authService.login({
              email: 'nonexistent@acme.inc',
              password: 'Password123!',
            });
          },
          (err: any) => {
            assert.ok(err instanceof UnauthorizedException);
            return true;
          },
        );
      } finally {
        prisma.user.findUnique = origFindUnique;
      }
    });
  });

  describe('Refresh Token Rotation & Family Reuse Detection', () => {
    it('detects refresh token reuse and immediately revokes all family tokens', async () => {
      const origFindUnique = prisma.refreshToken.findUnique;
      const origUpdateMany = prisma.refreshToken.updateMany;

      let familyRevoked = false;
      const tokenHash = await passwordService.hash('compromised-secret');

      // Return a token that was ALREADY used (reuse attack scenario)
      (prisma.refreshToken as any).findUnique = async () => ({
        id: 'rt-compromised-1',
        userId: 'usr-victim-1',
        familyId: 'family-compromised-uuid',
        tokenHash,
        usedAt: new Date(Date.now() - 60000), // already used!
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
      });

      (prisma.refreshToken as any).updateMany = async ({ where, data }: any) => {
        if (where.familyId === 'family-compromised-uuid' && data.revokedAt) {
          familyRevoked = true;
        }
        return { count: 3 };
      };

      try {
        await assert.rejects(
          async () => {
            await refreshTokenService.rotateToken('rt-compromised-1.compromised-secret');
          },
          (err: any) => {
            assert.ok(err instanceof UnauthorizedException);
            assert.match(err.message, /compromised|revoked|reuse/i);
            return true;
          },
        );

        assert.strictEqual(familyRevoked, true, 'Entire token family must be revoked upon reuse detection');
      } finally {
        prisma.refreshToken.findUnique = origFindUnique;
        prisma.refreshToken.updateMany = origUpdateMany;
      }
    });

    it('rotates valid refresh token: marks old token as used and issues fresh replacement', async () => {
      const origFindUnique = prisma.refreshToken.findUnique;
      const origTransaction = prisma.$transaction;

      const tokenHash = await passwordService.hash('active-secret');

      (prisma.refreshToken as any).findUnique = async () => ({
        id: '00000000-0000-0000-0000-000000000010',
        userId: '00000000-0000-0000-0000-000000000001',
        familyId: '00000000-0000-0000-0000-000000000002',
        tokenHash,
        usedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
      });

      let oldMarkedUsed = false;
      (prisma.$transaction as any) = async (cb: any) => {
        const tx = {
          refreshToken: {
            create: async () => ({ id: '00000000-0000-0000-0000-000000000020' }),
            update: async ({ where, data }: any) => {
              if (data.usedAt) {
                oldMarkedUsed = true;
              }
              return {};
            },
          },
        };
        return cb(tx);
      };

      try {
        const result = await refreshTokenService.rotateToken('00000000-0000-0000-0000-000000000010.active-secret');
        assert.strictEqual(oldMarkedUsed, true, 'Old token must be marked as used');
        assert.strictEqual(result.userId, '00000000-0000-0000-0000-000000000001');
        assert.ok(result.newCompositeToken.includes('.'));
      } finally {
        prisma.refreshToken.findUnique = origFindUnique;
        prisma.$transaction = origTransaction;
      }
    });

    it('rejects refresh token with invalid format (missing dot separator)', async () => {
      await assert.rejects(
        async () => {
          await refreshTokenService.rotateToken('invalid-unformatted-token');
        },
        (err: any) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.match(err.message, /format/i);
          return true;
        },
      );
    });
  });
});

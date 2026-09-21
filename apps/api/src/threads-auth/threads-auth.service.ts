import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { prisma } from '@threadpilot/database';
import { ThreadsOAuthService, TokenEncryptionService } from '@threadpilot/threads-client';
import { REDIS_CLIENT } from '../common/redis/redis.module';

@Injectable()
export class ThreadsAuthService {
  private readonly oauthService: ThreadsOAuthService;
  private readonly encryptionService: TokenEncryptionService;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    const encKey = this.config.get<string>('TOKEN_ENCRYPTION_KEY', 'CHANGE_ME_32_BYTE_BASE64_KEY');
    const encVersion = Number(this.config.get<number>('TOKEN_ENCRYPTION_KEY_VERSION', 1));
    this.encryptionService = new TokenEncryptionService(encKey, encVersion);

    this.oauthService = new ThreadsOAuthService(
      {
        setex: (key, ttl, val) => this.redis.setex(key, ttl, val),
        getdel: (key) => this.redis.getdel(key),
      },
      {
        apiBaseUrl: this.config.get<string>('THREADS_API_BASE_URL', 'https://graph.threads.net/v1.0'),
        appId: this.config.get<string>('THREADS_APP_ID', ''),
        appSecret: this.config.get<string>('THREADS_APP_SECRET', ''),
        redirectUri: this.config.get<string>('THREADS_REDIRECT_URI', 'http://localhost:3001/api/v1/threads-auth/callback'),
        scopes: this.config.get<string>('THREADS_SCOPES', 'threads_basic,threads_content_publish'),
        stateTtlSeconds: Number(this.config.get<number>('THREADS_OAUTH_STATE_TTL_SECONDS', 300)),
      },
    );
  }

  async initiate(workspaceId: string) {
    return this.oauthService.initiateFlow(workspaceId);
  }

  async handleCallback(code: string, state: string) {
    try {
      const { workspaceId, tokens } = await this.oauthService.handleCallback(code, state);

      const accessTokenEncrypted = this.encryptionService.encrypt(tokens.access_token);
      const refreshTokenEncrypted = tokens.refresh_token
        ? this.encryptionService.encrypt(tokens.refresh_token)
        : null;

      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 60 * 24 * 60 * 60) * 1000);
      const externalId = String(tokens.user_id ?? 'unknown_user_id');
      let username = tokens.username ? String(tokens.username) : 'threads_user';
      let displayName = username;

      const rawScopes = this.config.get<string>(
        'THREADS_SCOPES',
        'threads_basic,threads_content_publish',
      );
      const parsedScopes = rawScopes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      // Query Threads Graph API /me to fetch verified username and display name
      try {
        const apiBaseUrl = this.config.get<string>('THREADS_API_BASE_URL', 'https://graph.threads.net');
        const meRes = await fetch(
          `${apiBaseUrl}/me?fields=id,username,name,threads_profile_picture_url&access_token=${encodeURIComponent(tokens.access_token)}`,
        );
        if (meRes.ok) {
          const meData = (await meRes.json()) as {
            id?: string | number;
            username?: string;
            name?: string;
            threads_profile_picture_url?: string;
          };
          if (meData.username) username = String(meData.username);
          if (meData.name) displayName = String(meData.name);
          else displayName = username;
        }
      } catch {
        // Non-blocking fallback to default username
      }

      const socialAccount = await prisma.$transaction(async (tx) => {
        const account = await tx.socialAccount.upsert({
          where: {
            workspaceId_platform_externalId: {
              workspaceId,
              platform: 'threads',
              externalId,
            },
          },
          create: {
            workspaceId,
            platform: 'threads',
            externalId,
            username,
            displayName,
            isConnected: true,
            connectedAt: new Date(),
          },
          update: {
            isConnected: true,
            connectedAt: new Date(),
            disconnectedAt: null,
            username,
            displayName,
          },
        });

        await tx.oAuthToken.upsert({
          where: { socialAccountId: account.id },
          create: {
            socialAccountId: account.id,
            accessTokenEncrypted,
            refreshTokenEncrypted,
            scopes: parsedScopes,
            expiresAt,
            issuedAt: new Date(),
            lastRefreshedAt: new Date(),
          },
          update: {
            accessTokenEncrypted,
            refreshTokenEncrypted,
            scopes: parsedScopes,
            expiresAt,
            lastRefreshedAt: new Date(),
            revokedAt: null,
          },
        });

        // Unblock any AUTH_REQUIRED schedules for this account now that valid auth is re-established
        await tx.scheduledPost.updateMany({
          where: {
            socialAccountId: account.id,
            status: 'AUTH_REQUIRED',
            publishRequestedAt: null,
            ambiguityDetectedAt: null,
          },
          data: {
            status: 'SCHEDULED',
            lastErrorCode: null,
            lastErrorMsg: null,
            updatedAt: new Date(),
          },
        });

        return account;
      });

      return {
        success: true,
        workspaceId,
        socialAccountId: socialAccount.id,
        username: socialAccount.username,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Threads OAuth exchange failed: ${msg}`);
    }
  }

  async disconnect(workspaceId: string, socialAccountId: string) {
    const account = await prisma.socialAccount.findFirst({
      where: { id: socialAccountId, workspaceId },
    });

    if (!account) {
      throw new BadRequestException('Account not found in workspace');
    }

    await prisma.$transaction([
      prisma.socialAccount.update({
        where: { id: socialAccountId },
        data: {
          isConnected: false,
          disconnectedAt: new Date(),
        },
      }),
      prisma.oAuthToken.updateMany({
        where: { socialAccountId },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  async getStatus(workspaceId: string) {
    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId, isConnected: true },
      select: {
        id: true,
        platform: true,
        externalId: true,
        username: true,
        displayName: true,
        connectedAt: true,
        oauthToken: {
          select: {
            expiresAt: true,
            lastRefreshedAt: true,
            scopes: true,
          },
        },
      },
    });

    return { accounts };
  }
}

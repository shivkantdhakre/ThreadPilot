import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { prisma } from '@threadpilot/database';
import { QUEUES, TokenRefreshJobPayload } from '@threadpilot/types';
import {
  ThreadsTokenService,
  TokenEncryptionService,
} from '@threadpilot/threads-client';
import { REDIS_CLIENT } from '../redis/redis.module';
import { JobProgressService } from '../services/job-progress.service';

@Processor(QUEUES.TOKEN_REFRESH)
export class TokenRefreshProcessor {
  private readonly logger = new Logger(TokenRefreshProcessor.name);
  private readonly tokenService: ThreadsTokenService;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly progressService: JobProgressService,
  ) {
    const encKey = this.config.get<string>('TOKEN_ENCRYPTION_KEY', 'CHANGE_ME_32_BYTE_BASE64_KEY');
    const encVersion = Number(this.config.get<number>('TOKEN_ENCRYPTION_KEY_VERSION', 1));
    const encryption = new TokenEncryptionService(encKey, encVersion);

    const redisAdapter = {
      set: async (key: string, value: string, options: { nx: boolean; ex: number }) => {
        const res = await this.redis.set(key, value, 'EX', options.ex, 'NX');
        return res;
      },
      del: (key: string) => this.redis.del(key),
    };

    const apiBaseUrl = this.config.get<string>('THREADS_API_BASE_URL', 'https://graph.threads.net/v1.0');
    const appId = this.config.get<string>('THREADS_APP_ID', '');
    const appSecret = this.config.get<string>('THREADS_APP_SECRET', '');

    this.tokenService = new ThreadsTokenService(
      prisma,
      encryption,
      redisAdapter,
      apiBaseUrl,
      appId,
      appSecret,
    );
  }

  @Process('TOKEN_REFRESH')
  async handle(job: Job<TokenRefreshJobPayload>): Promise<void> {
    const { requestId, socialAccountId, force } = job.data;
    this.logger.log(`Executing token refresh job ${requestId} for account ${socialAccountId}`);

    await this.progressService.update(requestId, {
      status: 'RUNNING',
      progress: 25,
      progressMessage: 'Checking token expiration and acquiring Redis lock...',
    });

    try {
      if (force) {
        await this.tokenService.refresh(socialAccountId);
      } else {
        await this.tokenService.getValidToken(socialAccountId);
      }

      await this.progressService.update(requestId, {
        status: 'COMPLETE',
        progress: 100,
        progressMessage: 'Token refreshed successfully',
        resultEntityType: 'oauth_token',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error({ err, requestId }, `Token refresh failed: ${msg}`);

      await this.progressService.update(requestId, {
        status: 'FAILED',
        progress: 0,
        progressMessage: 'Token refresh failed',
        error: msg,
      });

      throw err;
    }
  }
}

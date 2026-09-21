import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { prisma } from '@threadpilot/database';
import {
  ThreadsApiClient,
  ThreadsTokenService,
  TokenEncryptionService,
} from '@threadpilot/threads-client';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class PublishingService {
  public readonly tokenService: ThreadsTokenService;
  public readonly threadsApi: ThreadsApiClient;
  public readonly encryptionService: TokenEncryptionService;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    const encKey = this.config.get<string>('TOKEN_ENCRYPTION_KEY', 'CHANGE_ME_32_BYTE_BASE64_KEY');
    const encVersion = Number(this.config.get<number>('TOKEN_ENCRYPTION_KEY_VERSION', 1));
    this.encryptionService = new TokenEncryptionService(encKey, encVersion);

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
      this.encryptionService,
      redisAdapter,
      apiBaseUrl,
      appId,
      appSecret,
    );

    this.threadsApi = new ThreadsApiClient(apiBaseUrl);
  }
}

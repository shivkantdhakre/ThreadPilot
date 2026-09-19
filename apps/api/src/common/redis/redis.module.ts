import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL_LOCAL') ?? config.get<string>('REDIS_URL', 'redis://localhost:6379');
        return new Redis(url, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: true,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

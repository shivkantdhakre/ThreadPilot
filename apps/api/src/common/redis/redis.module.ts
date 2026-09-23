import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createResilientRedisClient } from './redis-helper';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export * from './redis-helper';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return createResilientRedisClient(config);
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

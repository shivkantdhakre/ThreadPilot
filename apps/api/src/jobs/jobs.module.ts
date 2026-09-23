import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUES } from '@threadpilot/types';
import { JobsService } from './jobs.service';
import { JobDispatcherService } from './job-dispatcher.service';
import { JobsController } from './jobs.controller';
import { resolveResilientRedisUrl, parseRedisUrl } from '../common/redis/redis-helper';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisUrl = await resolveResilientRedisUrl(config);
        const parsed = parseRedisUrl(redisUrl);
        return {
          connection: {
            host: parsed.host,
            port: parsed.port,
            password: parsed.password,
            username: parsed.username,
            tls: parsed.tls,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUES.INGESTION },
      { name: QUEUES.STYLE },
      { name: QUEUES.CONTENT },
      { name: QUEUES.TOKEN_REFRESH },
      { name: QUEUES.EMBEDDING },
      { name: QUEUES.PUBLISH },
    ),
  ],
  controllers: [JobsController],
  providers: [JobsService, JobDispatcherService],
  exports: [JobsService, JobDispatcherService, BullModule],
})
export class JobsModule {}

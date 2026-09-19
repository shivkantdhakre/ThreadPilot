import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUES } from '@threadpilot/types';
import { JobsService } from './jobs.service';
import { JobDispatcherService } from './job-dispatcher.service';
import { JobsController } from './jobs.controller';

function parseRedisUrl(urlStr: string) {
  try {
    const u = new URL(urlStr);
    return {
      host: u.hostname || 'localhost',
      port: u.port ? parseInt(u.port, 10) : 6379,
      password: u.password || undefined,
      username: u.username || undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl =
          config.get<string>('REDIS_URL_LOCAL') ??
          config.get<string>('REDIS_URL') ??
          'redis://localhost:6379';
        const parsed = parseRedisUrl(redisUrl);
        return {
          redis: parsed,
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUES.INGESTION },
      { name: QUEUES.STYLE },
      { name: QUEUES.CONTENT },
      { name: QUEUES.TOKEN_REFRESH },
    ),
  ],
  controllers: [JobsController],
  providers: [JobsService, JobDispatcherService],
  exports: [JobsService, JobDispatcherService, BullModule],
})
export class JobsModule {}

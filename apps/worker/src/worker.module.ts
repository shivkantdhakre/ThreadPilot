import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@threadpilot/types';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { JobProgressService } from './services/job-progress.service';
import { AIFactoryService } from './services/ai-factory.service';
import { EmbeddingReconciliationService } from './services/embedding-reconciliation.service';
import { IngestionProcessor } from './processors/ingestion.processor';
import { StyleProcessor } from './processors/style.processor';
import { ContentProcessor } from './processors/content.processor';
import { TokenRefreshProcessor } from './processors/token-refresh.processor';
import { EmbeddingProcessor } from './processors/embedding.processor';

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
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    HealthModule,
    RedisModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl =
          config.get<string>('REDIS_URL_LOCAL') ??
          config.get<string>('REDIS_URL') ??
          'redis://localhost:6379';
        return {
          connection: parseRedisUrl(redisUrl),
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUES.INGESTION },
      { name: QUEUES.STYLE },
      { name: QUEUES.CONTENT },
      { name: QUEUES.TOKEN_REFRESH },
      { name: QUEUES.EMBEDDING },
    ),
  ],
  providers: [
    JobProgressService,
    AIFactoryService,
    EmbeddingReconciliationService,
    IngestionProcessor,
    StyleProcessor,
    ContentProcessor,
    TokenRefreshProcessor,
    EmbeddingProcessor,
  ],
  exports: [EmbeddingReconciliationService],
})
export class WorkerModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { ENGAGEMENT_QUEUES } from '@threadpilot/types';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';
import { RedisModule } from '../common/redis/redis.module';

@Module({
  imports: [
    RedisModule,
    ConfigModule,
    BullModule.registerQueue(
      { name: ENGAGEMENT_QUEUES.ENGAGEMENT_INGEST },
      { name: ENGAGEMENT_QUEUES.REPLY_DRAFT },
      { name: ENGAGEMENT_QUEUES.REPLY_PUBLISH },
    ),
  ],
  controllers: [EngagementController],
  providers: [EngagementService],
  exports: [EngagementService],
})
export class EngagementModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { QUEUES } from '@threadpilot/types';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { JobsModule } from '../jobs/jobs.module';
import { RedisModule } from '../common/redis/redis.module';

@Module({
  imports: [
    JobsModule,
    RedisModule,
    ConfigModule,
    BullModule.registerQueue({ name: QUEUES.PUBLISH }),
  ],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}

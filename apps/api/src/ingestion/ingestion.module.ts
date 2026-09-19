import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [IngestionController],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}

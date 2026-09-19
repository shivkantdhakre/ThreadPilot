import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}

import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}

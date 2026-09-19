import { Module } from '@nestjs/common';
import { ThreadsAuthService } from './threads-auth.service';
import { ThreadsAuthController } from './threads-auth.controller';

@Module({
  controllers: [ThreadsAuthController],
  providers: [ThreadsAuthService],
  exports: [ThreadsAuthService],
})
export class ThreadsAuthModule {}

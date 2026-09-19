import { Module } from '@nestjs/common';
import { SocialAccountsService } from './social-accounts.service';
import { SocialAccountsController } from './social-accounts.controller';

@Module({
  controllers: [SocialAccountsController],
  providers: [SocialAccountsService],
  exports: [SocialAccountsService],
})
export class SocialAccountsModule {}

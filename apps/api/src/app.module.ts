import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { SocialAccountsModule } from './social-accounts/social-accounts.module';
import { ThreadsAuthModule } from './threads-auth/threads-auth.module';
import { JobsModule } from './jobs/jobs.module';
import { ProfileModule } from './profile/profile.module';
import { ContentModule } from './content/content.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    HealthModule,
    RedisModule,
    AuthModule,
    WorkspaceModule,
    SocialAccountsModule,
    ThreadsAuthModule,
    JobsModule,
    ProfileModule,
    ContentModule,
    IngestionModule,
    NotificationsModule,
  ],
})
export class AppModule {}

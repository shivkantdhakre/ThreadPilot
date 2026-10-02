import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { RecommendationsController } from './recommendations.controller';
import { AnalyticsService } from './analytics.service';
import { ContentModule } from '../content/content.module';

@Module({
  imports: [ContentModule],
  controllers: [AnalyticsController, RecommendationsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

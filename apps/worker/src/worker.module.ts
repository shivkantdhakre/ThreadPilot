import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES, ENGAGEMENT_QUEUES } from '@threadpilot/types';
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
import { PublishingProcessor } from './processors/publishing.processor';
import { EventOutboxProcessor } from './processors/event-outbox.processor';
import { EngagementIngestProcessor } from './processors/engagement-ingest.processor';
import { EngagementClassifyProcessor } from './processors/engagement-classify.processor';
import { ReplyDraftProcessor } from './processors/reply-draft.processor';
import { ReplyPublishProcessor } from './processors/reply-publish.processor';
import { PublishingReconciliationService } from './services/publishing-reconciliation.service';
import { EngagementReconciliationService } from './services/engagement-reconciliation.service';
import { EditorialPersonalizationService } from './services/editorial-personalization.service';
import { PublishingService } from './services/publishing.service';
import { ObservationSchedulingService } from './services/observation-scheduler.service';
import { AnalyticsOutboxService } from './services/analytics-outbox.service';
import { AnalyticsOutboxDispatchService } from './services/analytics-outbox-dispatch.service';
import { ExpiredObservationSweeperService } from './services/expired-observation-sweeper.service';
import { AnalyticsSyncProcessor } from './processors/analytics-sync.processor';
import { AnalyticsAggregateProcessor } from './processors/analytics-aggregate.processor.js';
import { AnalyticsInsightsProcessor } from './processors/analytics-insights.processor.js';
import { AnalyticsLearningProcessor } from './processors/analytics-learning.processor.js';
import { prisma, PrismaClient } from '@threadpilot/database';

import { resolveResilientRedisUrl, parseRedisUrl } from './redis/redis-helper';

import { RulesEngineService } from './services/rules-engine.service.js';
import { SafetyGateService } from './services/safety-gate.service.js';
import { ExperimentationService } from './services/experimentation.service.js';
import { ProfileAdaptationService } from './services/profile-adaptation.service.js';
import { AutonomousOperatorService } from './services/autonomous-operator.service.js';
import { RulesProcessor } from './processors/rules.processor.js';
import { SafetyProcessor } from './processors/safety.processor.js';
import { ExperimentProcessor } from './processors/experiment.processor.js';
import { OperatorProcessor } from './processors/operator.processor.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env', '../../.env'],
    }),
    HealthModule,
    RedisModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisUrl = await resolveResilientRedisUrl(config);
        const parsed = parseRedisUrl(redisUrl);
        return {
          connection: {
            ...parsed,
            tls: parsed.tls ? { rejectUnauthorized: false } : undefined,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUES.INGESTION },
      { name: QUEUES.STYLE },
      { name: QUEUES.CONTENT },
      { name: QUEUES.TOKEN_REFRESH },
      { name: QUEUES.EMBEDDING },
      { name: QUEUES.PUBLISH },
      { name: ENGAGEMENT_QUEUES.ENGAGEMENT_INGEST },
      { name: ENGAGEMENT_QUEUES.ENGAGEMENT_CLASSIFY },
      { name: ENGAGEMENT_QUEUES.REPLY_DRAFT },
      { name: ENGAGEMENT_QUEUES.REPLY_PUBLISH },
      { name: QUEUES.ANALYTICS_SYNC },
      { name: QUEUES.ANALYTICS_AGGREGATE },
      { name: QUEUES.ANALYTICS_INSIGHTS },
      { name: QUEUES.ANALYTICS_RECOMMENDATIONS },
      { name: QUEUES.AUTOMATION_RULES },
      { name: QUEUES.SAFETY_EVALUATION },
      { name: QUEUES.EXPERIMENT_ANALYSIS },
      { name: QUEUES.AUTONOMOUS_OPERATOR },
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
    PublishingService,
    PublishingProcessor,
    EventOutboxProcessor,
    EngagementIngestProcessor,
    EngagementClassifyProcessor,
    ReplyDraftProcessor,
    ReplyPublishProcessor,
    PublishingReconciliationService,
    EngagementReconciliationService,
    EditorialPersonalizationService,
    ObservationSchedulingService,
    AnalyticsOutboxService,
    AnalyticsOutboxDispatchService,
    ExpiredObservationSweeperService,
    AnalyticsSyncProcessor,
    AnalyticsAggregateProcessor,
    AnalyticsInsightsProcessor,
    AnalyticsLearningProcessor,
    RulesEngineService,
    SafetyGateService,
    ExperimentationService,
    ProfileAdaptationService,
    AutonomousOperatorService,
    RulesProcessor,
    SafetyProcessor,
    ExperimentProcessor,
    OperatorProcessor,
    {
      provide: PrismaClient,
      useValue: prisma,
    },
  ],
  exports: [
    EmbeddingReconciliationService,
    PublishingReconciliationService,
    EngagementReconciliationService,
    EditorialPersonalizationService,
    ObservationSchedulingService,
    AnalyticsOutboxService,
    AnalyticsOutboxDispatchService,
    ExpiredObservationSweeperService,
    RulesEngineService,
    SafetyGateService,
    ExperimentationService,
    ProfileAdaptationService,
    AutonomousOperatorService,
  ],
})
export class WorkerModule {}

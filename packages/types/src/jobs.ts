// ─── BullMQ job types ─────────────────────────────────────────────────────────

// Queue names as constants — no magic strings anywhere
export const QUEUES = {
  INGESTION:     'ingestion',
  STYLE:         'style',
  CONTENT:       'content',
  TOKEN_REFRESH: 'token-refresh',
  EMBEDDING:     'embedding',
  PUBLISH:       'publish',
  // Engagement Engine Queues
  ENGAGEMENT_INGEST:   'engagement-ingest-queue',
  ENGAGEMENT_CLASSIFY: 'engagement-classify-queue',
  REPLY_DRAFT:         'reply-draft-queue',
  REPLY_PUBLISH:       'reply-publish-queue',
  // Phase 4 Analytics Queues
  ANALYTICS_SYNC:            'analytics-sync-queue',
  ANALYTICS_AGGREGATE:       'analytics-aggregate-queue',
  ANALYTICS_INSIGHTS:        'analytics-insights-queue',
  ANALYTICS_RECOMMENDATIONS: 'analytics-recommendations-queue',
  // Phase 5 Autonomous Operator & Governance Queues
  AUTOMATION_RULES:          'automation-rules-queue',
  SAFETY_EVALUATION:         'safety-evaluation-queue',
  EXPERIMENT_ANALYSIS:       'experiment-analysis-queue',
  AUTONOMOUS_OPERATOR:       'autonomous-operator-queue',
} as const;

export const ENGAGEMENT_QUEUES = {
  ENGAGEMENT_INGEST:   'engagement-ingest-queue',
  ENGAGEMENT_CLASSIFY: 'engagement-classify-queue',
  REPLY_DRAFT:         'reply-draft-queue',
  REPLY_PUBLISH:       'reply-publish-queue',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
export type EngagementQueueName = (typeof ENGAGEMENT_QUEUES)[keyof typeof ENGAGEMENT_QUEUES];

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED';

export type JobType =
  | 'INGESTION'
  | 'STYLE'
  | 'CONTENT'
  | 'IMPROVE'
  | 'TOKEN_REFRESH'
  | 'EMBEDDING'
  | 'PUBLISH'
  | 'ENGAGEMENT_SYNC'
  | 'ENGAGEMENT_CLASSIFY'
  | 'REPLY_DRAFT'
  | 'REPLY_PUBLISH'
  | 'AUTOMATION_RULES'
  | 'SAFETY_EVALUATION'
  | 'EXPERIMENT_ANALYSIS'
  | 'AUTONOMOUS_OPERATOR';

export interface ExecutionContext {
  requestId: string;
  workspaceId: string;
  actorId: string;
  jobId?: string;
  agentRunId?: string;
  workflowId?: string;
  workflowVersion?: string;
}

export type JobLifecycleStage =
  | 'QUEUED'
  | 'LOADING_MEMORY'
  | 'GENERATING'
  | 'EVALUATING'
  | 'PERSISTING'
  | 'COMPLETE'
  | 'FAILED';

// ─── Base — all payloads include requestId for idempotency ────────────────────
export interface BaseJobPayload {
  requestId: string;    // caller-generated UUID used as JobRecord.requestId
  workspaceId: string;
  actorId?: string;
  context?: ExecutionContext;
}


// ─── Job-specific payloads ────────────────────────────────────────────────────

export interface IngestionJobPayload extends BaseJobPayload {
  socialAccountId: string;
  cursor?: string;       // API pagination cursor (set for subsequent pages)
  pageSize?: number;     // posts per API page (default: 25)
  maxPosts?: number;     // total import ceiling (default: 500 for initial; undefined = incremental)
  isInitial: boolean;
}

export interface StyleExtractionJobPayload extends BaseJobPayload {
  socialAccountId: string;
  sampleSize?: number;   // default: 100 most recent ThreadPost rows
}

export interface ContentGenerationJobPayload extends BaseJobPayload {
  ideaId?: string;
  topic?: string;
  format?: string;
  tone?: string;
  additionalContext?: string;
  requestedBy: string;   // userId
}

export interface ContentImprovementJobPayload extends BaseJobPayload {
  draftId: string;
  versionId: string;
  instruction: string;   // 'improve_hook' | 'make_concise' | 'make_personal' | 'remove_fluff'
}

export interface TokenRefreshJobPayload extends BaseJobPayload {
  socialAccountId: string;
  force?: boolean;
}

export interface EmbeddingJobPayload extends BaseJobPayload {
  memoryItemId: string;
  text: string;
  taskType: 'DOCUMENT' | 'SIMILARITY';
  model?: string;
  pipelineVersion?: string;
}

export interface PublishJobPayload extends BaseJobPayload {
  scheduledPostId: string;
}

export interface EngagementSyncJobPayload extends BaseJobPayload {
  socialAccountId: string;
  rootThreadsPostId?: string;
  threadPostId?: string;
  force?: boolean;
}

export interface EngagementClassifyJobPayload extends BaseJobPayload {
  interactionId: string;
  priorityScore?: number;
}

export interface ReplyDraftJobPayload extends BaseJobPayload {
  interactionId: string;
  userPreference?: string;
  regenerate?: boolean;
}

export interface ReplyPublishJobPayload extends BaseJobPayload {
  replyExecutionId: string;
  interactionId: string;
}

// ─── Phase 5 Job Payloads ─────────────────────────────────────────────────────

export interface AutomationRuleJobPayload extends BaseJobPayload {
  socialAccountId: string;
  triggerType: string;
  triggerContext: Record<string, unknown>;
  ruleId?: string;
  executionKey: string;
}

export interface SafetyEvaluationJobPayload extends BaseJobPayload {
  socialAccountId: string;
  draftId: string;
  contentVersionId: string;
  policyVersion?: string;
}

export interface ExperimentAnalysisJobPayload extends BaseJobPayload {
  socialAccountId: string;
  experimentId: string;
  forcedCutoff?: boolean;
}

export interface AutonomousOperatorJobPayload extends BaseJobPayload {
  socialAccountId: string;
  cycleId: string;
  dryRun?: boolean;
}

// ─── Job status response ──────────────────────────────────────────────────────
export interface JobRecordDto {
  requestId: string;
  type: JobType;
  status: JobStatus;
  stage?: JobLifecycleStage;
  progress: number;                // 0–100
  progressMessage: string | null;
  resultEntityType: string | null;
  resultEntityId: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

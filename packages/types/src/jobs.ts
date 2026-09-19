// ─── BullMQ job types ─────────────────────────────────────────────────────────

// Queue names as constants — no magic strings anywhere
export const QUEUES = {
  INGESTION:     'ingestion',
  STYLE:         'style',
  CONTENT:       'content',
  TOKEN_REFRESH: 'token-refresh',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED';

export type JobType = 'INGESTION' | 'STYLE' | 'CONTENT' | 'IMPROVE' | 'TOKEN_REFRESH';

// ─── Base — all payloads include requestId for idempotency ────────────────────
export interface BaseJobPayload {
  requestId: string;    // caller-generated UUID used as JobRecord.requestId
  workspaceId: string;
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

// ─── Job status response ──────────────────────────────────────────────────────
export interface JobRecordDto {
  requestId: string;
  type: JobType;
  status: JobStatus;
  progress: number;                // 0–100
  progressMessage: string | null;
  resultEntityType: string | null;
  resultEntityId: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

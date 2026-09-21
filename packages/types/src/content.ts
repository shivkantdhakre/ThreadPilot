// ─── Content types ────────────────────────────────────────────────────────────

// ContentDraft authoring state — publishing lifecycle is on ScheduledPost
export type ContentDraftStatus = 'DRAFT' | 'READY' | 'ARCHIVED';

// Publishing state machine — lives on ScheduledPost
export type ScheduledPostStatus =
  | 'SCHEDULED'
  | 'CLAIMED'
  | 'CREATING_CONTAINER'
  | 'CONTAINER_CREATED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'QUOTA_BLOCKED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT'
  | 'AUTH_REQUIRED'
  | 'RECOVERY_REQUIRED'
  | 'CANCELLED'
  | 'EXPIRED';

// Backward compatibility alias
export type PublishingStatus = ScheduledPostStatus;

export type ScheduledPostDispatchStatus = 'PENDING' | 'DISPATCHED' | 'FAILED';
export type EventOutboxStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export interface ScheduleDraftDto {
  scheduledAt: string;
  timezone: string;
  socialAccountId: string;
  idempotencyKey?: string;
}

export interface ResolveScheduleDto {
  action: 'CONFIRM_PUBLISHED' | 'CONFIRM_NOT_PUBLISHED';
  resolution?: 'CONFIRM_PUBLISHED' | 'CONFIRM_NOT_PUBLISHED';
  threadsPostId?: string;
  confirmUnpublished?: boolean;
  reason?: string;
}

export interface ScheduledPostDto {
  id: string;
  workspaceId: string;
  draftId: string;
  socialAccountId: string;
  contentVersionId: string;
  scheduledAt: string;
  timezone: string;
  status: ScheduledPostStatus;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  lastErrorCode: string | null;
  lastErrorMsg: string | null;
  publishedAt: string | null;
  publishedObservedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentDraftDto {
  id: string;
  workspaceId: string;
  ideaId: string | null;
  status: ContentDraftStatus;
  generatedBy: string | null;
  promptVersion: string | null;
  profileVersion: number | null;
  editedByUser: boolean;
  currentVersion: ContentVersionDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentVersionDto {
  id: string;
  draftId: string;
  version: number;
  body: string;
  hook: string | null;
  cta: string | null;
  editedBy: string;
  diffSummary: string | null;
  createdAt: string;
}

export interface ContentIdeaDto {
  id: string;
  workspaceId: string;
  title: string;
  concept: string;
  reason: string;
  format: string;
  topic: string;
  confidence: number;
  sources: string[];
  createdAt: string;
}

export interface SocialAccountDto {
  id: string;
  workspaceId: string;
  platform: string;
  externalId: string;
  username: string;
  displayName: string | null;
  profileUrl: string | null;
  isConnected: boolean;
  connectedAt: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

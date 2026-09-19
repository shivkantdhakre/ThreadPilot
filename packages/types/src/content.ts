// ─── Content types ────────────────────────────────────────────────────────────

// ContentDraft authoring state — publishing lifecycle is on ScheduledPost
export type ContentDraftStatus = 'DRAFT' | 'READY' | 'ARCHIVED';

// Publishing state machine — lives on ScheduledPost
export type PublishingStatus =
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'PUBLISHED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT'
  | 'CANCELLED'
  | 'EXPIRED';

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

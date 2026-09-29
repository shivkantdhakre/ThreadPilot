export type InteractionStatus =
  | 'NEW'
  | 'CLASSIFYING'
  | 'CLASSIFIED'
  | 'DRAFTING'
  | 'DRAFTED'
  | 'OUTPUT_SAFETY_EVALUATING'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'PUBLISHING'
  | 'REPLIED'
  | 'DISMISSED'
  | 'NOT_REQUIRED'
  | 'BLOCKED'
  | 'RECOVERY_REQUIRED';

export type InteractionIntent =
  | 'QUESTION'
  | 'AGREEMENT'
  | 'DISAGREEMENT'
  | 'COMPLIMENT'
  | 'REQUEST'
  | 'TROLLING'
  | 'SPAM'
  | 'UNCLEAR';

export type AutonomyMode = 'OFF' | 'SHADOW' | 'REVIEW_ONLY' | 'RULES_BASED';

export type PolicyDecisionType = 'AUTO_REPLY' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'NOT_APPLICABLE';

export type PolicyStage = 'PRE_GENERATION' | 'POST_GENERATION_SAFETY';

export type ReplyExecutionStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'CLAIMED'
  | 'QUOTA_BLOCKED'
  | 'CREATING_CONTAINER'
  | 'CONTAINER_CREATED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'RETRYABLE_FAILURE'
  | 'AUTH_REQUIRED'
  | 'RECOVERY_REQUIRED'
  | 'FAILED_PERMANENT'
  | 'CANCELLED_BY_POLICY';

export type RecoveryResolution =
  | 'NONE'
  | 'PENDING'
  | 'MATCHED'
  | 'NOT_LANDED'
  | 'OPERATOR_REQUIRED'
  | 'CONFIRMED_NOT_PUBLISHED'
  | 'CONFIRMED_PUBLISHED';

export interface ClassificationData {
  id: string;
  intent: InteractionIntent;
  intentConfidence: number;
  priorityScore: number;
  reasoning: string;
  toxicityScore: number;
  harassmentScore: number;
  controversyScore: number;
  isCurrent: boolean;
}

export interface PolicyDecisionData {
  id: string;
  stage: PolicyStage;
  decision: PolicyDecisionType;
  reasonCodes: string[];
  reasoning: string;
  isCurrent: boolean;
  wouldAutoReplyInLive: boolean;
  policyVersion?: string;
}

export interface ReplyDraftVersionData {
  id: string;
  versionNumber: number;
  body: string;
  rationale?: string | null;
  model: string;
  createdAt: string;
  policyVersion?: string | null;
  promptVersion?: string | null;
}

export interface ReplyDraftData {
  id: string;
  currentVersionId?: string | null;
  approvedVersionId?: string | null;
  versions?: ReplyDraftVersionData[];
  currentVersion?: ReplyDraftVersionData | null;
  approvedVersion?: ReplyDraftVersionData | null;
}

export interface ReplyExecutionData {
  id: string;
  status: ReplyExecutionStatus;
  attemptCount: number;
  publishAttemptCount: number;
  containerId?: string | null;
  publishedThreadPostId?: string | null;
  publishedAt?: string | null;
  hasExternalAmbiguity: boolean;
  ambiguityType?: string | null;
  recoveryResolution: RecoveryResolution;
  lastErrorCode?: string | null;
  lastError?: string | null;
  createdAt: string;
}

export interface InteractionItem {
  id: string;
  workspaceId: string;
  socialAccountId: string;
  externalInteractionId: string;
  rootThreadsPostId: string;
  parentCommentId?: string | null;
  authorUsernameSnapshot: string;
  authorDisplayNameSnapshot?: string | null;
  authorProfilePicSnapshot?: string | null;
  content: string;
  status: InteractionStatus;
  priorityScore: number;
  isReplyOwnedByMe: boolean;
  createdAt: string;
  updatedAt: string;
  threadPost?: {
    id: string;
    threadsPostId: string;
    text: string;
    postedAt: string;
  } | null;
  parentInteraction?: {
    id: string;
    externalInteractionId: string;
    authorUsernameSnapshot: string;
    content: string;
  } | null;
  classifications?: ClassificationData[];
  policyDecisions?: PolicyDecisionData[];
  replyDraft?: ReplyDraftData | null;
  executions?: ReplyExecutionData[];
}

export interface EngagementStats {
  pendingReview: number;
  autoReplied: number;
  replied: number;
  dismissed: number;
  drafting: number;
}

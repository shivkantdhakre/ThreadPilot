'use client';

import React from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  XCircle,
  ShieldAlert,
  Ban,
  ExternalLink,
  AtSign,
  Loader2,
  Calendar as CalendarIcon,
} from 'lucide-react';

export interface ScheduledPostItem {
  id: string;
  workspaceId: string;
  draftId: string;
  socialAccountId: string;
  contentVersionId: string;
  scheduledAt: string;
  timezone: string;
  status: string;
  attemptCount: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMsg?: string | null;
  containerId?: string | null;
  publishedAt?: string | null;
  publishedObservedAt?: string | null;
  socialAccount?: {
    id: string;
    username: string;
    displayName?: string | null;
    profileUrl?: string | null;
  };
  draft?: {
    id: string;
    status: string;
    versions?: any[];
  };
  contentSnapshot?: {
    body?: string;
    hook?: string;
    cta?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface ScheduleCardProps {
  post: ScheduledPostItem;
  onResolveClick: (post: ScheduledPostItem) => void;
  onCancelClick: (post: ScheduledPostItem) => void;
}

import { formatRelativeTime } from '../../lib/schedule-utils';
export { formatRelativeTime };

export function renderStatusBadge(status: string) {
  switch (status) {
    case 'SCHEDULED':
      return (
        <span className="badge-cyan text-xs">
          <Clock className="h-3 w-3" />
          Scheduled
        </span>
      );
    case 'CLAIMED':
    case 'CREATING_CONTAINER':
    case 'CONTAINER_CREATED':
    case 'PUBLISHING':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-coral-200 bg-coral-50 px-2.5 py-0.5 text-xs font-semibold text-coral-700 animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin" />
          Publishing...
        </span>
      );
    case 'PUBLISHED':
      return (
        <span className="badge-lime text-xs">
          <CheckCircle2 className="h-3 w-3" />
          Published
        </span>
      );
    case 'QUOTA_BLOCKED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          <Clock className="h-3 w-3" />
          Quota Delayed
        </span>
      );
    case 'FAILED_RETRYABLE':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
          <RotateCw className="h-3 w-3" />
          Retry Scheduled
        </span>
      );
    case 'FAILED_PERMANENT':
    case 'EXPIRED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
          <XCircle className="h-3 w-3" />
          Failed
        </span>
      );
    case 'AUTH_REQUIRED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
          Auth Required
        </span>
      );
    case 'RECOVERY_REQUIRED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-800">
          <ShieldAlert className="h-3.5 w-3.5 text-violet-600" />
          Attention Needed
        </span>
      );
    case 'CANCELLED':
      return (
        <span className="badge-neutral text-xs">
          <Ban className="h-3 w-3" />
          Cancelled
        </span>
      );
    default:
      return (
        <span className="badge-neutral text-xs">
          {status}
        </span>
      );
  }
}

export function ScheduleCard({ post, onResolveClick, onCancelClick }: ScheduleCardProps) {
  const isCancellable = ['SCHEDULED', 'QUOTA_BLOCKED', 'FAILED_RETRYABLE', 'AUTH_REQUIRED'].includes(post.status);
  const isRecoveryRequired = post.status === 'RECOVERY_REQUIRED';
  const isPublished = post.status === 'PUBLISHED';

  const scheduledDate = new Date(post.scheduledAt);
  let dateFormatted: string;
  let timeFormatted: string;

  try {
    dateFormatted = scheduledDate.toLocaleDateString(undefined, {
      timeZone: post.timezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    timeFormatted = scheduledDate.toLocaleTimeString(undefined, {
      timeZone: post.timezone,
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    dateFormatted = scheduledDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    timeFormatted = scheduledDate.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const relativeTime = formatRelativeTime(post.scheduledAt);
  const bodyText = post.contentSnapshot?.body || '';

  return (
    <div
      className={`card-base p-5 transition-all duration-200 ${
        isRecoveryRequired
          ? 'border-violet-300 bg-violet-50/20'
          : 'hover:border-canvas-border-muted'
      }`}
    >
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          {renderStatusBadge(post.status)}

          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <CalendarIcon className="h-3.5 w-3.5 text-text-muted" />
            <span>
              {dateFormatted} at {timeFormatted}
            </span>
            <span className="text-text-muted font-mono text-[11px]">({post.timezone})</span>
          </div>

          <span className="rounded-lg bg-soft-gray px-2 py-0.5 text-[11px] font-mono text-text-muted border border-canvas-border">
            {relativeTime}
          </span>
        </div>

        {/* Account Handle */}
        {post.socialAccount && (
          <div className="flex items-center gap-1 text-xs text-text-primary font-bold">
            <AtSign className="h-3.5 w-3.5 text-text-muted" />
            <span>{post.socialAccount.username}</span>
          </div>
        )}
      </div>

      {/* Post Text Preview */}
      <div className="rounded-xl border border-canvas-border bg-paper/60 p-4 mb-3.5">
        {post.contentSnapshot?.hook && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-0.5 text-[11px] font-semibold text-coral-700 border border-canvas-border shadow-subtle">
            <span>Hook:</span>
            <span className="italic truncate max-w-sm">"{post.contentSnapshot.hook}"</span>
          </div>
        )}
        <p className="text-xs sm:text-sm text-text-primary leading-relaxed font-sans line-clamp-3 whitespace-pre-wrap">
          {bodyText || '(Empty post content)'}
        </p>

        {/* Attempt & Error Indicators */}
        {post.attemptCount > 1 && (
          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-text-muted font-mono">
            <span>Attempts: {post.attemptCount}/5</span>
            {post.lastErrorMsg && (
              <span className="text-rose-700 truncate max-w-md">• {post.lastErrorMsg}</span>
            )}
          </div>
        )}
      </div>

      {/* Action Controls */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <div className="text-[11px] text-text-muted">
          Draft ID: <span className="font-mono text-text-secondary">{post.draftId.slice(0, 8)}</span>
        </div>

        <div className="flex items-center gap-2.5">
          {isRecoveryRequired && (
            <button
              onClick={() => onResolveClick(post)}
              className="btn-violet text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-subtle"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Operator Resolution</span>
            </button>
          )}

          {isCancellable && (
            <button
              onClick={() => onCancelClick(post)}
              className="rounded-xl border border-canvas-border bg-white px-3 py-1.5 text-xs text-text-secondary hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition-colors"
            >
              Cancel
            </button>
          )}

          {isPublished && post.socialAccount?.username && (
            <a
              href={`https://www.threads.net/@${post.socialAccount.username}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-lime-200 bg-lime-50 px-3 py-1.5 text-xs font-semibold text-lime-800 hover:bg-lime-100 transition-colors"
            >
              <span>View on Threads</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default ScheduleCard;

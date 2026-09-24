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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-coral-500/30 bg-coral-500/10 px-2.5 py-0.5 text-xs font-semibold text-coral-300 animate-pulse">
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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
          <Clock className="h-3 w-3" />
          Quota Delayed
        </span>
      );
    case 'FAILED_RETRYABLE':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-300">
          <RotateCw className="h-3 w-3" />
          Retry Scheduled
        </span>
      );
    case 'FAILED_PERMANENT':
    case 'EXPIRED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-400">
          <XCircle className="h-3 w-3" />
          Failed
        </span>
      );
    case 'AUTH_REQUIRED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-200 ring-2 ring-amber-500/30">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-300" />
          Auth Required
        </span>
      );
    case 'RECOVERY_REQUIRED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/50 bg-violet-500/20 px-2.5 py-0.5 text-xs font-bold text-violet-200 ring-2 ring-violet-500/30 animate-pulse">
          <ShieldAlert className="h-3.5 w-3.5 text-violet-300" />
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
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-200 p-5 backdrop-blur-xl ${
        isRecoveryRequired
          ? 'border-violet-500/40 bg-ink-850/90 shadow-glow-violet'
          : 'border-white/[0.08] bg-[#111116] hover:border-white/20 hover:bg-[#14141B]'
      }`}
    >
      {/* Top Meta Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          {renderStatusBadge(post.status)}

          <div className="flex items-center gap-1.5 text-xs text-white/60">
            <CalendarIcon className="h-3.5 w-3.5 text-white/40" />
            <span>
              {dateFormatted} at {timeFormatted}
            </span>
            <span className="text-white/30 font-mono text-[11px]">({post.timezone})</span>
          </div>

          <span className="rounded-lg bg-white/[0.04] px-2 py-0.5 text-[11px] font-mono text-white/50 border border-white/[0.04]">
            {relativeTime}
          </span>
        </div>

        {/* Account Handle */}
        {post.socialAccount && (
          <div className="flex items-center gap-1.5 text-xs text-coral-400 font-semibold">
            <AtSign className="h-3.5 w-3.5" />
            <span>{post.socialAccount.username}</span>
          </div>
        )}
      </div>

      {/* Post Text Preview */}
      <div className="relative rounded-xl border border-white/[0.06] bg-ink-950 p-4 mb-4">
        {post.contentSnapshot?.hook && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-coral-500/10 px-2 py-0.5 text-[11px] font-semibold text-coral-300 border border-coral-500/20">
            <span>Hook:</span>
            <span className="italic truncate max-w-sm">"{post.contentSnapshot.hook}"</span>
          </div>
        )}
        <p className="text-xs sm:text-sm text-white/90 leading-relaxed font-sans line-clamp-3 whitespace-pre-wrap">
          {bodyText || '(Empty post content)'}
        </p>

        {/* Attempt & Error Indicators */}
        {post.attemptCount > 1 && (
          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-white/40 font-mono">
            <span>Attempts: {post.attemptCount}/5</span>
            {post.lastErrorMsg && (
              <span className="text-rose-400 truncate max-w-md">&bull; {post.lastErrorMsg}</span>
            )}
          </div>
        )}
      </div>

      {/* Action Controls */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <div className="text-[11px] text-white/40">
          Draft ID: <span className="font-mono text-white/60">{post.draftId.slice(0, 8)}</span>
        </div>

        <div className="flex items-center gap-2.5">
          {isRecoveryRequired && (
            <button
              onClick={() => onResolveClick(post)}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-coral-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-violet-900/30 hover:from-violet-500 hover:to-coral-500 transition-all flex items-center gap-1.5"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Operator Resolution</span>
            </button>
          )}

          {isCancellable && (
            <button
              onClick={() => onCancelClick(post)}
              className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
            >
              Cancel
            </button>
          )}

          {isPublished && post.socialAccount?.username && (
            <a
              href={`https://www.threads.net/@${post.socialAccount.username}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-lime-500/30 bg-lime-500/10 px-3 py-1.5 text-xs font-semibold text-lime-300 hover:bg-lime-500/20 transition-colors"
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

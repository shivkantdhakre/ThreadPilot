export interface ScheduledPostSummary {
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

/**
 * Deterministically maps an ISO timestamp into a YYYY-MM-DD date key according to an explicit IANA timezone.
 * Resolves cross-timezone date skew so that e.g. 7:30 PM in America/New_York appears on that day,
 * even when viewed from a browser running in UTC+5:30 (India) or UTC+9 (Japan).
 */
export function getDateKeyInTimezone(isoString: string, timezone: string): string {
  try {
    const d = new Date(isoString);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback if timezone string is unparseable
  }
  return isoString.split('T')[0] || '';
}

/**
 * Converts a localized date-time string (e.g. from an HTML5 datetime-local input "YYYY-MM-DDTHH:mm")
 * and an IANA timezone into the exact UTC ISO string representing that wall-clock instant in that timezone.
 *
 * Prevents client-browser timezone skew where an operator in one timezone (e.g., IST UTC+5:30)
 * schedules a post for 2:00 PM New York time, but the browser parses it in IST.
 */
export function localDateTimeToUtc(dateTimeStr: string, timezone: string): string {
  try {
    const [datePart, timePart] = dateTimeStr.split('T');
    if (!datePart || !timePart) {
      return new Date(dateTimeStr).toISOString();
    }
    const [yearStr, monthStr, dayStr] = datePart.split('-');
    const [hourStr, minStr] = timePart.split(':');
    if (!yearStr || !monthStr || !dayStr || !hourStr || !minStr) {
      return new Date(dateTimeStr).toISOString();
    }
    const targetYear = parseInt(yearStr, 10);
    const targetMonth = parseInt(monthStr, 10);
    const targetDay = parseInt(dayStr, 10);
    const targetHour = parseInt(hourStr, 10);
    const targetMin = parseInt(minStr, 10);

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });

    function getWallClockComponents(date: Date) {
      const parts = formatter.formatToParts(date);
      let y = 0, m = 0, d = 0, h = 0, min = 0;
      for (const part of parts) {
        if (part.type === 'year') y = parseInt(part.value, 10);
        if (part.type === 'month') m = parseInt(part.value, 10);
        if (part.type === 'day') d = parseInt(part.value, 10);
        if (part.type === 'hour') {
          const val = parseInt(part.value, 10);
          h = val === 24 ? 0 : val;
        }
        if (part.type === 'minute') min = parseInt(part.value, 10);
      }
      return { y, m, d, h, min };
    }

    // Initial guess: treat target wall clock as UTC
    let guessTime = Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, targetMin, 0);

    // Iteratively converge (handles DST offsets and any timezone offset accurately)
    for (let i = 0; i < 3; i++) {
      const wall = getWallClockComponents(new Date(guessTime));
      const wallAsUtc = Date.UTC(wall.y, wall.m - 1, wall.d, wall.h, wall.min, 0);
      const targetAsUtc = Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, targetMin, 0);
      const diff = targetAsUtc - wallAsUtc;
      if (diff === 0) break;
      guessTime += diff;
    }

    return new Date(guessTime).toISOString();
  } catch {
    // Fallback if timezone is invalid
    return new Date(dateTimeStr).toISOString();
  }
}

/**
 * Formats time according to an explicit IANA timezone.
 */
export function formatTimeInTimezone(isoString: string, timezone: string): string {
  try {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });
  } catch {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

/**
 * Formats human-readable relative countdown or elapsed string.
 */
export function formatRelativeTime(dateStr: string): string {
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  const diffMs = target - now;
  const isFuture = diffMs > 0;
  const absDiffSec = Math.floor(Math.abs(diffMs) / 1000);

  if (absDiffSec < 60) return isFuture ? 'In less than a minute' : 'Just now';
  const mins = Math.floor(absDiffSec / 60);
  if (mins < 60) return isFuture ? `In ${mins}m` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return isFuture ? `In ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return isFuture ? `In ${days}d` : `${days}d ago`;
}

/**
 * Filters schedules by tab status and free-text search query.
 */
export function filterSchedules<T extends ScheduledPostSummary>(
  posts: T[],
  activeFilter: 'ALL' | 'UPCOMING' | 'PUBLISHED' | 'ATTENTION' | 'CANCELLED' | string,
  searchQuery: string,
): T[] {
  return posts.filter((p) => {
    // Status tab filter
    if (activeFilter === 'UPCOMING') {
      if (!['SCHEDULED', 'CLAIMED', 'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING'].includes(p.status)) {
        return false;
      }
    } else if (activeFilter === 'PUBLISHED') {
      if (p.status !== 'PUBLISHED') return false;
    } else if (activeFilter === 'ATTENTION') {
      if (!['RECOVERY_REQUIRED', 'QUOTA_BLOCKED', 'FAILED_RETRYABLE', 'AUTH_REQUIRED'].includes(p.status)) {
        return false;
      }
    } else if (activeFilter === 'CANCELLED') {
      if (!['CANCELLED', 'FAILED_PERMANENT', 'EXPIRED'].includes(p.status)) {
        return false;
      }
    }

    // Search query matching
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const body = p.contentSnapshot?.body?.toLowerCase() || '';
      const username = p.socialAccount?.username?.toLowerCase() || '';
      const hook = p.contentSnapshot?.hook?.toLowerCase() || '';
      return body.includes(q) || username.includes(q) || hook.includes(q);
    }

    return true;
  });
}

/**
 * Calculates adaptive background polling interval:
 * - 4,000ms when any post is actively in-flight (CLAIMED, CREATING_CONTAINER, CONTAINER_CREATED, PUBLISHING)
 * - 15,000ms standing cadence when all jobs are quiescent
 */
export function computePollInterval(posts: ScheduledPostSummary[]): number {
  const hasInFlightPosts = posts.some((p) =>
    ['CLAIMED', 'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING'].includes(p.status),
  );
  return hasInFlightPosts ? 4000 : 15000;
}

/**
 * Evaluates whether a post status is eligible for cancellation.
 */
export function isPostCancellable(status: string): boolean {
  return ['SCHEDULED', 'QUOTA_BLOCKED', 'FAILED_RETRYABLE', 'AUTH_REQUIRED'].includes(status);
}

/**
 * Evaluates whether a post requires human operator resolution.
 */
export function isRecoveryRequired(status: string): boolean {
  return status === 'RECOVERY_REQUIRED';
}

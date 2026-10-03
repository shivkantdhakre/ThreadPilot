export interface ScheduledPostQuotaRecord {
  id: string;
  workspaceId: string;
  socialAccountId: string;
  weekWindow: string; // "YYYY-Www"
  maxWeeklyPosts: number;
  claimedPosts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuotaReservationResult {
  allowed: boolean;
  claimedPosts: number;
  maxWeeklyPosts: number;
  weekWindow: string;
  reason?: string;
}

/**
 * Computes ISO 8601 calendar week format "YYYY-Www" for a given date in an IANA timezone.
 */
export function getIsoWeekWindow(date: Date, timeZone: string = 'UTC'): string {
  // Format date parts in the given timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
  const month = parseInt(parts.find((p) => p.type === 'month')!.value, 10) - 1;
  const day = parseInt(parts.find((p) => p.type === 'day')!.value, 10);

  // UTC date representing midnight in the specified timezone
  const target = new Date(Date.UTC(year, month, day));
  // Thursday in current week decides the year (ISO-8601)
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
  const isoYear = new Date(firstThursday).getUTCFullYear();
  const paddedWeek = weekNumber.toString().padStart(2, '0');
  return `${isoYear}-W${paddedWeek}`;
}

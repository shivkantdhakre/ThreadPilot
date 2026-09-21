import { createHash } from 'crypto';

/**
 * Normalizes text for outbound delivery, hashing, and recovery matching.
 * Trims leading and trailing whitespace while preserving internal formatting and newlines.
 */
export function canonicalOutboundText(text: string): string {
  if (!text) return '';
  return text.trim();
}

export interface RequestFingerprintParams {
  draftId: string;
  socialAccountId: string;
  scheduledAt: Date | string;
  timezone: string;
  contentVersionId: string;
}

/**
 * Generates a deterministic SHA-256 fingerprint for a scheduled publishing request.
 * Used for deduplication across runtime scheduling and legacy pre-migration backfill.
 */
export function canonicalRequestFingerprint(params: RequestFingerprintParams): string {
  const scheduledIso =
    params.scheduledAt instanceof Date
      ? params.scheduledAt.toISOString()
      : new Date(params.scheduledAt).toISOString();

  const payload = [
    params.draftId,
    params.socialAccountId,
    scheduledIso,
    params.timezone,
    params.contentVersionId,
  ].join(':');

  return createHash('sha256').update(payload).digest('hex');
}

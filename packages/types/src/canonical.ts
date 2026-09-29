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

/**
 * Authoritative Threads text validator.
 * Validates against Meta's contract: at most 500 JavaScript UTF-16 code units,
 * and non-empty (trim length > 0).
 */
export function validateThreadText(text: string): { valid: boolean; length: number; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, length: 0, error: 'Text must not be empty' };
  }
  const length = text.length; // UTF-16 code units (Meta specification)
  if (length > 500) {
    return {
      valid: false,
      length,
      error: `Text length ${length} exceeds maximum 500 UTF-16 code units`,
    };
  }
  return { valid: true, length };
}

/**
 * Deterministic SHA-256 hash of canonical normalized text.
 * Used for deduplication and canonical content identity.
 */
export function canonicalContentHash(text: string): string {
  return createHash('sha256').update(canonicalOutboundText(text)).digest('hex');
}


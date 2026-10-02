import { ObservationStatus } from '@threadpilot/database';

export class InvalidObservationTransitionError extends Error {
  constructor(from: ObservationStatus, to: ObservationStatus) {
    super(`Invalid observation status transition from ${from} to ${to}`);
    this.name = 'InvalidObservationTransitionError';
  }
}

export const VALID_OBSERVATION_TRANSITIONS: Record<ObservationStatus, ObservationStatus[]> = {
  [ObservationStatus.SCHEDULED]: [
    ObservationStatus.PROCESSING, // Worker claims observation via CAS lease
    ObservationStatus.MISSED,     // Window closed before worker pickup
  ],
  [ObservationStatus.PROCESSING]: [
    ObservationStatus.CAPTURED,     // HTTP 200: PostMetric persisted (TERMINAL)
    ObservationStatus.FAILED,       // Transient 5xx/timeout: eligible for retry within window
    ObservationStatus.RATE_LIMITED, // HTTP 429: delayed retry within window
    ObservationStatus.MISSED,       // Window closed during attempt or backoff exceeds window (TERMINAL)
    ObservationStatus.DELETED,      // HTTP 404: post removed on platform (TERMINAL)
    ObservationStatus.UNAVAILABLE,  // HTTP 401/403: auth revoked (TERMINAL)
  ],
  [ObservationStatus.FAILED]: [
    ObservationStatus.PROCESSING, // Retry claimed by worker via CAS lease
    ObservationStatus.MISSED,     // Window expired while awaiting retry (TERMINAL)
  ],
  [ObservationStatus.RATE_LIMITED]: [
    ObservationStatus.PROCESSING, // Delayed retry claimed by worker via CAS lease
    ObservationStatus.MISSED,     // Window expired while awaiting cool-off (TERMINAL)
  ],
  // Terminal states cannot transition to anything
  [ObservationStatus.CAPTURED]: [],
  [ObservationStatus.MISSED]: [],
  [ObservationStatus.DELETED]: [],
  [ObservationStatus.UNAVAILABLE]: [],
};

export function validateObservationTransition(from: ObservationStatus, to: ObservationStatus): void {
  const allowed = VALID_OBSERVATION_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidObservationTransitionError(from, to);
  }
}

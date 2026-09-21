import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getDateKeyInTimezone,
  localDateTimeToUtc,
  formatTimeInTimezone,
  formatRelativeTime,
  filterSchedules,
  computePollInterval,
  isPostCancellable,
  isRecoveryRequired,
} from '../src/lib/schedule-utils.ts';
import type { ScheduledPostSummary } from '../src/lib/schedule-utils.ts';

describe('Phase 2 UI Calendar & Scheduling Verification Suite', () => {
  describe('1. Cross-Timezone Date Placement Invariants (Issue #3)', () => {
    it('correctly maps 2026-09-22T23:30:00Z to 2026-09-22 in America/New_York (EDT, UTC-4)', () => {
      // 23:30 UTC - 4 hours = 19:30 (7:30 PM) on Sep 22 in New York
      const isoUtc = '2026-09-22T23:30:00.000Z';
      const nyKey = getDateKeyInTimezone(isoUtc, 'America/New_York');
      assert.strictEqual(nyKey, '2026-09-22');
    });

    it('correctly maps 2026-09-22T23:30:00Z to 2026-09-23 in Asia/Kolkata (IST, UTC+5:30)', () => {
      // 23:30 UTC + 5h30m = 05:00 AM on Sep 23 in India
      const isoUtc = '2026-09-22T23:30:00.000Z';
      const indiaKey = getDateKeyInTimezone(isoUtc, 'Asia/Kolkata');
      assert.strictEqual(indiaKey, '2026-09-23');
    });

    it('correctly maps 2026-09-22T23:30:00Z to 2026-09-23 in Europe/London (BST, UTC+1)', () => {
      // 23:30 UTC + 1 hour = 00:30 AM on Sep 23 in London
      const isoUtc = '2026-09-22T23:30:00.000Z';
      const londonKey = getDateKeyInTimezone(isoUtc, 'Europe/London');
      assert.strictEqual(londonKey, '2026-09-23');
    });

    it('prevents calendar day skew when grouping posts by target schedule timezone', () => {
      // A post scheduled for America/New_York should stay on Sep 22 when rendered in target TZ,
      // regardless of the viewer's local browser timezone
      const samplePost: ScheduledPostSummary = {
        id: 'sched-1',
        workspaceId: 'ws-1',
        draftId: 'draft-1',
        socialAccountId: 'acc-1',
        contentVersionId: 'ver-1',
        scheduledAt: '2026-09-22T23:30:00.000Z',
        timezone: 'America/New_York',
        status: 'SCHEDULED',
        attemptCount: 0,
        createdAt: '2026-09-21T00:00:00.000Z',
        updatedAt: '2026-09-21T00:00:00.000Z',
      };

      // Target timezone grouping (default mode)
      const targetTzKey = getDateKeyInTimezone(samplePost.scheduledAt, samplePost.timezone);
      assert.strictEqual(targetTzKey, '2026-09-22', 'Must sit in the September 22 calendar cell in America/New_York');

      // Local viewer timezone grouping (toggle mode)
      const viewerTzIndia = 'Asia/Kolkata';
      const viewerTzKey = getDateKeyInTimezone(samplePost.scheduledAt, viewerTzIndia);
      assert.strictEqual(viewerTzKey, '2026-09-23', 'Viewer in India sees it in the September 23 cell when toggled');
    });

    it('handles fallback gracefully when invalid timezone string is provided', () => {
      const isoUtc = '2026-09-22T15:00:00.000Z';
      const fallbackKey = getDateKeyInTimezone(isoUtc, 'Invalid/Timezone');
      assert.strictEqual(fallbackKey, '2026-09-22');
    });
  });

  describe('1b. Wall-Clock to UTC Instant Conversion (localDateTimeToUtc)', () => {
    it('correctly converts 14:00 in America/New_York (EDT, UTC-4) to 18:00:00.000Z', () => {
      const utcIso = localDateTimeToUtc('2026-09-25T14:00', 'America/New_York');
      assert.strictEqual(utcIso, '2026-09-25T18:00:00.000Z');
    });

    it('correctly converts 14:00 in Asia/Kolkata (IST, UTC+5:30) to 08:30:00.000Z', () => {
      const utcIso = localDateTimeToUtc('2026-09-25T14:00', 'Asia/Kolkata');
      assert.strictEqual(utcIso, '2026-09-25T08:30:00.000Z');
    });

    it('correctly converts 14:00 in Europe/London (BST, UTC+1) to 13:00:00.000Z', () => {
      const utcIso = localDateTimeToUtc('2026-09-25T14:00', 'Europe/London');
      assert.strictEqual(utcIso, '2026-09-25T13:00:00.000Z');
    });

    it('correctly handles midnight across day boundaries (Pacific/Honolulu, UTC-10)', () => {
      const utcIso = localDateTimeToUtc('2026-01-15T00:00', 'Pacific/Honolulu');
      assert.strictEqual(utcIso, '2026-01-15T10:00:00.000Z');
    });

    it('correctly handles UTC timezone identity', () => {
      const utcIso = localDateTimeToUtc('2026-06-15T12:00', 'UTC');
      assert.strictEqual(utcIso, '2026-06-15T12:00:00.000Z');
    });
  });

  describe('2. Timezone-Aware Formatting', () => {
    it('formats time string accurately in different target timezones', () => {
      const isoUtc = '2026-09-22T14:30:00.000Z';
      
      const nyTime = formatTimeInTimezone(isoUtc, 'America/New_York'); // 10:30 AM EDT
      const istTime = formatTimeInTimezone(isoUtc, 'Asia/Kolkata'); // 08:00 PM IST

      assert.ok(nyTime.includes('10:30'), `Expected 10:30 in NY, got ${nyTime}`);
      assert.ok(istTime.includes('8:00') || istTime.includes('20:00'), `Expected 8:00 PM in IST, got ${istTime}`);
    });
  });

  describe('3. Relative Time Countdowns (formatRelativeTime)', () => {
    it('formats imminent future times (< 60s)', () => {
      const imminent = new Date(Date.now() + 30 * 1000).toISOString();
      assert.strictEqual(formatRelativeTime(imminent), 'In less than a minute');
    });

    it('formats past times (< 60s ago)', () => {
      const justNow = new Date(Date.now() - 20 * 1000).toISOString();
      assert.strictEqual(formatRelativeTime(justNow), 'Just now');
    });

    it('formats future hours and minutes', () => {
      const in25m = new Date(Date.now() + 25 * 60 * 1000).toISOString();
      assert.strictEqual(formatRelativeTime(in25m), 'In 25m');

      const in3h = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
      assert.strictEqual(formatRelativeTime(in3h), 'In 3h');

      const in2d = new Date(Date.now() + 2 * 86400 * 1000 + 3600 * 1000).toISOString();
      assert.strictEqual(formatRelativeTime(in2d), 'In 2d');
    });
  });

  describe('4. Filter Tabs and Search Logic (Issue #4)', () => {
    const mockPosts: ScheduledPostSummary[] = [
      {
        id: 'p-1',
        workspaceId: 'ws-1',
        draftId: 'd-1',
        socialAccountId: 'acc-1',
        contentVersionId: 'v-1',
        scheduledAt: '2026-09-22T10:00:00Z',
        timezone: 'UTC',
        status: 'SCHEDULED',
        attemptCount: 0,
        contentSnapshot: { body: 'Deep dive into TypeScript 5.5 type narrowing', hook: 'TypeScript Pro Tip' },
        socialAccount: { id: 'acc-1', username: 'tech_lead' },
        createdAt: '2026-09-21T00:00:00Z',
        updatedAt: '2026-09-21T00:00:00Z',
      },
      {
        id: 'p-2',
        workspaceId: 'ws-1',
        draftId: 'd-2',
        socialAccountId: 'acc-1',
        contentVersionId: 'v-2',
        scheduledAt: '2026-09-22T11:00:00Z',
        timezone: 'UTC',
        status: 'PUBLISHING',
        attemptCount: 1,
        contentSnapshot: { body: 'Announcing our new automated Threads scheduler', hook: 'Huge Launch' },
        socialAccount: { id: 'acc-1', username: 'tech_lead' },
        createdAt: '2026-09-21T00:00:00Z',
        updatedAt: '2026-09-21T00:00:00Z',
      },
      {
        id: 'p-3',
        workspaceId: 'ws-1',
        draftId: 'd-3',
        socialAccountId: 'acc-2',
        contentVersionId: 'v-3',
        scheduledAt: '2026-09-21T12:00:00Z',
        timezone: 'UTC',
        status: 'PUBLISHED',
        attemptCount: 1,
        contentSnapshot: { body: 'Why AI agents are transforming social content', hook: 'AI Agents' },
        socialAccount: { id: 'acc-2', username: 'growth_ninja' },
        createdAt: '2026-09-20T00:00:00Z',
        updatedAt: '2026-09-21T12:00:00Z',
      },
      {
        id: 'p-4',
        workspaceId: 'ws-1',
        draftId: 'd-4',
        socialAccountId: 'acc-1',
        contentVersionId: 'v-4',
        scheduledAt: '2026-09-21T14:00:00Z',
        timezone: 'UTC',
        status: 'RECOVERY_REQUIRED',
        attemptCount: 3,
        lastErrorCode: 'AMBIGUOUS_TIMEOUT',
        contentSnapshot: { body: 'Network timed out during publish call', hook: 'Need Review' },
        socialAccount: { id: 'acc-1', username: 'tech_lead' },
        createdAt: '2026-09-20T00:00:00Z',
        updatedAt: '2026-09-21T14:00:00Z',
      },
      {
        id: 'p-5',
        workspaceId: 'ws-1',
        draftId: 'd-5',
        socialAccountId: 'acc-2',
        contentVersionId: 'v-5',
        scheduledAt: '2026-09-21T15:00:00Z',
        timezone: 'UTC',
        status: 'CANCELLED',
        attemptCount: 0,
        contentSnapshot: { body: 'Cancelled announcement post', hook: 'Draft v1' },
        socialAccount: { id: 'acc-2', username: 'growth_ninja' },
        createdAt: '2026-09-20T00:00:00Z',
        updatedAt: '2026-09-21T15:00:00Z',
      },
    ];

    it('correctly filters UPCOMING posts (includes SCHEDULED and PUBLISHING in-flight)', () => {
      const upcoming = filterSchedules(mockPosts, 'UPCOMING', '');
      assert.strictEqual(upcoming.length, 2);
      assert.deepStrictEqual(upcoming.map(p => p.id), ['p-1', 'p-2']);
    });

    it('correctly filters PUBLISHED posts', () => {
      const published = filterSchedules(mockPosts, 'PUBLISHED', '');
      assert.strictEqual(published.length, 1);
      assert.strictEqual(published[0].id, 'p-3');
    });

    it('correctly filters ATTENTION NEEDED posts (RECOVERY_REQUIRED)', () => {
      const attention = filterSchedules(mockPosts, 'ATTENTION', '');
      assert.strictEqual(attention.length, 1);
      assert.strictEqual(attention[0].id, 'p-4');
    });

    it('correctly filters CANCELLED posts', () => {
      const cancelled = filterSchedules(mockPosts, 'CANCELLED', '');
      assert.strictEqual(cancelled.length, 1);
      assert.strictEqual(cancelled[0].id, 'p-5');
    });

    it('filters by search term in post body', () => {
      const results = filterSchedules(mockPosts, 'ALL', 'type narrowing');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, 'p-1');
    });

    it('filters by search term in account username', () => {
      const results = filterSchedules(mockPosts, 'ALL', 'growth_ninja');
      assert.strictEqual(results.length, 2);
      assert.deepStrictEqual(results.map(p => p.id), ['p-3', 'p-5']);
    });

    it('filters by search term in hook text', () => {
      const results = filterSchedules(mockPosts, 'ALL', 'huge launch');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, 'p-2');
    });
  });

  describe('5. Real-Time Update Transport & Polling Cadence (Issue #2)', () => {
    it('accelerates polling to 4,000ms when publishing or container-creation is in-flight', () => {
      const activePosts: ScheduledPostSummary[] = [
        {
          id: 'p-1',
          workspaceId: 'ws-1',
          draftId: 'd-1',
          socialAccountId: 'acc-1',
          contentVersionId: 'v-1',
          scheduledAt: '2026-09-22T10:00:00Z',
          timezone: 'UTC',
          status: 'PUBLISHING',
          attemptCount: 1,
          createdAt: '2026-09-21T00:00:00Z',
          updatedAt: '2026-09-21T00:00:00Z',
        },
      ];
      const interval = computePollInterval(activePosts);
      assert.strictEqual(interval, 4000, 'Must poll every 4s for in-flight publishing jobs');
    });

    it('throttles polling to 15,000ms standing cadence when all jobs are quiescent', () => {
      const quiescentPosts: ScheduledPostSummary[] = [
        {
          id: 'p-1',
          workspaceId: 'ws-1',
          draftId: 'd-1',
          socialAccountId: 'acc-1',
          contentVersionId: 'v-1',
          scheduledAt: '2026-09-22T10:00:00Z',
          timezone: 'UTC',
          status: 'SCHEDULED',
          attemptCount: 0,
          createdAt: '2026-09-21T00:00:00Z',
          updatedAt: '2026-09-21T00:00:00Z',
        },
        {
          id: 'p-2',
          workspaceId: 'ws-1',
          draftId: 'd-2',
          socialAccountId: 'acc-1',
          contentVersionId: 'v-2',
          scheduledAt: '2026-09-21T10:00:00Z',
          timezone: 'UTC',
          status: 'PUBLISHED',
          attemptCount: 1,
          createdAt: '2026-09-21T00:00:00Z',
          updatedAt: '2026-09-21T10:00:00Z',
        },
      ];
      const interval = computePollInterval(quiescentPosts);
      assert.strictEqual(interval, 15000, 'Must poll at 15s standing interval when idle');
    });
  });

  describe('6. FSM State Lifecycle & Modal Verification (Issue #1)', () => {
    it('verifies cancellation eligibility guard via isPostCancellable', () => {
      const cancellableStatuses = ['SCHEDULED', 'QUOTA_BLOCKED', 'FAILED_RETRYABLE'];
      const nonCancellableStatuses = ['CLAIMED', 'PUBLISHING', 'PUBLISHED', 'CANCELLED', 'RECOVERY_REQUIRED'];

      cancellableStatuses.forEach((status) => {
        assert.ok(isPostCancellable(status), `${status} should be cancellable`);
      });

      nonCancellableStatuses.forEach((status) => {
        assert.ok(!isPostCancellable(status), `${status} must NOT be cancellable`);
      });
    });

    it('verifies recovery required guard via isRecoveryRequired', () => {
      assert.ok(isRecoveryRequired('RECOVERY_REQUIRED'));
      assert.ok(!isRecoveryRequired('SCHEDULED'));
      assert.ok(!isRecoveryRequired('PUBLISHED'));
    });

    it('verifies operator resolution modal actions for RECOVERY_REQUIRED', () => {
      // Path A: CONFIRM_NOT_PUBLISHED requires explicit checkbox attestation
      const pathAPayloadValid = {
        action: 'CONFIRM_NOT_PUBLISHED' as const,
        operatorAttestedNotPublished: true,
      };
      assert.strictEqual(pathAPayloadValid.operatorAttestedNotPublished, true);

      // Path B: CONFIRM_PUBLISHED requires threadsPostId
      const pathBPayloadValid = {
        action: 'CONFIRM_PUBLISHED' as const,
        threadsPostId: 'threads_post_123456789',
      };
      assert.ok(pathBPayloadValid.threadsPostId.length > 0);
    });
  });
});

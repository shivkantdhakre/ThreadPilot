import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mirroring pure UI logic from apps/web/src/app/(dashboard)/analytics/page.tsx
const DIMENSIONS = [
  { key: 'PUBLISH_HOUR_UTC', label: 'Publish Hour' },
  { key: 'PUBLISH_DAY_OF_WEEK', label: 'Day of Week' },
  { key: 'POST_LENGTH_BUCKET', label: 'Post Length' },
  { key: 'MEDIA_TYPE', label: 'Media Type' },
  { key: 'TOPIC', label: 'Topic' },
  { key: 'FORMAT', label: 'Format' },
];

function formatDimensionValue(dim: string, val: string): string {
  if (!val) return '—';
  if (dim === 'PUBLISH_HOUR_UTC') {
    const h = parseInt(val, 10);
    if (!isNaN(h)) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h).padStart(2, '0')}:00 UTC (${h12} ${ampm})`;
    }
  }
  if (dim === 'PUBLISH_DAY_OF_WEEK') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const d = parseInt(val, 10);
    return days[d] ?? val;
  }
  if (dim === 'POST_LENGTH_BUCKET') {
    if (val === 'SHORT') return 'Short (<100 chars)';
    if (val === 'MEDIUM') return 'Medium (100–280 chars)';
    if (val === 'LONG') return 'Long (>280 chars)';
  }
  if (dim === 'MEDIA_TYPE') {
    if (val === 'TEXT_POST' || val === 'TEXT') return 'Text Post';
    if (val === 'IMAGE') return 'Image Post';
    if (val === 'VIDEO') return 'Video Post';
  }
  return val;
}

function computePermissionBannerVisibility(
  missingInsightsPermission: boolean | undefined,
  isPermissionBannerDismissed: boolean,
  metricCount: number | undefined,
): boolean {
  return (
    Boolean(missingInsightsPermission) &&
    !isPermissionBannerDismissed &&
    (metricCount ?? 0) === 0
  );
}

function computeNeedsSync(pipelineStatus: {
  unbackfilledPostCount?: number;
  ingestedPostCount?: number;
  publishedPostCount?: number;
  postsMissingObsCount?: number;
  metricCount?: number;
}): boolean {
  const unbackfilledCount =
    pipelineStatus?.unbackfilledPostCount ??
    Math.max(0, (pipelineStatus?.ingestedPostCount ?? 0) - (pipelineStatus?.publishedPostCount ?? 0));
  const postsMissingObsCount = pipelineStatus?.postsMissingObsCount ?? 0;
  return unbackfilledCount > 0 || postsMissingObsCount > 0 || (pipelineStatus?.metricCount ?? 0) === 0;
}

function computeOptimalWindowBadge(optimalWindows: any): {
  badgeLabel: string;
  badgeStyle: 'amber' | 'emerald';
  isEmpirical: boolean;
} | null {
  if (!optimalWindows) return null;
  if (optimalWindows.isEmpirical) {
    return {
      badgeLabel: 'Early Signal (Empirical Top Performer)',
      badgeStyle: 'amber',
      isEmpirical: true,
    };
  }
  return {
    badgeLabel: 'Statistically Validated (Grade A/B)',
    badgeStyle: 'emerald',
    isEmpirical: false,
  };
}

describe('Analytics UI/UX State & Integration Logic Suite', () => {
  describe('Dimension Value Formatting Semantics', () => {
    it('formats PUBLISH_HOUR_UTC across midnight, noon, morning, and evening accurately', () => {
      assert.equal(formatDimensionValue('PUBLISH_HOUR_UTC', '0'), '00:00 UTC (12 AM)');
      assert.equal(formatDimensionValue('PUBLISH_HOUR_UTC', '9'), '09:00 UTC (9 AM)');
      assert.equal(formatDimensionValue('PUBLISH_HOUR_UTC', '12'), '12:00 UTC (12 PM)');
      assert.equal(formatDimensionValue('PUBLISH_HOUR_UTC', '16'), '16:00 UTC (4 PM)');
      assert.equal(formatDimensionValue('PUBLISH_HOUR_UTC', '23'), '23:00 UTC (11 PM)');
    });

    it('formats PUBLISH_DAY_OF_WEEK across all 7 days of the week', () => {
      assert.equal(formatDimensionValue('PUBLISH_DAY_OF_WEEK', '0'), 'Sunday');
      assert.equal(formatDimensionValue('PUBLISH_DAY_OF_WEEK', '1'), 'Monday');
      assert.equal(formatDimensionValue('PUBLISH_DAY_OF_WEEK', '2'), 'Tuesday');
      assert.equal(formatDimensionValue('PUBLISH_DAY_OF_WEEK', '3'), 'Wednesday');
      assert.equal(formatDimensionValue('PUBLISH_DAY_OF_WEEK', '4'), 'Thursday');
      assert.equal(formatDimensionValue('PUBLISH_DAY_OF_WEEK', '5'), 'Friday');
      assert.equal(formatDimensionValue('PUBLISH_DAY_OF_WEEK', '6'), 'Saturday');
    });

    it('formats POST_LENGTH_BUCKET with clear character counts', () => {
      assert.equal(formatDimensionValue('POST_LENGTH_BUCKET', 'SHORT'), 'Short (<100 chars)');
      assert.equal(formatDimensionValue('POST_LENGTH_BUCKET', 'MEDIUM'), 'Medium (100–280 chars)');
      assert.equal(formatDimensionValue('POST_LENGTH_BUCKET', 'LONG'), 'Long (>280 chars)');
    });

    it('formats MEDIA_TYPE with user-friendly post type descriptions', () => {
      assert.equal(formatDimensionValue('MEDIA_TYPE', 'TEXT'), 'Text Post');
      assert.equal(formatDimensionValue('MEDIA_TYPE', 'TEXT_POST'), 'Text Post');
      assert.equal(formatDimensionValue('MEDIA_TYPE', 'IMAGE'), 'Image Post');
      assert.equal(formatDimensionValue('MEDIA_TYPE', 'VIDEO'), 'Video Post');
    });

    it('handles empty, null, or custom dimension values gracefully without throwing', () => {
      assert.equal(formatDimensionValue('TOPIC', ''), '—');
      assert.equal(formatDimensionValue('TOPIC', 'System Architecture'), 'System Architecture');
      assert.equal(formatDimensionValue('FORMAT', 'THREAD'), 'THREAD');
    });
  });

  describe('Dynamic Permission Warning Banner Semantics', () => {
    it('displays banner when permission is missing AND metricCount is 0 AND not dismissed', () => {
      const isVisible = computePermissionBannerVisibility(true, false, 0);
      assert.equal(isVisible, true);
    });

    it('hides banner when user clicks dismiss (✕)', () => {
      const isVisible = computePermissionBannerVisibility(true, true, 0);
      assert.equal(isVisible, false, 'Must hide when dismissed');
    });

    it('suppresses false-positive warning when metrics have already been captured (metricCount > 0)', () => {
      const isVisible = computePermissionBannerVisibility(true, false, 45);
      assert.equal(isVisible, false, 'Must not show warning banner if metrics are populated');
    });

    it('does not display banner when permission is not missing', () => {
      const isVisible = computePermissionBannerVisibility(false, false, 0);
      assert.equal(isVisible, false);
    });
  });

  describe('Optimal Window Badge & Early Signal Mapping', () => {
    it('maps empirical optimal windows to Early Signal amber badge', () => {
      const badge = computeOptimalWindowBadge({
        isEmpirical: true,
        bestHourUtc: 16,
        bestDay: 6,
        bestTopic: 'AI Architecture',
      });

      assert.ok(badge);
      assert.equal(badge.isEmpirical, true);
      assert.equal(badge.badgeStyle, 'amber');
      assert.ok(badge.badgeLabel.includes('Early Signal'));
    });

    it('maps longitudinal learned profile to Statistically Validated emerald badge', () => {
      const badge = computeOptimalWindowBadge({
        isEmpirical: false,
        bestHourUtc: 14,
        bestDay: 2,
        bestTopic: 'TypeScript',
      });

      assert.ok(badge);
      assert.equal(badge.isEmpirical, false);
      assert.equal(badge.badgeStyle, 'emerald');
      assert.ok(badge.badgeLabel.includes('Statistically Validated'));
    });

    it('handles null optimalWindows without crashing', () => {
      const badge = computeOptimalWindowBadge(null);
      assert.equal(badge, null);
    });
  });

  describe('Sync & Backfill Trigger Evaluation (needsSync)', () => {
    it('evaluates needsSync = true when unbackfilled posts exist', () => {
      const needsSync = computeNeedsSync({
        unbackfilledPostCount: 15,
        metricCount: 10,
        postsMissingObsCount: 0,
      });
      assert.equal(needsSync, true);
    });

    it('evaluates needsSync = true when posts are missing observations', () => {
      const needsSync = computeNeedsSync({
        unbackfilledPostCount: 0,
        metricCount: 10,
        postsMissingObsCount: 5,
      });
      assert.equal(needsSync, true);
    });

    it('evaluates needsSync = true when metricCount is 0', () => {
      const needsSync = computeNeedsSync({
        unbackfilledPostCount: 0,
        metricCount: 0,
        postsMissingObsCount: 0,
      });
      assert.equal(needsSync, true);
    });

    it('evaluates needsSync = false when pipeline is fully up-to-date', () => {
      const needsSync = computeNeedsSync({
        unbackfilledPostCount: 0,
        metricCount: 120,
        postsMissingObsCount: 0,
      });
      assert.equal(needsSync, false);
    });
  });

  describe('Cohort Dimension Navigation Tabs', () => {
    it('defines all 6 canonical aggregation dimensions', () => {
      assert.equal(DIMENSIONS.length, 6);
      const keys = DIMENSIONS.map((d) => d.key);
      assert.deepEqual(keys, [
        'PUBLISH_HOUR_UTC',
        'PUBLISH_DAY_OF_WEEK',
        'POST_LENGTH_BUCKET',
        'MEDIA_TYPE',
        'TOPIC',
        'FORMAT',
      ]);
    });
  });
});

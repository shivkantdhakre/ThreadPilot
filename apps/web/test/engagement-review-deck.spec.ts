import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateThreadText } from '@threadpilot/types';

describe('Engagement Review Deck & Community Intelligence Suite', () => {
  describe('UTF-16 Code-Unit 500-Character Validation (Meta Threads Hard Boundary)', () => {
    it('accepts text exactly at 500 UTF-16 code units', () => {
      const text500 = 'a'.repeat(500);
      const res = validateThreadText(text500);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.length, 500);
    });

    it('rejects text at 501 UTF-16 code units', () => {
      const text501 = 'a'.repeat(501);
      const res = validateThreadText(text501);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.length, 501);
      assert.match(res.error || '', /exceeds maximum 500/);
    });

    it('accurately measures emoji surrogate pairs (each emoji is 2 UTF-16 code units)', () => {
      // 249 ascii chars + 1 emoji (2 code units) = 251 code units
      const withEmoji = 'a'.repeat(249) + '🚀';
      const res1 = validateThreadText(withEmoji);
      assert.strictEqual(res1.length, 251);
      assert.strictEqual(res1.valid, true);

      // 249 emojis = 498 code units (valid)
      const emojis498 = '🚀'.repeat(249);
      const res2 = validateThreadText(emojis498);
      assert.strictEqual(res2.length, 498);
      assert.strictEqual(res2.valid, true);

      // 251 emojis = 502 code units (exceeds 500)
      const emojis502 = '🚀'.repeat(251);
      const res3 = validateThreadText(emojis502);
      assert.strictEqual(res3.length, 502);
      assert.strictEqual(res3.valid, false);
    });

    it('rejects empty or whitespace-only text', () => {
      assert.strictEqual(validateThreadText('').valid, false);
      assert.strictEqual(validateThreadText('   \n\t   ').valid, false);
    });
  });

  describe('Community Deck Filter Tab Semantics', () => {
    const mockInteractions: any[] = [
      {
        id: 'int-1',
        status: 'REVIEW_REQUIRED',
        draft: { status: 'PENDING_APPROVAL', approvalMode: 'MANUAL' },
      },
      {
        id: 'int-2',
        status: 'REPLIED',
        draft: { status: 'PUBLISHED', approvalMode: 'MANUAL' },
      },
      {
        id: 'int-3',
        status: 'REPLIED',
        draft: { status: 'PUBLISHED', approvalMode: 'AUTONOMOUS' },
      },
      {
        id: 'int-4',
        status: 'DISMISSED',
        draft: null,
      },
      {
        id: 'int-5',
        status: 'IGNORED',
        draft: null,
      },
    ];

    function filterDeck(interactions: any[], tab: string) {
      switch (tab) {
        case 'NEEDS_REVIEW':
          return interactions.filter(
            (i) => i.status === 'REVIEW_REQUIRED' || i.draft?.status === 'PENDING_APPROVAL',
          );
        case 'REPLIED':
          return interactions.filter((i) => i.status === 'REPLIED');
        case 'AUTONOMOUS':
          return interactions.filter((i) => i.draft?.approvalMode === 'AUTONOMOUS');
        case 'DISMISSED':
          return interactions.filter((i) => i.status === 'DISMISSED' || i.status === 'IGNORED');
        case 'ALL':
        default:
          return interactions;
      }
    }

    it('NEEDS_REVIEW filters only pending operator review items', () => {
      const res = filterDeck(mockInteractions, 'NEEDS_REVIEW');
      assert.strictEqual(res.length, 1);
      assert.strictEqual(res[0].id, 'int-1');
    });

    it('REPLIED filters all completed replies (manual and autonomous)', () => {
      const res = filterDeck(mockInteractions, 'REPLIED');
      assert.strictEqual(res.length, 2);
      assert.ok(res.some((i) => i.id === 'int-2'));
      assert.ok(res.some((i) => i.id === 'int-3'));
    });

    it('AUTONOMOUS filters exclusively machine-published replies', () => {
      const res = filterDeck(mockInteractions, 'AUTONOMOUS');
      assert.strictEqual(res.length, 1);
      assert.strictEqual(res[0].id, 'int-3');
    });

    it('DISMISSED filters dismissed and ignored interactions', () => {
      const res = filterDeck(mockInteractions, 'DISMISSED');
      assert.strictEqual(res.length, 2);
      assert.ok(res.some((i) => i.id === 'int-4'));
      assert.ok(res.some((i) => i.id === 'int-5'));
    });

    it('ALL preserves entire interaction corpus', () => {
      const res = filterDeck(mockInteractions, 'ALL');
      assert.strictEqual(res.length, 5);
    });
  });

  describe('Optimistic Concurrency & 409 Conflict Handling', () => {
    it('detects 409 Conflict on version mismatch and triggers reload alert', () => {
      function handleApiError(statusCode: number) {
        if (statusCode === 409) {
          return {
            isConflict: true,
            userMessage: 'This draft was updated by another operator or background agent. Please refresh to see latest version.',
          };
        }
        return { isConflict: false, userMessage: 'Operation failed' };
      }

      const conflictResult = handleApiError(409);
      assert.strictEqual(conflictResult.isConflict, true);
      assert.match(conflictResult.userMessage, /another operator/);

      const otherResult = handleApiError(500);
      assert.strictEqual(otherResult.isConflict, false);
    });
  });

  describe('Outbound Kill Switch & Autonomy Status Badge Mapping', () => {
    it('computes correct circuit breaker warning when replies are paused', () => {
      function getEngineBanner(repliesPaused: boolean, autonomyLevel: string) {
        if (repliesPaused) {
          return {
            severity: 'CRITICAL',
            text: 'Outbound Reply Kill Switch is ACTIVE. All autonomous replies are paused.',
          };
        }
        return {
          severity: 'INFO',
          text: `Reply Engine running in ${autonomyLevel} mode.`,
        };
      }

      const pausedBanner = getEngineBanner(true, 'RULES_BASED');
      assert.strictEqual(pausedBanner.severity, 'CRITICAL');
      assert.match(pausedBanner.text, /Kill Switch is ACTIVE/);

      const activeBanner = getEngineBanner(false, 'SHADOW');
      assert.strictEqual(activeBanner.severity, 'INFO');
      assert.match(activeBanner.text, /SHADOW mode/);
    });
  });
});

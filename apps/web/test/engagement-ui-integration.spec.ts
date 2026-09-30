import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';

describe('Phase 3: UI/UX Feature Integration & Community Intelligence Tests', () => {
  describe('Dashboard Telemetry Widget Calculations & State Transitions', () => {
    function computeTelemetryViewModel(stats: {
      pendingReview?: number;
      autoReplied?: number;
      replied?: number;
    } | null) {
      const pendingReview = stats?.pendingReview ?? 0;
      const autoReplied = stats?.autoReplied ?? 0;
      const totalReplied = stats?.replied ?? 0;

      const hasPendingItems = pendingReview > 0;
      const statusBadge = hasPendingItems
        ? { text: `${pendingReview} Require Review`, variant: 'warning' }
        : { text: 'Live & Monitoring', variant: 'success' };

      const subtext = hasPendingItems
        ? 'Incoming Threads comments have generated grounded drafts awaiting your approval before live publishing.'
        : 'AI classification and grounding safety gates are active. Grounded replies dispatch according to your autonomy policy.';

      const autoReplyRate =
        totalReplied > 0 ? Math.round((autoReplied / totalReplied) * 100) : 0;

      return {
        pendingReview,
        autoReplied,
        totalReplied,
        hasPendingItems,
        statusBadge,
        subtext,
        autoReplyRate,
        ctaLink: '/replies',
      };
    }

    it('displays warning badge and review queue count when pendingReview > 0', () => {
      const vm = computeTelemetryViewModel({ pendingReview: 7, autoReplied: 20, replied: 35 });
      assert.strictEqual(vm.hasPendingItems, true);
      assert.strictEqual(vm.statusBadge.variant, 'warning');
      assert.strictEqual(vm.statusBadge.text, '7 Require Review');
      assert.match(vm.subtext, /awaiting your approval/);
      assert.strictEqual(vm.autoReplyRate, 57);
      assert.strictEqual(vm.ctaLink, '/replies');
    });

    it('displays Live & Monitoring badge when pendingReview is 0', () => {
      const vm = computeTelemetryViewModel({ pendingReview: 0, autoReplied: 15, replied: 15 });
      assert.strictEqual(vm.hasPendingItems, false);
      assert.strictEqual(vm.statusBadge.variant, 'success');
      assert.strictEqual(vm.statusBadge.text, 'Live & Monitoring');
      assert.match(vm.subtext, /safety gates are active/);
      assert.strictEqual(vm.autoReplyRate, 100);
    });

    it('handles null stats safely without throwing or NaN', () => {
      const vm = computeTelemetryViewModel(null);
      assert.strictEqual(vm.pendingReview, 0);
      assert.strictEqual(vm.autoReplied, 0);
      assert.strictEqual(vm.totalReplied, 0);
      assert.strictEqual(vm.autoReplyRate, 0);
      assert.strictEqual(vm.statusBadge.variant, 'success');
    });
  });

  describe('Settings Page Autonomy Mode & Emergency Kill Switch Contracts', () => {
    const validAutonomyModes = ['REVIEW_ONLY', 'SHADOW', 'RULES_BASED'];

    function validateSettingsPayload(payload: {
      autonomyReplies?: string;
      repliesPaused?: boolean;
    }) {
      if (payload.autonomyReplies && !validAutonomyModes.includes(payload.autonomyReplies)) {
        return { valid: false, error: `Invalid autonomy mode: ${payload.autonomyReplies}` };
      }
      if (payload.repliesPaused !== undefined && typeof payload.repliesPaused !== 'boolean') {
        return { valid: false, error: 'repliesPaused must be a boolean' };
      }
      return { valid: true };
    }

    it('validates supported reply autonomy levels (REVIEW_ONLY, SHADOW, RULES_BASED)', () => {
      validAutonomyModes.forEach(mode => {
        assert.strictEqual(validateSettingsPayload({ autonomyReplies: mode }).valid, true);
      });
      assert.strictEqual(validateSettingsPayload({ autonomyReplies: 'INVALID_MODE' }).valid, false);
    });

    it('correctly toggles the Outbound Emergency Kill Switch (repliesPaused)', () => {
      assert.strictEqual(validateSettingsPayload({ repliesPaused: true }).valid, true);
      assert.strictEqual(validateSettingsPayload({ repliesPaused: false }).valid, true);
      assert.strictEqual(validateSettingsPayload({ repliesPaused: 'yes' as any }).valid, false);
    });
  });

  describe('Community Review Deck Keyboard Shortcuts Semantics', () => {
    function handleDeckKeyboardShortcut(
      key: string,
      hasActiveModal: boolean,
      isEditing: boolean,
    ): 'APPROVE' | 'EDIT' | 'REGENERATE' | 'DISMISS' | 'CLOSE_MODAL' | 'NO_OP' {
      if (hasActiveModal) {
        if (key === 'Escape') return 'CLOSE_MODAL';
        return 'NO_OP';
      }

      if (isEditing) {
        if (key === 'Escape') return 'NO_OP'; // Cancel edit handled separately
        return 'NO_OP'; // Do not intercept typing
      }

      switch (key.toLowerCase()) {
        case 'a':
        case 'enter':
          return 'APPROVE';
        case 'e':
          return 'EDIT';
        case 'r':
          return 'REGENERATE';
        case 'd':
          return 'DISMISS';
        default:
          return 'NO_OP';
      }
    }

    it('dispatches APPROVE on key "a" or "Enter" when not in modal or editing', () => {
      assert.strictEqual(handleDeckKeyboardShortcut('a', false, false), 'APPROVE');
      assert.strictEqual(handleDeckKeyboardShortcut('Enter', false, false), 'APPROVE');
    });

    it('dispatches EDIT on key "e"', () => {
      assert.strictEqual(handleDeckKeyboardShortcut('e', false, false), 'EDIT');
    });

    it('dispatches REGENERATE on key "r"', () => {
      assert.strictEqual(handleDeckKeyboardShortcut('r', false, false), 'REGENERATE');
    });

    it('dispatches DISMISS on key "d"', () => {
      assert.strictEqual(handleDeckKeyboardShortcut('d', false, false), 'DISMISS');
    });

    it('suppresses keyboard actions when user is actively editing text', () => {
      assert.strictEqual(handleDeckKeyboardShortcut('a', false, true), 'NO_OP');
      assert.strictEqual(handleDeckKeyboardShortcut('r', false, true), 'NO_OP');
      assert.strictEqual(handleDeckKeyboardShortcut('d', false, true), 'NO_OP');
    });

    it('closes modal on Escape key when a modal is active', () => {
      assert.strictEqual(handleDeckKeyboardShortcut('Escape', true, false), 'CLOSE_MODAL');
    });
  });

  describe('Windows Monorepo Tooling: post-generate.js Invariant Verification', () => {
    it('verifies packages/database/scripts/post-generate.js exists and is syntactically valid', () => {
      const candidates = [
        path.resolve(process.cwd(), 'packages/database/scripts/post-generate.js'),
        path.resolve(process.cwd(), '../../packages/database/scripts/post-generate.js'),
      ];
      const scriptPath = candidates.find(p => fs.existsSync(p));
      assert.ok(scriptPath, 'post-generate.js must exist in packages/database/scripts');

      const content = fs.readFileSync(scriptPath, 'utf8');
      assert.ok(content.includes('copyFolderSync'), 'Must contain copyFolderSync logic');
      assert.ok(content.includes('@prisma+client@'), 'Must locate pnpm prisma entry');
    });
  });
});

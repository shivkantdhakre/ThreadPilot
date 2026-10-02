import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ObservationStatus } from '@threadpilot/database';
import {
  validateObservationTransition,
  InvalidObservationTransitionError,
} from '../dist/services/observation-fsm.service.js';
import { computeDerivedRates } from '../dist/processors/analytics-sync.processor.js';

describe('Observation FSM & Strict Null-Safety Invariant Tests', () => {
  describe('Observation FSM State Transitions', () => {
    it('permits valid transitions from SCHEDULED', () => {
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.SCHEDULED, ObservationStatus.PROCESSING),
      );
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.SCHEDULED, ObservationStatus.MISSED),
      );
    });

    it('permits valid transitions from PROCESSING', () => {
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.CAPTURED),
      );
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.FAILED),
      );
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.RATE_LIMITED),
      );
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.MISSED),
      );
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.DELETED),
      );
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.PROCESSING, ObservationStatus.UNAVAILABLE),
      );
    });

    it('permits valid transitions from FAILED and RATE_LIMITED retries', () => {
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.FAILED, ObservationStatus.PROCESSING),
      );
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.FAILED, ObservationStatus.MISSED),
      );
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.RATE_LIMITED, ObservationStatus.PROCESSING),
      );
      assert.doesNotThrow(() =>
        validateObservationTransition(ObservationStatus.RATE_LIMITED, ObservationStatus.MISSED),
      );
    });

    it('rejects illegal transitions with InvalidObservationTransitionError', () => {
      // Skipping PROCESSING directly to CAPTURED
      assert.throws(
        () => validateObservationTransition(ObservationStatus.SCHEDULED, ObservationStatus.CAPTURED),
        InvalidObservationTransitionError,
      );

      // Terminal state transitions are strictly forbidden
      assert.throws(
        () => validateObservationTransition(ObservationStatus.CAPTURED, ObservationStatus.PROCESSING),
        InvalidObservationTransitionError,
      );
      assert.throws(
        () => validateObservationTransition(ObservationStatus.MISSED, ObservationStatus.PROCESSING),
        InvalidObservationTransitionError,
      );
      assert.throws(
        () => validateObservationTransition(ObservationStatus.DELETED, ObservationStatus.SCHEDULED),
        InvalidObservationTransitionError,
      );
      assert.throws(
        () => validateObservationTransition(ObservationStatus.UNAVAILABLE, ObservationStatus.SCHEDULED),
        InvalidObservationTransitionError,
      );
    });
  });

  describe('Invariant 11: Strict NULL Safety for Derived Rates', () => {
    it('computes derived rates correctly when all raw values are present', () => {
      const rates = computeDerivedRates(
        {
          views: 1000,
          likes: 50,
          replies: 10,
          reposts: 5,
          quotes: 2,
        },
        500,
      );

      // (50 + 10 + 5) / 1000 * 100 = 6.5%
      assert.equal(rates.engagementRateByViews, 6.5);
      // (50 + 10 + 5) / 500 * 100 = 13.0%
      assert.equal(rates.engagementRateByFollowers, 13.0);
      // 10 / 1000 * 100 = 1.0%
      assert.equal(rates.replyRate, 1.0);
      // 50 / 1000 * 100 = 5.0%
      assert.equal(rates.likeRate, 5.0);
      // 5 / 1000 * 100 = 0.5%
      assert.equal(rates.repostRate, 0.5);
      // 2 / 1000 * 100 = 0.2%
      assert.equal(rates.quoteRate, 0.2);
    });

    it('preserves NULL when views is null (no coercion to 0%)', () => {
      const rates = computeDerivedRates(
        {
          views: null,
          likes: 50,
          replies: 10,
          reposts: 5,
          quotes: 2,
        },
        500,
      );

      assert.equal(rates.engagementRateByViews, null, 'Must be null if views is null');
      assert.equal(rates.replyRate, null);
      assert.equal(rates.likeRate, null);
      assert.equal(rates.repostRate, null);
      assert.equal(rates.quoteRate, null);
      // follower rate should still compute since likes, replies, reposts and followers exist
      assert.equal(rates.engagementRateByFollowers, 13.0);
    });

    it('returns null when views is 0 to prevent division by zero', () => {
      const rates = computeDerivedRates(
        {
          views: 0,
          likes: 0,
          replies: 0,
          reposts: 0,
          quotes: 0,
        },
        100,
      );

      assert.equal(rates.engagementRateByViews, null);
      assert.equal(rates.replyRate, null);
      assert.equal(rates.likeRate, null);
    });

    it('preserves NULL when followerCount is null or 0', () => {
      const ratesNullFollowers = computeDerivedRates(
        { views: 100, likes: 5, replies: 1, reposts: 0, quotes: 0 },
        null,
      );
      assert.equal(ratesNullFollowers.engagementRateByFollowers, null);

      const ratesZeroFollowers = computeDerivedRates(
        { views: 100, likes: 5, replies: 1, reposts: 0, quotes: 0 },
        0,
      );
      assert.equal(ratesZeroFollowers.engagementRateByFollowers, null);
    });

    it('preserves NULL when any engagement component is null', () => {
      const rates = computeDerivedRates(
        {
          views: 500,
          likes: 10,
          replies: null, // missing replies
          reposts: 2,
          quotes: 0,
        },
        1000,
      );

      assert.equal(rates.engagementRateByViews, null, 'Cannot sum when replies is null');
      assert.equal(rates.engagementRateByFollowers, null);
      assert.equal(rates.likeRate, 2.0, 'likeRate can still compute independently');
      assert.equal(rates.replyRate, null);
    });
  });
});

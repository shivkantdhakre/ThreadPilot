import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AggregationDimension,
  AggregationGranularity,
  EvidenceGrade,
  ObservationSlot,
} from '@threadpilot/database';
import {
  welchTTest,
  safeCohensD,
  safePercentDelta,
  applyBenjaminiHochberg,
  deriveEvidenceGrade,
  buildHypothesisFamilyKey,
  hashToInt64,
} from '../dist/services/statistical-evidence.service.js';

describe('StatisticalEvidenceService Unit & Algorithmic Tests', () => {
  describe('Advisory Lock 64-bit Integer Hashing', () => {
    it('generates deterministic 64-bit signed BigInt for PostgreSQL advisory locks', () => {
      const key1 = 'ws-1:account-1:PUBLISH_HOUR_UTC:2026-10-01';
      const hash1 = hashToInt64(key1);
      const hash2 = hashToInt64(key1);

      assert.equal(typeof hash1, 'bigint');
      assert.equal(hash1, hash2, 'Hash must be strictly deterministic');

      // Verify signed 64-bit bounds (-2^63 to 2^63 - 1)
      const minInt64 = BigInt('-9223372036854775808');
      const maxInt64 = BigInt('9223372036854775807');
      assert.ok(hash1 >= minInt64 && hash1 <= maxInt64, 'Hash must be within valid PostgreSQL bigint range');
    });

    it('generates distinct hashes for distinct hypothesis keys', () => {
      const hashA = hashToInt64('family-A');
      const hashB = hashToInt64('family-B');
      assert.notEqual(hashA, hashB);
    });

    it('builds canonical hypothesis family key formatted correctly', () => {
      const bucketDate = new Date('2026-10-01T00:00:00.000Z');
      const key = buildHypothesisFamilyKey({
        socialAccountId: 'acc-123',
        observationSlot: ObservationSlot.T_24H,
        dimension: AggregationDimension.PUBLISH_HOUR_UTC,
        granularity: AggregationGranularity.DAILY,
        bucketDate,
      });

      assert.ok(key.includes('acc-123'));
      assert.ok(key.includes('T_24H'));
      assert.ok(key.includes('PUBLISH_HOUR_UTC'));
      assert.ok(key.includes('DAILY'));
      assert.ok(key.includes('2026-10-01'));
    });
  });

  describe("Welch's t-test Calculation", () => {
    it("computes accurate Welch's t-test with unequal sample sizes and variances", () => {
      // Group 1: mean1 = 15.0, stdDev1 = 2.0, n1 = 30
      // Group 2: mean2 = 10.0, stdDev2 = 3.0, n2 = 100
      const result = welchTTest(15.0, 2.0, 30, 10.0, 3.0, 100);

      assert.ok(result.tStat !== null && result.tStat > 0, 't-statistic must be positive');
      assert.ok(result.df !== null && result.df > 25, 'df must be computed via Welch-Satterthwaite');
      assert.ok(result.pValue !== null && result.pValue < 0.001, 'p-value should be strongly significant');
      assert.ok(result.ci95Lower !== null && result.ci95Lower > 0, '95% CI lower bound must exceed 0');
      assert.ok(result.ci95Upper !== null && result.ci95Upper > result.ci95Lower);
    });

    it('handles degenerate sample size (< 2) safely without throwing', () => {
      const result = welchTTest(10.0, 2.0, 1, 10.0, 2.0, 10);
      assert.equal(result.tStat, null);
      assert.equal(result.pValue, null);
      assert.equal(result.df, null);
    });

    it('handles zero or degenerate variance safely', () => {
      const result = welchTTest(10.0, 0.0, 20, 10.0, 0.0, 20);
      assert.equal(result.tStat, null);
      assert.equal(result.pValue, null);
    });

    it('returns symmetric t-statistic when means are swapped', () => {
      const res1 = welchTTest(20.0, 3.0, 25, 15.0, 2.5, 30);
      const res2 = welchTTest(15.0, 2.5, 30, 20.0, 3.0, 25);

      assert.ok(res1.tStat !== null && res2.tStat !== null);
      assert.ok(Math.abs(res1.tStat + res2.tStat) < 1e-4, 't-statistic signs must invert');
      assert.ok(Math.abs((res1.pValue ?? 0) - (res2.pValue ?? 0)) < 1e-4, 'Two-tailed p-values must be identical');
    });
  });

  describe("Cohen's d Effect Size & Percentage Delta", () => {
    it("computes correct Cohen's d effect size", () => {
      // Large effect: diff = 5, pooled sd ~ 2.5 => d ~ 2.0
      const d = safeCohensD(15.0, 2.0, 30, 10.0, 3.0, 30);
      assert.ok(d !== null);
      assert.ok(d > 1.8 && d < 2.2, `Expected d ~ 2.0, got ${d}`);
    });

    it('returns null when sample size is insufficient (< 2)', () => {
      assert.equal(safeCohensD(10, 2, 1, 8, 2, 20), null);
      assert.equal(safeCohensD(10, 2, 20, 8, 2, 1), null);
    });

    it('returns null when pooled variance is zero', () => {
      assert.equal(safeCohensD(5, 0, 10, 5, 0, 10), null);
    });

    it('computes percentage delta accurately', () => {
      assert.equal(safePercentDelta(3.0, 2.0), 50.0);
      assert.equal(safePercentDelta(1.0, 2.0), -50.0);
      assert.equal(safePercentDelta(null, 2.0), null);
    });
  });

  describe('Benjamini-Hochberg (BH-FDR) Multiple-Testing Correction', () => {
    it('executes monotonic step-up procedure accurately across candidate family', () => {
      const candidates = [
        { candidateId: 'c1', dimensionValue: 'val-1', pValue: 0.005, hasRealPValue: true },
        { candidateId: 'c2', dimensionValue: 'val-2', pValue: 0.012, hasRealPValue: true },
        { candidateId: 'c3', dimensionValue: 'val-3', pValue: 0.040, hasRealPValue: true },
        { candidateId: 'c4', dimensionValue: 'val-4', pValue: 0.350, hasRealPValue: true },
      ];

      const resultMap = applyBenjaminiHochberg(candidates, 0.05);

      assert.equal(resultMap.size, 4);

      const c1 = resultMap.get('c1')!;
      const c2 = resultMap.get('c2')!;
      const c4 = resultMap.get('c4')!;

      // Candidate 1 (p=0.005, critical=(1/4)*0.05=0.0125) => PASS
      assert.equal(c1.passesFDR, true);

      // Candidate 2 (p=0.012, critical=(2/4)*0.05=0.025) => PASS
      assert.equal(c2.passesFDR, true);

      // Candidate 4 (p=0.35, critical=0.05) => FAIL
      assert.equal(c4.passesFDR, false);

      // Verify adjusted q-values are monotonic across sorted ranks
      const sortedResults = Array.from(resultMap.values()).sort((a, b) => a.rank - b.rank);
      for (let i = 0; i < sortedResults.length - 1; i++) {
        assert.ok(
          sortedResults[i]!.qValue <= sortedResults[i + 1]!.qValue + 1e-6,
          `Monotonicity violation at index ${i}: ${sortedResults[i]!.qValue} > ${sortedResults[i + 1]!.qValue}`,
        );
      }
    });

    it('includes statistically undefined candidates (|U| = m) in family denominator', () => {
      // 2 candidates with p-values, 2 undefined (sample size < 2)
      const candidates = [
        { candidateId: 'c1', dimensionValue: 'val-1', pValue: 0.01, hasRealPValue: true },
        { candidateId: 'c2', dimensionValue: 'val-2', pValue: 0.02, hasRealPValue: true },
        { candidateId: 'u1', dimensionValue: 'undef-1', pValue: 1.0, hasRealPValue: false },
        { candidateId: 'u2', dimensionValue: 'undef-2', pValue: 1.0, hasRealPValue: false },
      ];

      const resultMap = applyBenjaminiHochberg(candidates, 0.05);

      // Denominator m must be 4, NOT 2!
      assert.equal(resultMap.size, 4);
      const c1 = resultMap.get('c1')!;
      assert.ok(c1);
      // Critical value for rank 1 with m=4 is (1/4) * 0.05 = 0.0125
      assert.ok(Math.abs(c1.criticalValue - 0.0125) < 1e-4);

      // Undefined candidates must never pass FDR
      const u1 = resultMap.get('u1')!;
      const u2 = resultMap.get('u2')!;
      assert.equal(u1.passesFDR, false);
      assert.equal(u2.passesFDR, false);
    });
  });

  describe('Evidence Grading Hierarchy (HIGH_SIGNAL, DIRECTIONAL, LOW_SIGNAL, INSUFFICIENT_DATA)', () => {
    it('assigns HIGH_SIGNAL when all robust criteria are satisfied AND passesFDR is true', () => {
      const grade = deriveEvidenceGrade({
        sampleSize: 10,
        complementSize: 20,
        cohensD: 0.65,
        pValue: 0.01,
        ci95Lower: 0.5,
        ci95Upper: 3.5,
        passesFDR: true,
      });

      assert.equal(grade, EvidenceGrade.HIGH_SIGNAL);
    });

    it('caps grade at DIRECTIONAL if candidate meets robust criteria but fails FDR (Invariant 22)', () => {
      const grade = deriveEvidenceGrade({
        sampleSize: 10,
        complementSize: 20,
        cohensD: 0.65,
        pValue: 0.01,
        ci95Lower: 0.5,
        ci95Upper: 3.5,
        passesFDR: false, // Fails FDR!
      });

      assert.equal(grade, EvidenceGrade.DIRECTIONAL);
    });

    it('assigns LOW_SIGNAL when sample sizes meet minimal threshold without effect strength', () => {
      const grade = deriveEvidenceGrade({
        sampleSize: 4,
        complementSize: 5,
        cohensD: 0.05,
        pValue: 0.40,
        ci95Lower: -1.0,
        ci95Upper: 1.0,
        passesFDR: false,
      });

      assert.equal(grade, EvidenceGrade.LOW_SIGNAL);
    });

    it('assigns INSUFFICIENT_DATA when sampleSize < 3 or complementSize < 3 or stats are null', () => {
      const gradeSmall = deriveEvidenceGrade({
        sampleSize: 2,
        complementSize: 10,
        cohensD: 0.8,
        pValue: 0.01,
        ci95Lower: null,
        ci95Upper: null,
        passesFDR: false,
      });
      assert.equal(gradeSmall, EvidenceGrade.INSUFFICIENT_DATA);

      const gradeNullD = deriveEvidenceGrade({
        sampleSize: 10,
        complementSize: 10,
        cohensD: null,
        pValue: 0.01,
        ci95Lower: 0.1,
        ci95Upper: 2.0,
        passesFDR: true,
      });
      assert.equal(gradeNullD, EvidenceGrade.INSUFFICIENT_DATA);
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DUPLICATE_POLICY, type DuplicatePolicy } from '../dist/index.js';

// Load genuine Gemini Embedding 2 calibration benchmark fixture
function loadCalibrationData() {
  const fixturePath = path.resolve('test/fixtures/gemini-embedding-2-calibration.json');
  if (!fs.existsSync(fixturePath)) {
    // Fallback relative path for workspace root execution
    const altPath = path.resolve('packages/agents/test/fixtures/gemini-embedding-2-calibration.json');
    return JSON.parse(fs.readFileSync(altPath, 'utf8'));
  }
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

describe('Duplicate Detection Threshold Calibration (Gemini Embedding 2)', () => {
  const calibration = loadCalibrationData();

  it('validates calibration metadata provenance and model alignment', () => {
    assert.strictEqual(calibration.embeddingModel, 'gemini-embedding-2');
    assert.strictEqual(calibration.embeddingDimensions, 768);
    assert.strictEqual(calibration.embeddingPipelineVersion, 'v2');
    assert.strictEqual(calibration.taskType, 'SIMILARITY');
    assert.strictEqual(calibration.datasetSize.totalPairs, 60);

    // Verify DEFAULT_DUPLICATE_POLICY aligns with calibration evidence
    assert.strictEqual(DEFAULT_DUPLICATE_POLICY.embeddingModel, 'gemini-embedding-2');
    assert.strictEqual(DEFAULT_DUPLICATE_POLICY.embeddingPipelineVersion, 'v2');
    assert.strictEqual(DEFAULT_DUPLICATE_POLICY.threshold, 0.88);
  });

  it('demonstrates that synthetic threshold 0.82 produces false positives in real Gemini vector space', () => {
    const sweepAt82 = calibration.sweep.find((s: any) => s.threshold === 0.82);
    assert(sweepAt82 !== undefined, 'Expected sweep data at 0.82');

    // Evidence: In real Gemini Embedding 2, Related-But-Distinct posts reach up to 0.8653 similarity.
    // Therefore, threshold 0.82 falsely flags distinct posts as duplicates.
    assert(sweepAt82.fp > 0, `Threshold 0.82 produces ${sweepAt82.fp} false positives on distinct topics`);
    assert.strictEqual(sweepAt82.fpRelated, 7, 'Threshold 0.82 produces 7 false positives on same-topic distinct posts');
    assert(sweepAt82.precision < 0.80, `Precision at 0.82 is degraded (${sweepAt82.precision})`);
  });

  it('validates that calibrated threshold 0.88 achieves zero false positives and 100% recall', () => {
    const sweepAt88 = calibration.sweep.find((s: any) => s.threshold === 0.88);
    assert(sweepAt88 !== undefined, 'Expected sweep data at 0.88');

    // Precision & Recall at calibrated 0.88
    assert.strictEqual(sweepAt88.fp, 0, 'Calibrated threshold 0.88 must produce zero false positives');
    assert.strictEqual(sweepAt88.fpRelated, 0, 'Zero false positives on related-but-distinct posts');
    assert.strictEqual(sweepAt88.fpUnrelated, 0, 'Zero false positives on unrelated posts');
    assert.strictEqual(sweepAt88.fn, 0, 'Zero false negatives on true duplicates');
    assert.strictEqual(sweepAt88.recall, 1.0, 'Recall is 100% at threshold 0.88');
    assert.strictEqual(sweepAt88.precision, 1.0, 'Precision is 100% at threshold 0.88');
    assert.strictEqual(sweepAt88.f1, 1.0, 'F1 score is 1.0 at threshold 0.88');

    // Verify clear separation gap between distributions
    const minDupe = Math.min(...calibration.scores.trueDuplicates.map((s: any) => s.similarity));
    const maxRelated = Math.max(...calibration.scores.relatedDistinct.map((s: any) => s.similarity));
    assert(minDupe > maxRelated, `Separation gap expected: minDupe (${minDupe.toFixed(4)}) > maxRelated (${maxRelated.toFixed(4)})`);
    assert(DEFAULT_DUPLICATE_POLICY.threshold > maxRelated, 'Threshold must exceed max related-but-distinct score');
    assert(DEFAULT_DUPLICATE_POLICY.threshold < minDupe, 'Threshold must sit below min true-duplicate score');
  });

  it('verifies product duplicate behavior on canonical domain pairs', () => {
    // 1. Paraphrased near-duplicate: must exceed threshold (detected as duplicate)
    const dupePair = calibration.scores.trueDuplicates.find(
      (p: any) => p.a.includes('PostgreSQL + pgvector is all the vector database you need'),
    );
    assert(dupePair !== undefined);
    assert(
      dupePair.similarity >= DEFAULT_DUPLICATE_POLICY.threshold,
      `Duplicate pair similarity (${dupePair.similarity.toFixed(4)}) must be >= threshold (${DEFAULT_DUPLICATE_POLICY.threshold})`,
    );

    // 2. Same-topic but contrasting claim: must remain below threshold (NOT duplicate)
    const distinctPair = calibration.scores.relatedDistinct.find(
      (p: any) => p.a.includes('PostgreSQL + pgvector is great for simple semantic search'),
    );
    assert(distinctPair !== undefined);
    assert(
      distinctPair.similarity < DEFAULT_DUPLICATE_POLICY.threshold,
      `Distinct pair similarity (${distinctPair.similarity.toFixed(4)}) must be < threshold (${DEFAULT_DUPLICATE_POLICY.threshold})`,
    );
  });
});


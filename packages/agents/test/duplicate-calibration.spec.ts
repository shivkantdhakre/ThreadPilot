import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * Cosine similarity helper function for testing embedding vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Synthetic embedding generator based on semantic token overlap + noise,
 * producing 768-dimensional normalized vectors mimicking gemini-embedding-2.
 */
function generateMockEmbedding(tokens: string[], dimension = 768): number[] {
  const vec = new Array(dimension).fill(0);
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash << 5) - hash + token.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dimension;
    vec[idx] += 1.0;
  }
  // Normalize vector
  let norm = 0;
  for (let i = 0; i < dimension; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

describe('Duplicate Detection Threshold Calibration Benchmark', () => {
  // 1. True Duplicates (near identical content, minor phrasing tweaks)
  const trueDuplicates: Array<[string, string]> = [
    ['Building in public changed my engineering career completely.', 'Building in public has changed my entire engineering career.'],
    ['Stop using console.log for production debugging in Node.js.', 'Stop using console.log for production Node.js debugging.'],
    ['PostgreSQL + pgvector is all the vector database you need.', 'PostgreSQL + pgvector is honestly all the vector DB you will need.'],
    ['The biggest mistake junior engineers make is avoiding documentation.', 'The biggest mistake early engineers make is avoiding documentation.'],
    ['AI will not replace engineers, but engineers who use AI will replace those who do not.', 'AI won’t replace engineers, but engineers using AI will replace those who don’t.'],
  ];

  // 2. Related-But-Distinct (same topic/domain, but completely different claims)
  const relatedDistinct: Array<[string, string]> = [
    ['PostgreSQL + pgvector is great for simple semantic search.', 'MongoDB Atlas vector search has improved latency under high concurrent writes.'],
    ['Building in public creates high accountability for solo founders.', 'Private stealth development allows teams to iterate without premature customer scrutiny.'],
    ['Why we decided to migrate our backend from Node.js to Go.', 'Why our team chose TypeScript and NestJS for rapid enterprise iteration.'],
    ['Junior engineers should focus on foundational algorithms before frameworks.', 'Junior engineers accelerate their careers by shipping full-stack production features early.'],
    ['Automating social media posting saves founders 10 hours every week.', 'Direct authentic community engagement cannot be delegated to automation.'],
  ];

  // 3. Completely Unrelated Posts
  const completelyUnrelated: Array<[string, string]> = [
    ['Why we decided to migrate our backend from Node.js to Go.', 'The secret to brewing perfect pour-over Ethiopian coffee at home.'],
    ['PostgreSQL + pgvector is all the vector database you need.', 'Morning running routines improved my cardiovascular endurance by 20%.'],
    ['Building in public changed my engineering career completely.', 'Best budget mechanical keyboards under $100 in 2026.'],
    ['AI agent evaluation requires deterministic validation gates.', 'Hiking in the Dolomites during autumn is a breathtaking experience.'],
    ['The new Threads API publishing limit endpoint provides live quota states.', 'How to prune bonsai ficus trees during early spring dormancy.'],
  ];

  it('measures precision and recall across cosine thresholds [0.80, 0.85, 0.90, 0.95]', () => {
    const thresholds = [0.80, 0.85, 0.90, 0.95];

    // Compute pairwise similarities
    const dupeSims = trueDuplicates.map(([a, b]) => {
      const vA = generateMockEmbedding(a.toLowerCase().split(/\s+/));
      const vB = generateMockEmbedding(b.toLowerCase().split(/\s+/));
      return cosineSimilarity(vA, vB);
    });

    const relatedSims = relatedDistinct.map(([a, b]) => {
      const vA = generateMockEmbedding(a.toLowerCase().split(/\s+/));
      const vB = generateMockEmbedding(b.toLowerCase().split(/\s+/));
      return cosineSimilarity(vA, vB);
    });

    const unrelatedSims = completelyUnrelated.map(([a, b]) => {
      const vA = generateMockEmbedding(a.toLowerCase().split(/\s+/));
      const vB = generateMockEmbedding(b.toLowerCase().split(/\s+/));
      return cosineSimilarity(vA, vB);
    });

    const results = thresholds.map((thresh) => {
      const truePositives = dupeSims.filter((s) => s >= thresh).length;
      const falseNegatives = dupeSims.filter((s) => s < thresh).length;
      const falsePositives =
        relatedSims.filter((s) => s >= thresh).length +
        unrelatedSims.filter((s) => s >= thresh).length;
      const trueNegatives =
        relatedSims.filter((s) => s < thresh).length +
        unrelatedSims.filter((s) => s < thresh).length;

      const precision =
        truePositives + falsePositives > 0
          ? truePositives / (truePositives + falsePositives)
          : 1.0;
      const recall =
        truePositives + falseNegatives > 0
          ? truePositives / (truePositives + falseNegatives)
          : 0.0;
      const f1 =
        precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

      return { threshold: thresh, precision, recall, f1, truePositives, falsePositives };
    });

    // Verification assertion: 0.90 threshold provides high precision without excessive false positives on distinct topics
    const at90 = results.find((r) => r.threshold === 0.90);
    assert(at90 !== undefined);
    assert.strictEqual(at90.falsePositives, 0, 'Threshold 0.90 must produce zero false positives on distinct posts');
  });
});

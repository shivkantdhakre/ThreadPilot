/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert';

// ── Shared mock factories ─────────────────────────────────────────────────────

type MemoryItem = { memoryItemId: string; content: string };
type SemanticItem = MemoryItem & { similarity: number };

function makeMemoryRepo({
  exactResults = [] as MemoryItem[],
  semanticResults = [] as SemanticItem[],
} = {}) {
  return {
    findByExactTerms: async () => exactResults,
    findSimilar: async (_workspaceId: string, _embedding: number[], options?: { taskType?: string }) => {
      // Only return retrieval fixtures for DOCUMENT queries; SIMILARITY duplicate checks return [].
      if (options?.taskType === 'SIMILARITY') return [];
      return semanticResults;
    },
    findSimilarStyleExamples: async () => [],
  };
}

function makeAiProvider() {
  const completeCalls: string[] = [];
  return {
    modelName: 'gemini-embedding-2',
    completeCalls,
    embed: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
    complete: async ({ outputSchema }: any) => {
      const shape = outputSchema?.shape ?? {};
      if ('body' in shape) {
        completeCalls.push('draft');
        return {
          result: outputSchema.parse({
            body: 'Draft body text that fits within limit.',
            hook: 'Hook line here',
            cta: undefined,
            characterCount: 38,
          }),
        };
      }
      if ('matchedFeatures' in shape) {
        completeCalls.push('styleEval');
        return {
          result: outputSchema.parse({
            score: 0.9,
            matchedFeatures: ['tone'],
            unmatchedFeatures: [],
            feedback: [],
          }),
        };
      }
      if ('overallQuality' in shape) {
        completeCalls.push('qualityEval');
        return {
          result: outputSchema.parse({
            hookStrength: 0.85,
            clarity: 0.9,
            readability: 0.9,
            originality: 0.85,
            overallQuality: 0.88,
            suggestions: [],
          }),
        };
      }
      if ('riskLevel' in shape) {
        completeCalls.push('riskEval');
        return {
          result: outputSchema.parse({
            riskLevel: 'LOW',
            flags: [],
            requiresApproval: false,
            reasoning: 'Safe content',
          }),
        };
      }
      throw new Error('Unexpected outputSchema in test mock');
    },
  };
}

function makeDb() {
  return {
    userProfile: { findUnique: async () => null },
    contentDraft: { create: async () => ({}) },
    styleExample: { findMany: async () => [] },
  } as any;
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'ws-test',
    topic: 'test topic',
    format: 'post',
    tone: null,
    additionalContext: null,
    researchSources: [],
    retrievedMemoryIds: [],
    retrievedMemoryTexts: [],
    retrievedExampleIds: [],
    retrievedExampleTexts: [],
    retrievalSnapshotHash: '',
    draft: null,
    validation: null,
    dupeCheck: null,
    styleEval: null,
    qualityEval: null,
    riskEval: null,
    finalDraft: null,
    error: null,
    status: 'running' as const,
    styleProfile: null,
    profileVersion: 1,
    promptVersion: '',
    ...overrides,
  };
}

// Lazy import so the dist must be built before running tests.
async function buildGraph(deps: { memoryRepo: any; aiProvider: any; db: any }) {
  const { createContentGraph } = await import('../dist/content/content.graph.js');
  return createContentGraph({
    db: deps.db,
    aiProvider: deps.aiProvider,
    memoryRepo: deps.memoryRepo,
  });
}

// ── AC 1: a lower-scoring exact match gets selected over a higher semantic one ─

describe('retrieveMemories — AC1: exact match wins over higher-similarity semantic match', () => {
  it('places exact-match item before semantic-only item in retrievedMemoryIds', async () => {
    const exactItem    = { memoryItemId: 'exact-1',    content: 'Nike Air Max launch post' };
    const semanticItem = { memoryItemId: 'semantic-1', content: 'Generic running shoes post', similarity: 0.95 };

    const graph = await buildGraph({
      memoryRepo: makeMemoryRepo({ exactResults: [exactItem], semanticResults: [semanticItem] }),
      aiProvider: makeAiProvider(),
      db: makeDb(),
    });

    const result = await graph.invoke(baseState({ topic: '"Nike Air Max" campaign' }));

    const ids: string[] = result.retrievedMemoryIds;
    assert(ids.includes('exact-1'),    'exact-1 must appear in results');
    assert(ids.includes('semantic-1'), 'semantic-1 must appear in results');
    assert(
      ids.indexOf('exact-1') < ids.indexOf('semantic-1'),
      `exact-1 (index ${ids.indexOf('exact-1')}) must come before semantic-1 (index ${ids.indexOf('semantic-1')})`,
    );
  });
});

// ── AC 2: no duplicates when exact and semantic return the same item ───────────

describe('retrieveMemories — AC2: no duplicate IDs in merged results', () => {
  it('emits each memory ID at most once even if both searches return it', async () => {
    const sharedItem = { memoryItemId: 'shared-1', content: 'Shared content about React Native' };

    const graph = await buildGraph({
      memoryRepo: makeMemoryRepo({
        exactResults:    [sharedItem],
        semanticResults: [{ ...sharedItem, similarity: 0.90 }],
      }),
      aiProvider: makeAiProvider(),
      db: makeDb(),
    });

    const result = await graph.invoke(baseState({ topic: '"React Native" tutorial' }));

    const ids: string[] = result.retrievedMemoryIds;
    const unique = new Set(ids);
    assert.strictEqual(
      unique.size,
      ids.length,
      `duplicate IDs found in [${ids}]`,
    );
    assert(ids.includes('shared-1'), 'shared-1 must still appear once');
  });

  it('deduplicates when multiple exact terms match the same item', async () => {
    const item = { memoryItemId: 'multi-match', content: 'Nike Air Max launch campaign' };

    const graph = await buildGraph({
      memoryRepo: makeMemoryRepo({
        // Both "Nike" and "Air Max" terms match the same item — repo may return it twice
        exactResults: [item, item],
        semanticResults: [],
      }),
      aiProvider: makeAiProvider(),
      db: makeDb(),
    });

    const result = await graph.invoke(baseState({ topic: '"Nike Air Max" launch' }));

    const ids: string[] = result.retrievedMemoryIds;
    assert.strictEqual(ids.filter((id) => id === 'multi-match').length, 1, 'multi-match must appear exactly once');
  });
});

// ── AC 3: semantic-only searches still work when no exact terms extracted ─────

describe('retrieveMemories — AC3: semantic-only path works with plain prose topic', () => {
  it('returns semantic results when extractExactTerms produces no terms', async () => {
    const semanticItem = { memoryItemId: 'sem-only', content: 'generic productivity post', similarity: 0.75 };

    const graph = await buildGraph({
      memoryRepo: makeMemoryRepo({
        exactResults:    [],   // findByExactTerms returns [] for empty terms (no DB call)
        semanticResults: [semanticItem],
      }),
      aiProvider: makeAiProvider(),
      db: makeDb(),
    });

    // All-lowercase prose → extractExactTerms returns [] → exact path is a no-op
    const result = await graph.invoke(baseState({ topic: 'write something about productivity tips' }));

    assert(
      result.retrievedMemoryIds.includes('sem-only'),
      `sem-only must appear in [${result.retrievedMemoryIds}]`,
    );
  });

  it('fills all limit slots with semantic results when no exact matches exist', async () => {
    const semanticItems: SemanticItem[] = Array.from({ length: 5 }, (_, i) => ({
      memoryItemId: `sem-${i}`,
      content: `Semantic post ${i}`,
      similarity: 0.80 - i * 0.02,
    }));

    const graph = await buildGraph({
      memoryRepo: makeMemoryRepo({ exactResults: [], semanticResults: semanticItems }),
      aiProvider: makeAiProvider(),
      db: makeDb(),
    });

    const result = await graph.invoke(baseState({ topic: 'write about developer tools' }));

    assert.strictEqual(result.retrievedMemoryIds.length, 5, 'all 5 semantic slots should be filled');
  });
});

// ── AC 4: style and safety evaluations still run downstream ───────────────────

describe('retrieveMemories — AC4: evaluateStyle and evaluateRisk still run after exact-match retrieval', () => {
  it('populates styleEval and riskEval even when exact matches dominate the retrieval', async () => {
    const exactItems: MemoryItem[] = Array.from({ length: 5 }, (_, i) => ({
      memoryItemId: `exact-${i}`,
      content: `Nike campaign memory ${i}`,
    }));

    const graph = await buildGraph({
      memoryRepo: makeMemoryRepo({ exactResults: exactItems, semanticResults: [] }),
      aiProvider: makeAiProvider(),
      db: makeDb(),
    });

    const result = await graph.invoke(baseState({ topic: '"Nike" campaign launch' }));

    assert(result.styleEval !== null && result.styleEval !== undefined, 'styleEval must be populated');
    assert(result.riskEval  !== null && result.riskEval  !== undefined, 'riskEval must be populated');
  });

  it('populates styleEval and riskEval when only semantic retrieval returns results', async () => {
    const graph = await buildGraph({
      memoryRepo: makeMemoryRepo({
        exactResults:    [],
        semanticResults: [{ memoryItemId: 'sem-1', content: 'some memory', similarity: 0.80 }],
      }),
      aiProvider: makeAiProvider(),
      db: makeDb(),
    });

    const result = await graph.invoke(baseState({ topic: 'write about developer tools' }));

    assert(result.styleEval !== null && result.styleEval !== undefined, 'styleEval must be populated (semantic-only path)');
    assert(result.riskEval  !== null && result.riskEval  !== undefined, 'riskEval must be populated (semantic-only path)');
  });

  it('populates styleEval and riskEval even when both searches return nothing', async () => {
    const graph = await buildGraph({
      memoryRepo: makeMemoryRepo({ exactResults: [], semanticResults: [] }),
      aiProvider: makeAiProvider(),
      db: makeDb(),
    });

    const result = await graph.invoke(baseState({ topic: 'write about developer tools' }));

    assert(result.styleEval !== null && result.styleEval !== undefined, 'styleEval must be populated (zero-memory path)');
    assert(result.riskEval  !== null && result.riskEval  !== undefined, 'riskEval must be populated (zero-memory path)');
  });
});


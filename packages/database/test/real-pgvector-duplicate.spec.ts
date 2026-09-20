import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MemoryRepository } from '../dist/index.js';

import { fileURLToPath } from 'node:url';

const currentDir = fileURLToPath(new URL('.', import.meta.url));

// Load DATABASE_URL from .env
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  const possiblePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(currentDir, '../../../.env'),
    path.resolve(currentDir, '../../../../.env'),
  ];
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m);
      if (match) {
        dbUrl = match[1];
        break;
      }
    }
  }
}

describe('Real PostgreSQL + pgvector Integration Test', { skip: !dbUrl && 'DATABASE_URL not found' }, () => {
  let prisma: PrismaClient;
  let memoryRepo: MemoryRepository;
  const testUserId = randomUUID();
  const testWorkspaceId = randomUUID();
  let historicalPostMemoryId: string;
  let partialPostMemoryId: string;

  // Normalized base unit vector for deterministic cosine similarity test
  function createNormalizedVector(seed: number): number[] {
    const vec = new Array(768).fill(0);
    vec[0] = Math.cos(seed);
    vec[1] = Math.sin(seed);
    for (let i = 2; i < 768; i++) {
      vec[i] = 0.001 * ((i % 10) - 5);
    }
    const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map((v) => v / mag);
  }

  // Vector with exact target cosine similarity to base
  function createVectorWithSimilarity(base: number[], targetSim: number): number[] {
    // Generate orthogonal vector
    const ortho = new Array(768).fill(0);
    ortho[2] = 1;
    ortho[3] = -1;
    const orthoMag = Math.sqrt(ortho.reduce((s, v) => s + v * v, 0));
    const normalizedOrtho = ortho.map((v) => v / orthoMag);

    const sinAngle = Math.sqrt(Math.max(0, 1 - targetSim * targetSim));
    const result = base.map((b, i) => targetSim * b + sinAngle * normalizedOrtho[i]);
    const resMag = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    return result.map((v) => v / resMag);
  }

  const baseSimVector = createNormalizedVector(0.5);
  const baseDocVector = createNormalizedVector(1.5);
  const duplicateCandidateVector = createVectorWithSimilarity(baseSimVector, 0.9434);
  const distinctCandidateVector = createVectorWithSimilarity(baseSimVector, 0.8214);

  before(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: dbUrl } },
    });
    memoryRepo = new MemoryRepository(prisma);

    // Allow cold Neon compute wake-up with retry
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1;`;
        break;
      } catch (err) {
        if (attempt === 4) throw err;
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }

    // Create test user
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `test-vector-${Date.now()}@threadpilot.internal`,
        passwordHash: 'mock-hash-for-integration-test',
      },
    });

    // Create test workspace
    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        userId: testUserId,
        name: `Test-Vector-Workspace-${Date.now()}`,
      },
    });

    // 1. Create historical post MemoryItem
    const histPost = await prisma.memoryItem.create({
      data: {
        workspaceId: testWorkspaceId,
        type: 'POST',
        content: 'PostgreSQL + pgvector is all the vector database you need.',
        sourceId: `threads-hist-${Date.now()}`,
      },
    });
    historicalPostMemoryId = histPost.id;

    // Persist dual representations into real memory_embeddings
    await memoryRepo.upsertEmbedding(
      historicalPostMemoryId,
      baseDocVector,
      'gemini-embedding-2',
      768,
      'DOCUMENT',
      'v2',
    );

    await memoryRepo.upsertEmbedding(
      historicalPostMemoryId,
      baseSimVector,
      'gemini-embedding-2',
      768,
      'SIMILARITY',
      'v2',
    );

    // 2. Create partial post MemoryItem (missing SIMILARITY) to test repair detection
    const partialPost = await prisma.memoryItem.create({
      data: {
        workspaceId: testWorkspaceId,
        type: 'POST',
        content: 'Distributed consensus algorithms in TypeScript.',
        sourceId: `threads-partial-${Date.now()}`,
      },
    });
    partialPostMemoryId = partialPost.id;

    await memoryRepo.upsertEmbedding(
      partialPostMemoryId,
      baseDocVector,
      'gemini-embedding-2',
      768,
      'DOCUMENT',
      'v2',
    );
  });

  after(async () => {
    try {
      // Cascade delete test user (cascades workspace, memory items, memory embeddings)
      await prisma.user.delete({
        where: { id: testUserId },
      });
    } catch {
      // Ignore cleanup error if already deleted
    } finally {
      await prisma.$disconnect();
    }
  });

  it('performs real cosine similarity search and matches SIMILARITY representation', async () => {
    const results = await memoryRepo.findSimilar(testWorkspaceId, baseSimVector, {
      model: 'gemini-embedding-2',
      taskType: 'SIMILARITY',
      pipelineVersion: 'v2',
      minSimilarity: 0.9,
    });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].memoryItemId, historicalPostMemoryId);
    assert(results[0].similarity > 0.99, `Expected similarity near 1.0, got ${results[0].similarity}`);
  });

  it('strictly isolates coordinate spaces: different model returns 0 matches in pgvector', async () => {
    const results = await memoryRepo.findSimilar(testWorkspaceId, baseSimVector, {
      model: 'other-incompatible-model',
      taskType: 'SIMILARITY',
      pipelineVersion: 'v2',
      minSimilarity: 0.5,
    });

    assert.strictEqual(results.length, 0, 'Incompatible model must return 0 matches');
  });

  it('strictly isolates task types: DOCUMENT query does not match SIMILARITY vectors', async () => {
    const results = await memoryRepo.findSimilar(testWorkspaceId, baseDocVector, {
      model: 'gemini-embedding-2',
      taskType: 'DOCUMENT',
      pipelineVersion: 'v2',
      minSimilarity: 0.9,
    });

    // Both historicalPost and partialPost have DOCUMENT embeddings
    assert.strictEqual(results.length, 2);
    const ids = results.map((r) => r.memoryItemId);
    assert(ids.includes(historicalPostMemoryId));
    assert(ids.includes(partialPostMemoryId));
  });

  it('calibrated duplicate threshold (0.88) discriminates duplicate from distinct in real pgvector', async () => {
    // Paraphrase candidate: target similarity 0.9434 >= 0.88 -> DUPLICATE
    const dupeResults = await memoryRepo.findSimilar(testWorkspaceId, duplicateCandidateVector, {
      model: 'gemini-embedding-2',
      taskType: 'SIMILARITY',
      pipelineVersion: 'v2',
      minSimilarity: 0.88,
    });

    assert.strictEqual(dupeResults.length, 1);
    assert.strictEqual(dupeResults[0].memoryItemId, historicalPostMemoryId);
    assert(
      dupeResults[0].similarity >= 0.88,
      `Expected paraphrase similarity >= 0.88, got ${dupeResults[0].similarity}`,
    );

    // Distinct candidate: target similarity 0.8214 < 0.88 -> NOT DUPLICATE
    const distinctResults = await memoryRepo.findSimilar(testWorkspaceId, distinctCandidateVector, {
      model: 'gemini-embedding-2',
      taskType: 'SIMILARITY',
      pipelineVersion: 'v2',
      minSimilarity: 0.88,
    });

    assert.strictEqual(distinctResults.length, 0, 'Distinct candidate must not match threshold 0.88');
  });

  it('detects partial embeddings and flags missing SIMILARITY representation for repair', async () => {
    const needingRepair = await memoryRepo.findItemsNeedingReEmbedding(testWorkspaceId, {
      targetPipelineVersion: 'v2',
      model: 'gemini-embedding-2',
    });

    // partialPost has DOCUMENT but is missing SIMILARITY
    const partialItem = needingRepair.find((item) => item.id === partialPostMemoryId);
    assert(partialItem !== undefined, 'Expected partial post to be flagged as needing re-embedding');
    assert.deepStrictEqual(partialItem.missingTaskTypes, ['SIMILARITY']);

    // historicalPost has both DOCUMENT and SIMILARITY, so it must NOT be flagged
    const histItem = needingRepair.find((item) => item.id === historicalPostMemoryId);
    assert.strictEqual(histItem, undefined, 'Fully embedded post must not be flagged');
  });

  it('enforces database unique constraint on (workspace_id, source_id)', async () => {
    const duplicateSourceId = `threads-hist-${Date.now()}-dupe`;

    // First insert succeeds
    await prisma.memoryItem.create({
      data: {
        workspaceId: testWorkspaceId,
        type: 'POST',
        content: 'Original post',
        sourceId: duplicateSourceId,
      },
    });

    // Second insert with same (workspaceId, sourceId) must fail with unique constraint violation
    await assert.rejects(
      async () => {
        await prisma.memoryItem.create({
          data: {
            workspaceId: testWorkspaceId,
            type: 'POST',
            content: 'Duplicate post attempt',
            sourceId: duplicateSourceId,
          },
        });
      },
      (err: any) => {
        // Prisma unique constraint code is P2002
        return err.code === 'P2002' || err.message.includes('unique');
      },
      'Database must reject duplicate (workspaceId, sourceId)',
    );
  });
});

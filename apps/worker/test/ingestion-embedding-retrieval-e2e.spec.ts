import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { IngestionProcessor } from '../dist/processors/ingestion.processor.js';
import { EmbeddingProcessor } from '../dist/processors/embedding.processor.js';
import { createContentGraph, DEFAULT_DUPLICATE_POLICY } from '@threadpilot/agents';
import { prisma, MemoryRepository } from '@threadpilot/database';
import { TokenEncryptionService } from '@threadpilot/threads-client';
import type { IngestionJobPayload, EmbeddingJobPayload } from '@threadpilot/types';

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
        process.env.DATABASE_URL = dbUrl;
        break;
      }
    }
  }
}

if (dbUrl) {
  process.env.DATABASE_URL = dbUrl;
}

describe('Infrastructure-Backed Ingestion -> Embedding -> Retrieval E2E Test (Real PostgreSQL + pgvector)', { skip: !dbUrl && 'DATABASE_URL not found' }, () => {
  let memoryRepo: MemoryRepository;

  const testUserId = randomUUID();
  const testWorkspaceId = randomUUID();
  const testSocialAccountId = randomUUID();
  const testThreadsPostId = `threads-post-${Date.now()}`;

  const encKey = Buffer.from('12345678901234567890123456789012').toString('base64');
  const encService = new TokenEncryptionService(encKey, 1);

  // Deterministic vector generators for cosine similarity testing
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

  function createVectorWithSimilarity(base: number[], targetSim: number): number[] {
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

  const historicalPostText = 'PostgreSQL + pgvector is all the vector database you need for AI apps.';
  const duplicateCandidateText = 'Honestly, PostgreSQL with pgvector is plenty for most vector search needs.';

  const baseHistDocVector = createNormalizedVector(1.5);
  const baseHistSimVector = createNormalizedVector(0.5);
  // Duplicate candidate SIMILARITY vector with cosine similarity 0.9434 (> 0.88 threshold)
  const candidateSimVector = createVectorWithSimilarity(baseHistSimVector, 0.9434);

  before(async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await prisma.$connect();
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    memoryRepo = new MemoryRepository(prisma);

    // Setup real workspace hierarchy in PostgreSQL
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `infra-e2e-${testUserId.slice(0, 8)}@threadpilot.test`,
        passwordHash: 'hash',
      },
    });

    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        userId: testUserId,
        name: 'Infra E2E Workspace',
      },
    });

    await prisma.socialAccount.create({
      data: {
        id: testSocialAccountId,
        workspaceId: testWorkspaceId,
        platform: 'threads',
        externalId: `threads-user-${testUserId.slice(0, 8)}`,
        username: `tester_${testUserId.slice(0, 8)}`,
        connectedAt: new Date(),
        oauthToken: {
          create: {
            accessTokenEncrypted: encService.encrypt('mock-threads-token'),
            scopes: ['threads_basic', 'threads_content_publish'],
            expiresAt: new Date(Date.now() + 86400000),
            issuedAt: new Date(),
          },
        },
      },
    });
  });

  after(async () => {
    try {
      await prisma.workspace.delete({ where: { id: testWorkspaceId } });
      await prisma.user.delete({ where: { id: testUserId } });
    } catch {
      // Ignore cascade cleanup errors
    } finally {
      await prisma.$disconnect();
    }
  });

  it('runs complete infrastructure-backed flow: Mock Threads API -> IngestionProcessor -> ThreadPost & MemoryItem -> EmbeddingProcessor -> real pgvector MemoryEmbedding -> ContentGraph cosine duplicate check', async () => {
    // 1. Setup Mock AI Provider that returns our calibrated vectors
    const mockAiProvider = {
      modelName: 'gemini-embedding-2',
      getCapabilities: () => ({
        structuredOutput: true,
        streaming: true,
        embeddings: true,
        tools: false,
        vision: false,
        multimodal: false,
      }),
      complete: async () => ({
        result: {
          hook: 'Honestly, PostgreSQL with pgvector is plenty',
          body: duplicateCandidateText,
          characterCount: duplicateCandidateText.length,
        },
      }),
      generateStructured: async () => ({
        data: {
          status: 'COMPLETED',
          iterationsUsed: 1,
          revisedDraft: duplicateCandidateText,
          hookVariation: 'Honestly, PostgreSQL with pgvector is plenty',
          predictedEngagementScore: 85,
          critiqueNotes: 'Good hook',
          structuralChanges: ['Simplified opening'],
        },
      }),
      embed: async (req: { texts: string[]; taskType?: string }) => {
        const text = req.texts[0];
        if (text === historicalPostText) {
          if (req.taskType === 'DOCUMENT') {
            return { embeddings: [baseHistDocVector], model: 'gemini-embedding-2', dimensions: 768 };
          }
          return { embeddings: [baseHistSimVector], model: 'gemini-embedding-2', dimensions: 768 };
        }
        if (text === duplicateCandidateText) {
          return { embeddings: [candidateSimVector], model: 'gemini-embedding-2', dimensions: 768 };
        }
        return { embeddings: [createNormalizedVector(0.1)], model: 'gemini-embedding-2', dimensions: 768 };
      },
    };

    const mockAiFactory = {
      getProvider: () => mockAiProvider,
    } as any;

    // 2. Setup IngestionProcessor with real DB & mocked external APIs
    const mockProgressService = {
      update: async () => {},
    } as any;

    const mockConfig = {
      get: (key: string, def?: any) => {
        if (key === 'TOKEN_ENCRYPTION_KEY') return encKey;
        if (key === 'TOKEN_ENCRYPTION_KEY_VERSION') return 1;
        return def ?? '';
      },
    } as any;

    const enqueuedEmbeddingJobs: any[] = [];
    const mockEmbeddingQueue = {
      add: async (name: string, payload: any, opts: any) => {
        enqueuedEmbeddingJobs.push({ name, payload, opts });
        return { id: opts?.jobId ?? 'job-1' };
      },
    } as any;

    const mockStyleQueue = {
      add: async () => ({ id: 'style-job-1' }),
    } as any;

    const ingestionProcessor = new IngestionProcessor(
      mockProgressService,
      mockConfig,
      mockStyleQueue,
      mockEmbeddingQueue,
      mockAiFactory,
    );

    // Mock Threads API client on IngestionProcessor
    (ingestionProcessor as any).threadsApiClient = {
      getUserPosts: async () => ({
        data: [
          {
            id: testThreadsPostId,
            text: historicalPostText,
            media_type: 'TEXT',
            timestamp: new Date().toISOString(),
          },
        ],
        paging: {},
      }),
    };

    // 3. Execute IngestionProcessor
    const ingestionRequestId = randomUUID();
    const ingestionJob = {
      data: {
        requestId: ingestionRequestId,
        workspaceId: testWorkspaceId,
        socialAccountId: testSocialAccountId,
        maxPosts: 10,
        pageSize: 10,
        isInitial: true,
      } satisfies IngestionJobPayload,
    } as any;

    await ingestionProcessor.process(ingestionJob);

    // 4. Verify ThreadPost and MemoryItem exist in real PostgreSQL
    const threadPost = await prisma.threadPost.findUnique({
      where: {
        socialAccountId_threadsPostId: {
          socialAccountId: testSocialAccountId,
          threadsPostId: testThreadsPostId,
        },
      },
    });
    assert(threadPost, 'ThreadPost must be created in PostgreSQL');
    assert.strictEqual(threadPost.text, historicalPostText);

    const memoryItem = await prisma.memoryItem.findUnique({
      where: {
        workspaceId_sourceId: {
          workspaceId: testWorkspaceId,
          sourceId: threadPost.id,
        },
      },
    });
    assert(memoryItem, 'MemoryItem must be created in PostgreSQL');
    assert.strictEqual(memoryItem.content, historicalPostText);

    // 5. Verify MemoryEmbedding representations in PostgreSQL with real pgvector
    const embeddings = await prisma.memoryEmbedding.findMany({
      where: { memoryItemId: memoryItem.id },
    });
    assert.strictEqual(embeddings.length, 2, 'Must have both DOCUMENT and SIMILARITY representations');

    const docRep = embeddings.find((e) => e.taskType === 'DOCUMENT');
    const simRep = embeddings.find((e) => e.taskType === 'SIMILARITY');
    assert(docRep, 'DOCUMENT representation must exist');
    assert(simRep, 'SIMILARITY representation must exist');

    // 6. Test EmbeddingProcessor idempotency against real PostgreSQL
    const embeddingProcessor = new EmbeddingProcessor(mockAiFactory);
    const retryJob = {
      data: {
        requestId: randomUUID(),
        workspaceId: testWorkspaceId,
        memoryItemId: memoryItem.id,
        text: historicalPostText,
        taskType: 'SIMILARITY',
        model: 'gemini-embedding-2',
        pipelineVersion: 'v2',
      } satisfies EmbeddingJobPayload,
    } as any;

    // Preflight DB check should skip without error
    await embeddingProcessor.process(retryJob);

    // 7. Instantiate real ContentGraph with real PostgreSQL + real MemoryRepository
    const contentGraph = createContentGraph({
      db: prisma,
      aiProvider: mockAiProvider as any,
      memoryRepo,
      duplicatePolicy: DEFAULT_DUPLICATE_POLICY, // 0.88 threshold, gemini-embedding-2, v2
    });

    const graphResult = await contentGraph.invoke({
      workspaceId: testWorkspaceId,
      actorId: testUserId,
      requestId: randomUUID(),
      topic: 'Vector Databases',
      format: 'TIPS',
      tone: 'FOUNDER',
    });

    // 8. Verify the complete retrieval loop:
    // Candidate SIMILARITY vector matched historical post via real PostgreSQL pgvector cosine search!
    assert.strictEqual(
      graphResult.dupeCheck?.isDuplicate,
      true,
      'Candidate draft must be flagged as duplicate by real pgvector cosine search',
    );
    assert.strictEqual(
      graphResult.dupeCheck?.similarMemoryItemId,
      memoryItem.id,
      'Duplicate must link to the ingested historical MemoryItem',
    );
    assert(
      (graphResult.dupeCheck?.similarityScore ?? 0) >= 0.88,
      `Similarity (${graphResult.dupeCheck?.similarityScore}) must meet or exceed calibrated 0.88 threshold`,
    );
    assert(
      graphResult.error?.includes('Content is too similar to existing post'),
      'Graph error must indicate duplicate content detection failure',
    );
  });
});

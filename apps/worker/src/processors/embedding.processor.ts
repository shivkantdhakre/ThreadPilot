import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import type Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { prisma, MemoryRepository } from '@threadpilot/database';
import { QUEUES, EmbeddingJobPayload } from '@threadpilot/types';
import { AIFactoryService } from '../services/ai-factory.service';
import { REDIS_CLIENT } from '../redis/redis.module';

@Processor(QUEUES.EMBEDDING, {
  concurrency: Number(process.env.EMBEDDING_CONCURRENCY ?? 2),
})
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);
  private readonly memoryRepo = new MemoryRepository(prisma);

  constructor(
    private readonly aiFactory: AIFactoryService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redisClient?: Redis,
  ) {
    super();
  }

  async process(job: Job<EmbeddingJobPayload>): Promise<void> {
    return this.handle(job);
  }

  async handle(job: Job<EmbeddingJobPayload>): Promise<void> {
    const {
      workspaceId,
      memoryItemId,
      text,
      taskType,
      model,
      pipelineVersion = 'v2',
    } = job.data;

    const aiProvider = this.aiFactory.getProvider();
    const targetModel = model ?? aiProvider.modelName;

    this.logger.log(
      `Processing embedding job for item ${memoryItemId} (model=${targetModel}, taskType=${taskType}, pipelineVersion=${pipelineVersion})`,
    );

    // DB-level preflight idempotency check: Skip expensive Gemini API call if this exact representation is already stored
    const alreadyExists = await this.memoryRepo.hasEmbedding(
      memoryItemId,
      targetModel,
      taskType,
      pipelineVersion,
    );

    if (alreadyExists) {
      this.logger.log(
        `MemoryEmbedding already exists for item ${memoryItemId} (${targetModel}/${taskType}/${pipelineVersion}) — skipping Gemini API call.`,
      );
      return;
    }

    // Representation-level distributed lock: Prevents concurrent redundant Gemini API requests
    // between Worker A and Worker B for the exact same representation.
    // Uses a unique token and atomic Lua compare-and-delete for ownership safety.
    const lockKey = `embedding-lock:${memoryItemId}:${targetModel}:${taskType}:${pipelineVersion}`;
    const lockToken = randomUUID();
    const LOCK_TTL_MS = 60000; // 60s comfortably exceeds maximum Gemini request timeout
    let lockAcquired = false;

    if (this.redisClient) {
      try {
        const res = await this.redisClient.set(lockKey, lockToken, 'PX', LOCK_TTL_MS, 'NX');
        lockAcquired = res === 'OK';
        if (!lockAcquired) {
          this.logger.log(
            `Another worker holds lock ${lockKey}; skipping redundant concurrent embedding call.`,
          );
          return;
        }
      } catch (lockErr) {
        this.logger.warn({ lockErr }, `Failed to acquire Redis lock ${lockKey}, proceeding with DB guard`);
      }
    }

    try {
      // Double check DB in case the concurrent worker completed while lock was being negotiated
      const doubleCheck = await this.memoryRepo.hasEmbedding(
        memoryItemId,
        targetModel,
        taskType,
        pipelineVersion,
      );
      if (doubleCheck) {
        this.logger.log(
          `MemoryEmbedding already exists after lock acquisition for item ${memoryItemId} — skipping Gemini API call.`,
        );
        return;
      }

      const embedResponse = await aiProvider.embed({
        texts: [text],
        taskType,
      });

      const vector = embedResponse.embeddings[0];
      if (!vector || vector.length === 0) {
        throw new Error(`AI provider returned empty vector for memoryItem ${memoryItemId}`);
      }

      await this.memoryRepo.upsertEmbedding(
        memoryItemId,
        vector,
        targetModel,
        vector.length,
        taskType,
        pipelineVersion,
      );

      this.logger.log(
        `Successfully generated and persisted ${taskType} embedding for item ${memoryItemId}`,
      );
    } finally {
      if (lockAcquired && this.redisClient) {
        // Ownership-safe compare-and-delete: delete only if key still holds our token
        await this.redisClient
          .eval(
            `if redis.call("GET", KEYS[1]) == ARGV[1] then
              return redis.call("DEL", KEYS[1])
            else
              return 0
            end`,
            1,
            lockKey,
            lockToken,
          )
          .catch(() => {});
      }
    }
  }
}

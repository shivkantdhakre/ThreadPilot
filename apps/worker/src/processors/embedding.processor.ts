import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { prisma, MemoryRepository } from '@threadpilot/database';
import { QUEUES, EmbeddingJobPayload } from '@threadpilot/types';
import { AIFactoryService } from '../services/ai-factory.service';

@Processor(QUEUES.EMBEDDING, {
  concurrency: Number(process.env.EMBEDDING_CONCURRENCY ?? 2),
})
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);
  private readonly memoryRepo = new MemoryRepository(prisma);

  constructor(private readonly aiFactory: AIFactoryService) {
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
  }
}

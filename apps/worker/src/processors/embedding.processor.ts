import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { prisma, MemoryRepository } from '@threadpilot/database';
import { QUEUES, EmbeddingJobPayload } from '@threadpilot/types';
import { AIFactoryService } from '../services/ai-factory.service';

@Processor(QUEUES.EMBEDDING)
export class EmbeddingProcessor {
  private readonly logger = new Logger(EmbeddingProcessor.name);
  private readonly memoryRepo = new MemoryRepository(prisma);

  constructor(private readonly aiFactory: AIFactoryService) {}

  @Process('EMBEDDING')
  async handle(job: Job<EmbeddingJobPayload>): Promise<void> {
    const {
      workspaceId,
      memoryItemId,
      text,
      taskType,
      model,
      pipelineVersion = 'v2',
    } = job.data;

    this.logger.log(
      `Processing embedding job for item ${memoryItemId} (taskType=${taskType}, pipelineVersion=${pipelineVersion})`,
    );

    const aiProvider = this.aiFactory.getProvider();
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
      model ?? aiProvider.modelName,
      vector.length,
      taskType,
      pipelineVersion,
    );

    this.logger.log(
      `Successfully generated and persisted ${taskType} embedding for item ${memoryItemId}`,
    );
  }
}

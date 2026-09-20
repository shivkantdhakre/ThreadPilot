import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { prisma, MemoryRepository } from '@threadpilot/database';
import { QUEUES, StyleExtractionJobPayload } from '@threadpilot/types';
import { createStyleExtractionGraph } from '@threadpilot/agents';
import { PROMPT_VERSION_STYLE } from '@threadpilot/prompts';
import { JobProgressService } from '../services/job-progress.service';
import { AIFactoryService } from '../services/ai-factory.service';
import { createHash } from 'crypto';

@Processor(QUEUES.STYLE)
export class StyleProcessor extends WorkerHost {
  private readonly logger = new Logger(StyleProcessor.name);
  private readonly memoryRepo = new MemoryRepository(prisma);

  constructor(
    private readonly progressService: JobProgressService,
    private readonly aiFactory: AIFactoryService,
  ) {
    super();
  }

  async process(job: Job<StyleExtractionJobPayload>): Promise<void> {
    return this.handle(job);
  }

  async handle(job: Job<StyleExtractionJobPayload>): Promise<void> {
    const { requestId, workspaceId, socialAccountId } = job.data;
    this.logger.log(`Starting style extraction job ${requestId} for account ${socialAccountId}`);

    // Idempotency check
    const existingJob = await prisma.jobRecord.findUnique({ where: { requestId } });
    if (existingJob && existingJob.status === 'COMPLETE') {
      this.logger.log(`Job ${requestId} already completed. Skipping.`);
      return;
    }

    await this.progressService.update(requestId, {
      status: 'RUNNING',
      progress: 15,
      progressMessage: 'Loading historical sample posts...',
    });

    const startTime = Date.now();
    const inputHash = createHash('sha256')
      .update(`${workspaceId}:${socialAccountId}`)
      .digest('hex');

    try {
      const graph = createStyleExtractionGraph({
        db: prisma,
        aiProvider: this.aiFactory.getProvider(),
        memoryRepo: this.memoryRepo,
      });

      await this.progressService.update(requestId, {
        status: 'RUNNING',
        progress: 45,
        progressMessage: 'Extracting style features and voice profile with AI...',
      });

      const finalState = await graph.invoke({
        workspaceId,
        socialAccountId,
        samplePosts: [],
        measuredFeatures: null,
        exampleCandidates: [],
        embeddings: null,
        profileVersion: 1,
        error: null,
        status: 'running',
      });

      if (finalState.status === 'failure' || finalState.error) {
        throw new Error(finalState.error ?? 'Style extraction failed inside graph');
      }

      await this.progressService.update(requestId, {
        status: 'RUNNING',
        progress: 80,
        progressMessage: 'Saving updated style snapshot and vector memories...',
      });

      // Fetch updated profile
      const updatedProfile = await prisma.userProfile.findUnique({
        where: { workspaceId },
      });

      // Persist AgentRun record for observability & audit trail
      await prisma.agentRun.create({
        data: {
          workspaceId,
          jobRecordId: existingJob?.id ?? null,
          workflowId: 'style-extraction',
          workflowVersion: '1.0.0',
          status: 'SUCCESS',
          promptVersion: PROMPT_VERSION_STYLE,
          profileVersion: updatedProfile?.profileVersion ?? 1,
          inputHash,
          outputHash: createHash('sha256')
            .update(JSON.stringify(finalState.measuredFeatures ?? {}))
            .digest('hex'),
          latencyMs: Date.now() - startTime,
          startedAt: new Date(startTime),
          completedAt: new Date(),
        },
      });

      await this.progressService.update(requestId, {
        status: 'COMPLETE',
        progress: 100,
        progressMessage: 'Style extraction complete. Style profile successfully trained!',
        resultEntityType: 'user_profile',
        resultEntityId: updatedProfile?.id ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error({ err, requestId }, `Style extraction job failed: ${msg}`);

      await prisma.agentRun.create({
        data: {
          workspaceId,
          jobRecordId: existingJob?.id ?? null,
          workflowId: 'style-extraction',
          workflowVersion: '1.0.0',
          status: 'FAILED',
          promptVersion: PROMPT_VERSION_STYLE,
          inputHash,
          latencyMs: Date.now() - startTime,
          startedAt: new Date(startTime),
          completedAt: new Date(),
          error: msg,
        },
      }).catch(() => {});

      await this.progressService.update(requestId, {
        status: 'FAILED',
        progress: 0,
        progressMessage: 'Style extraction failed',
        error: msg,
      });

      throw err;
    }
  }
}

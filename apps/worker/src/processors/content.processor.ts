import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { prisma, MemoryRepository } from '@threadpilot/database';
import {
  QUEUES,
  ContentGenerationJobPayload,
  ContentImprovementJobPayload,
} from '@threadpilot/types';
import { createContentGraph, DraftOutputSchema, type DraftOutput } from '@threadpilot/agents';
import {
  PROMPT_VERSION_GENERATE,
  PROMPT_VERSION_IMPROVE,
  buildImproveSystemPrompt,
  buildImproveUserPrompt,
} from '@threadpilot/prompts';
import { JobProgressService } from '../services/job-progress.service';
import { AIFactoryService } from '../services/ai-factory.service';
import { createHash } from 'crypto';

@Processor(QUEUES.CONTENT)
export class ContentProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentProcessor.name);
  private readonly memoryRepo = new MemoryRepository(prisma);

  constructor(
    private readonly progressService: JobProgressService,
    private readonly aiFactory: AIFactoryService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case 'IMPROVE':
        return this.handleImprovement(job as Job<ContentImprovementJobPayload>);
      case 'CONTENT':
      default:
        return this.handleGeneration(job as Job<ContentGenerationJobPayload>);
    }
  }

  async handleGeneration(job: Job<ContentGenerationJobPayload>): Promise<void> {
    const { requestId, workspaceId, topic, format, tone, additionalContext } = job.data;
    const actorId = job.data.actorId ?? job.data.requestedBy ?? 'system';
    const executionContext = job.data.context ?? {
      requestId,
      workspaceId,
      actorId,
      jobId: String(job.id),
      workflowId: 'content-generation',
      workflowVersion: '1.0.0',
    };

    this.logger.log(
      `Starting content generation [requestId=${executionContext.requestId}, workspace=${executionContext.workspaceId}, actor=${executionContext.actorId}]`,
    );

    // Idempotency check: if job is already complete, return early
    const existingJob = await prisma.jobRecord.findUnique({ where: { requestId } });
    if (existingJob && existingJob.status === 'COMPLETE') {
      this.logger.log(`Job ${requestId} already completed. Idempotent return.`);
      return;
    }

    const startTime = Date.now();
    const inputHash = createHash('sha256')
      .update(`${workspaceId}:${topic ?? ''}:${format ?? ''}:${tone ?? ''}`)
      .digest('hex');

    // Crash-after-provider-call recovery: Check if a draft was already generated for this inputHash & job
    if (existingJob?.id) {
      const existingRun = await prisma.agentRun.findFirst({
        where: {
          workspaceId,
          jobRecordId: existingJob.id,
          status: 'SUCCESS',
        },
      });
      if (existingRun) {
        this.logger.log(`Recovered existing generated run for request ${requestId}. Reusing cached result.`);
        const latestDraft = await prisma.contentDraft.findFirst({
          where: { workspaceId },
          orderBy: { createdAt: 'desc' },
        });
        await this.progressService.update(requestId, {
          status: 'COMPLETE',
          stage: 'COMPLETE',
          progress: 100,
          progressMessage: 'Draft recovered successfully!',
          resultEntityType: 'content_draft',
          resultEntityId: latestDraft?.id ?? null,
        });
        return;
      }
    }

    await this.progressService.update(requestId, {
      status: 'RUNNING',
      stage: 'LOADING_MEMORY',
      progress: 15,
      progressMessage: 'Retrieving style voice profile and semantic memories...',
    });

    try {
      const graph = createContentGraph({
        db: prisma,
        aiProvider: this.aiFactory.getProvider(),
        memoryRepo: this.memoryRepo,
      });

      await this.progressService.update(requestId, {
        status: 'RUNNING',
        stage: 'GENERATING',
        progress: 35,
        progressMessage: 'Generating draft tailored to your personal style...',
      });

      const finalState = await graph.invoke({
        workspaceId,
        topic: topic ?? '',
        format: format ?? '',
        tone: tone ?? null,
        additionalContext: additionalContext ?? null,
        profileVersion: 1,
        styleProfile: null,
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
        promptVersion: PROMPT_VERSION_GENERATE,
        researchSources: [],
        error: null,
        status: 'running',
      });

      if (finalState.status === 'failure' || finalState.error) {
        throw new Error(finalState.error ?? 'Content generation failed');
      }

      await this.progressService.update(requestId, {
        status: 'RUNNING',
        stage: 'PERSISTING',
        progress: 80,
        progressMessage: 'Evaluations passed. Saving generated draft...',
      });

      // Find the newly persisted draft for this workspace
      const latestDraft = await prisma.contentDraft.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        include: { versions: true },
      });

      // Persist AgentRun record for audit and tracing
      await prisma.agentRun.create({
        data: {
          workspaceId,
          jobRecordId: existingJob?.id ?? null,
          workflowId: executionContext.workflowId ?? 'content-generation',
          workflowVersion: executionContext.workflowVersion ?? '1.0.0',
          status: 'SUCCESS',
          promptVersion: PROMPT_VERSION_GENERATE,
          profileVersion: finalState.profileVersion ?? 1,
          inputHash,
          outputHash: createHash('sha256')
            .update(JSON.stringify(finalState.finalDraft ?? finalState.draft ?? {}))
            .digest('hex'),
          latencyMs: Date.now() - startTime,
          startedAt: new Date(startTime),
          completedAt: new Date(),
        },
      });

      await this.progressService.update(requestId, {
        status: 'COMPLETE',
        stage: 'COMPLETE',
        progress: 100,
        progressMessage: 'Draft generated successfully!',
        resultEntityType: 'content_draft',
        resultEntityId: latestDraft?.id ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error({ err, requestId }, `Content generation failed: ${msg}`);

      await prisma.agentRun.create({
        data: {
          workspaceId,
          jobRecordId: existingJob?.id ?? null,
          workflowId: executionContext.workflowId ?? 'content-generation',
          workflowVersion: executionContext.workflowVersion ?? '1.0.0',
          status: 'FAILED',
          promptVersion: PROMPT_VERSION_GENERATE,
          inputHash,
          latencyMs: Date.now() - startTime,
          startedAt: new Date(startTime),
          completedAt: new Date(),
          error: msg,
        },
      }).catch(() => {});

      await this.progressService.update(requestId, {
        status: 'FAILED',
        stage: 'FAILED',
        progress: 0,
        progressMessage: 'Content generation failed',
        error: msg,
      });

      throw err;
    }
  }


  async handleImprovement(job: Job<ContentImprovementJobPayload>): Promise<void> {
    const { requestId, workspaceId, draftId, versionId, instruction } = job.data;
    this.logger.log(`Starting content improvement job ${requestId} for draft ${draftId}`);

    // Idempotency check
    const existingJob = await prisma.jobRecord.findUnique({ where: { requestId } });
    if (existingJob && existingJob.status === 'COMPLETE') {
      this.logger.log(`Job ${requestId} already completed. Idempotent return.`);
      return;
    }

    const startTime = Date.now();
    await this.progressService.update(requestId, {
      status: 'RUNNING',
      progress: 20,
      progressMessage: 'Loading draft version and personal style guidelines...',
    });

    try {
      const draft = await prisma.contentDraft.findFirst({
        where: { id: draftId, workspaceId },
        include: { versions: true },
      });

      if (!draft) {
        throw new Error(`Draft ${draftId} not found`);
      }

      const versionToImprove = draft.versions.find((v) => v.id === versionId);
      if (!versionToImprove) {
        throw new Error(`Version ${versionId} not found`);
      }

      const profile = await prisma.userProfile.findUnique({
        where: { workspaceId },
      });

      await this.progressService.update(requestId, {
        status: 'RUNNING',
        progress: 50,
        progressMessage: `Applying improvement instruction (${instruction})...`,
      });

      const systemPrompt = buildImproveSystemPrompt(
        profile
          ? {
              avgPostLengthChars: profile.avgPostLengthChars ?? 280,
              avgSentenceLengthWords: profile.avgSentenceLengthWords ?? 12,
              questionFrequency: profile.questionFrequency ?? 0.2,
              emojiFrequency: profile.emojiFrequency ?? 0.1,
              firstPersonFrequency: profile.firstPersonFrequency ?? 0.5,
              technicalVocabScore: profile.technicalVocabScore ?? 0.3,
              listUsageFrequency: profile.listUsageFrequency ?? 0.1,
              contraryHookFrequency: profile.contraryHookFrequency ?? 0.2,
            }
          : undefined,
      );

      const userPrompt = buildImproveUserPrompt({
        currentBody: versionToImprove.body,
        instruction,
      });

      const aiProvider = this.aiFactory.getProvider();
      const response = await aiProvider.complete<DraftOutput>({
        systemPrompt,
        userPrompt,
        outputSchema: DraftOutputSchema,
      });

      const improved = response.result;
      if (improved.body.length > 500) {
        improved.body = improved.body.slice(0, 500);
      }

      await this.progressService.update(requestId, {
        status: 'RUNNING',
        progress: 80,
        progressMessage: 'Saving improved version...',
      });

      const nextVersionNum = Math.max(...draft.versions.map((v) => v.version), 1) + 1;

      await prisma.contentVersion.create({
        data: {
          draftId,
          version: nextVersionNum,
          body: improved.body,
          hook: improved.hook ?? null,
          cta: improved.cta ?? null,
          editedBy: 'AI',
          diffSummary: `Improved via instruction: ${instruction}`,
        },
      });

      await prisma.contentDraft.update({
        where: { id: draftId },
        data: {
          editedByUser: false,
        },
      });

      await prisma.agentRun.create({
        data: {
          workspaceId,
          jobRecordId: existingJob?.id ?? null,
          workflowId: 'content-improvement',
          workflowVersion: '1.0.0',
          status: 'SUCCESS',
          promptVersion: PROMPT_VERSION_IMPROVE,
          profileVersion: profile?.profileVersion ?? 1,
          inputHash: createHash('sha256').update(`${draftId}:${instruction}`).digest('hex'),
          outputHash: createHash('sha256').update(improved.body).digest('hex'),
          latencyMs: Date.now() - startTime,
          startedAt: new Date(startTime),
          completedAt: new Date(),
        },
      });

      await this.progressService.update(requestId, {
        status: 'COMPLETE',
        progress: 100,
        progressMessage: 'Draft improved successfully!',
        resultEntityType: 'content_draft',
        resultEntityId: draftId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error({ err, requestId }, `Improvement job failed: ${msg}`);

      await this.progressService.update(requestId, {
        status: 'FAILED',
        progress: 0,
        progressMessage: 'Improvement failed',
        error: msg,
      });

      throw err;
    }
  }
}

import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  prisma,
  PolicyDecisionType,
  AutonomyMode,
} from '@threadpilot/database';
import {
  ENGAGEMENT_QUEUES,
  ReplyDraftJobPayload,
  canonicalContentHash,
} from '@threadpilot/types';
import { ReplyGenerationGraph, PostGenerationSafetyGraph } from '@threadpilot/agents';
import { AIFactoryService } from '../services/ai-factory.service';
import { JobProgressService } from '../services/job-progress.service';
import { randomUUID } from 'crypto';

@Processor(ENGAGEMENT_QUEUES.REPLY_DRAFT, { concurrency: 3 })
export class ReplyDraftProcessor extends WorkerHost {
  private readonly logger = new Logger(ReplyDraftProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly aiFactory: AIFactoryService,
    private readonly progressService: JobProgressService,
    @InjectQueue(ENGAGEMENT_QUEUES.REPLY_PUBLISH) private readonly publishQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ReplyDraftJobPayload>): Promise<void> {
    return this.handle(job);
  }

  async handle(job: Job<ReplyDraftJobPayload>): Promise<void> {
    const { requestId, workspaceId, interactionId, userPreference, regenerate = false } = job.data;
    this.logger.log(`Starting reply drafting for interaction ${interactionId} (request ${requestId})`);

    // 1. Fetch interaction with context, current classification, and profile style
    const interaction = await prisma.interaction.findUnique({
      where: { id: interactionId },
      include: {
        threadPost: true,
        parentInteraction: true,
        classifications: {
          where: { isCurrent: true },
          take: 1,
        },
        policyDecisions: {
          where: { stage: 'PRE_GENERATION', isCurrent: true },
          take: 1,
        },
        replyDraft: {
          include: {
            currentVersion: true,
          },
        },
        workspace: {
          include: {
            profile: true,
            preferences: true,
          },
        },
      },
    });

    if (!interaction) {
      this.logger.warn(`Interaction ${interactionId} not found, skipping.`);
      return;
    }

    // Verify interaction is in a valid drafting state
    if (['DISMISSED', 'BLOCKED', 'NOT_REQUIRED', 'REPLIED'].includes(interaction.status)) {
      this.logger.log(
        `Interaction ${interactionId} is in terminal status ${interaction.status}, skipping draft generation.`,
      );
      return;
    }

    const currentClassification = interaction.classifications[0];
    const currentPolicy = interaction.policyDecisions[0];
    const intent = currentClassification?.intent ?? 'QUESTION';

    // Resolve account autonomy mode
    let autonomyMode: AutonomyMode = 'REVIEW_ONLY';
    const prefs = interaction.workspace.preferences;
    if (prefs) {
      if (prefs.repliesPaused || prefs.automationPaused) {
        autonomyMode = 'OFF';
      } else if (prefs.autonomyReplies === 'RULES_BASED' || prefs.autonomyReplies === 'AUTONOMOUS') {
        autonomyMode = 'RULES_BASED';
      } else if (prefs.autonomyReplies === 'SHADOW') {
        autonomyMode = 'SHADOW';
      } else {
        autonomyMode = 'REVIEW_ONLY';
      }
    }

    // Style profile features if available
    let styleProfile = null;
    const profile = interaction.workspace.profile;
    if (profile && profile.avgPostLengthChars !== null) {
      styleProfile = {
        avgPostLengthChars: profile.avgPostLengthChars ?? 200,
        avgSentenceLengthWords: profile.avgSentenceLengthWords ?? 15,
        questionFrequency: profile.questionFrequency ?? 0.2,
        emojiFrequency: profile.emojiFrequency ?? 0.1,
        firstPersonFrequency: profile.firstPersonFrequency ?? 0.3,
        technicalVocabScore: profile.technicalVocabScore ?? 0.5,
        listUsageFrequency: profile.listUsageFrequency ?? 0.1,
        contraryHookFrequency: profile.contraryHookFrequency ?? 0.2,
      };
    }

    try {
      // 2. Synthesize draft via ReplyGenerationGraph
      const aiProvider = this.aiFactory.getProvider();
      const draftingGraph = new ReplyGenerationGraph(aiProvider);

      const draftResult = await draftingGraph.execute({
        interactionId: interaction.id,
        commentText: interaction.content,
        authorUsername: interaction.authorUsernameSnapshot,
        intent,
        rootPostText: interaction.threadPost?.text,
        parentCommentText: interaction.parentInteraction?.content,
        styleProfile,
        userPreference,
      });

      // 3. Transactional Immutable Versioning (Invariant 3 & Section 8)
      let persistedVersionId: string = '';
      let parentDraftId: string = '';

      await prisma.$transaction(async (tx) => {
        // Step A: Ensure parent ReplyDraft exists
        let draft = interaction.replyDraft;
        if (!draft) {
          draft = await tx.replyDraft.create({
            data: {
              workspaceId,
              interactionId: interaction.id,
              status: 'ACTIVE',
            },
            include: {
              currentVersion: true,
            },
          });
        }
        parentDraftId = draft.id;

        // Step B: Calculate next monotonic version number
        const latestVersion = await tx.replyDraftVersion.findFirst({
          where: { replyDraftId: draft.id },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

        // Step C: Create immutable ReplyDraftVersion
        const hash = canonicalContentHash(draftResult.draft.body);
        const newVersion = await tx.replyDraftVersion.create({
          data: {
            replyDraftId: draft.id,
            versionNumber: nextVersionNumber,
            body: draftResult.draft.body,
            canonicalHash: hash,
            source: userPreference ? 'AI_ASSISTED' : 'AI',
            generationModel: draftResult.model,
            promptVersion: draftResult.promptVersion,
            policyVersion: currentPolicy?.policyVersion ?? 'rules-v1',
            voiceProfileVersion: profile?.profileVersion ?? 1,
            regenerationPrompt: userPreference ?? null,
          },
        });
        persistedVersionId = newVersion.id;

        // Step D: Update parent ReplyDraft pointer
        // Regeneration Invalidation: Creating a new draft version immediately invalidates prior approvals
        await tx.replyDraft.update({
          where: { id: draft.id },
          data: {
            currentVersionId: newVersion.id,
            ...(regenerate ? { approvedVersionId: null } : {}),
            status: 'ACTIVE',
          },
        });

        // Step E: Advance interaction status to OUTPUT_SAFETY_EVALUATING
        await tx.interaction.update({
          where: { id: interaction.id },
          data: {
            status: 'OUTPUT_SAFETY_EVALUATING',
          },
        });

        this.logger.log(
          `Persisted immutable draft version ${nextVersionNumber} (id ${newVersion.id}) for interaction ${interaction.id}`,
        );
      });

      // 4. Stage 2: Post-Generation Grounding & Safety Gate (Section 7.3 & Section 9)
      const killSwitchActive = this.config.get<string>('AUTONOMY_KILL_SWITCH') === 'true';
      const safetyGraph = new PostGenerationSafetyGraph(aiProvider);

      const safetyResult = await safetyGraph.execute({
        interactionId: interaction.id,
        rootPostText: interaction.threadPost?.text,
        incomingCommentText: interaction.content,
        generatedReplyText: draftResult.draft.body,
        accountAutonomyMode: autonomyMode,
        killSwitchActive,
      });

      const { policyDecision } = safetyResult;

      // 5. Transactional Recording & Autonomy Gating (Durable Parity / Outbox)
      let executionToDispatchId: string | null = null;

      await prisma.$transaction(async (tx) => {
        // Step A: Deprecate prior active post-generation decisions
        await tx.policyDecision.updateMany({
          where: {
            interactionId: interaction.id,
            stage: 'POST_GENERATION_SAFETY',
            isCurrent: true,
          },
          data: { isCurrent: false },
        });

        // Step B: Insert new post-generation decision
        await tx.policyDecision.create({
          data: {
            interactionId: interaction.id,
            stage: 'POST_GENERATION_SAFETY',
            policyVersion: policyDecision.policyVersion,
            isCurrent: true,
            decision: policyDecision.decision as PolicyDecisionType,
            reasonCodes: policyDecision.reasonCodes,
            accountAutonomyMode: autonomyMode,
            wouldAutoReplyInLive: policyDecision.wouldAutoReplyInLive,
          },
        });

        // Step C: Autonomy Gate Decision
        if (policyDecision.decision === 'AUTO_REPLY') {
          // Autonomous Approval Parity (Section 1.2 Invariant 10)
          // 1. Bind approved version
          await tx.replyDraft.update({
            where: { id: parentDraftId },
            data: { approvedVersionId: persistedVersionId },
          });

          // 2. Create ReplyExecution record with status CREATED
          const execution = await tx.replyExecution.create({
            data: {
              workspaceId,
              socialAccountId: interaction.socialAccountId,
              interactionId: interaction.id,
              replyDraftId: parentDraftId,
              replyDraftVersionId: persistedVersionId,
              status: 'CREATED',
              requestFingerprint: `${parentDraftId}:${persistedVersionId}:${Date.now()}`,
              policyVersion: policyDecision.policyVersion,
              classificationVersion: currentClassification?.classificationVersion ?? 1,
            },
          });
          executionToDispatchId = execution.id;

          // 3. Write dispatch event into transactional outbox
          await tx.eventOutbox.create({
            data: {
              workspaceId,
              eventType: 'REPLY_EXECUTION_DISPATCH',
              payload: {
                replyExecutionId: execution.id,
                interactionId: interaction.id,
                socialAccountId: interaction.socialAccountId,
                workspaceId,
              },
            },
          });

          // 4. Update Interaction to APPROVED
          await tx.interaction.update({
            where: { id: interaction.id },
            data: {
              status: 'APPROVED',
              activeExecutionId: execution.id,
            },
          });

          this.logger.log(
            `Autonomy Gate passed for interaction ${interaction.id}. Auto-approved execution ${execution.id}.`,
          );
        } else {
          // Routes to REVIEW_REQUIRED (Human Review Required, Shadow Mode, or Policy Block)
          await tx.interaction.update({
            where: { id: interaction.id },
            data: {
              status: policyDecision.decision === 'BLOCKED' ? 'BLOCKED' : 'REVIEW_REQUIRED',
            },
          });

          this.logger.log(
            `Interaction ${interaction.id} routed to ${policyDecision.decision === 'BLOCKED' ? 'BLOCKED' : 'REVIEW_REQUIRED'} (autonomyMode=${autonomyMode}, wouldAutoReplyInLive=${policyDecision.wouldAutoReplyInLive}).`,
          );
        }
      });

      // 6. If auto-approved, dispatch to BullMQ publish queue
      if (executionToDispatchId) {
        await this.publishQueue.add(
          'publish-reply',
          {
            requestId: randomUUID(),
            workspaceId,
            socialAccountId: interaction.socialAccountId,
            replyExecutionId: executionToDispatchId,
            interactionId: interaction.id,
          },
          {
            jobId: `reply-publish_${executionToDispatchId}`,
            removeOnComplete: true,
          },
        );
      }
    } catch (err: any) {
      this.logger.error(`Error during drafting for interaction ${interaction.id}: ${err?.message}`, err.stack);
      throw err;
    }
  }
}

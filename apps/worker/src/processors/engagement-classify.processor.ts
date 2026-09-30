import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma, InteractionIntent, Sentiment, PolicyDecisionType, AutonomyMode } from '@threadpilot/database';
import {
  ENGAGEMENT_QUEUES,
  EngagementClassifyJobPayload,
} from '@threadpilot/types';
import {
  InteractionClassifierGraph,
} from '@threadpilot/agents';
import { AIFactoryService } from '../services/ai-factory.service';
import { JobProgressService } from '../services/job-progress.service';
import { randomUUID } from 'crypto';

@Processor(ENGAGEMENT_QUEUES.ENGAGEMENT_CLASSIFY, { concurrency: 5 })
export class EngagementClassifyProcessor extends WorkerHost {
  private readonly logger = new Logger(EngagementClassifyProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly aiFactory: AIFactoryService,
    private readonly progressService: JobProgressService,
    @InjectQueue(ENGAGEMENT_QUEUES.REPLY_DRAFT) private readonly draftQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<EngagementClassifyJobPayload>): Promise<void> {
    return this.handle(job);
  }

  async handle(job: Job<EngagementClassifyJobPayload>): Promise<void> {
    const { requestId, workspaceId, interactionId } = job.data;
    this.logger.log(`Starting classification for interaction ${interactionId} (request ${requestId})`);

    // 1. Fetch interaction with context
    const interaction = await prisma.interaction.findUnique({
      where: { id: interactionId },
      include: {
        threadPost: true,
        parentInteraction: true,
        workspace: {
          include: {
            preferences: true,
          },
        },
      },
    });

    if (!interaction) {
      this.logger.warn(`Interaction ${interactionId} not found, skipping.`);
      return;
    }

    // Skip if already in terminal state
    if (['DISMISSED', 'BLOCKED', 'NOT_REQUIRED', 'REPLIED'].includes(interaction.status)) {
      this.logger.log(`Interaction ${interactionId} is already in terminal state ${interaction.status}, skipping.`);
      return;
    }

    // Transition to CLASSIFYING
    await prisma.interaction.update({
      where: { id: interactionId },
      data: { status: 'CLASSIFYING' },
    });

    // 2. Resolve account autonomy mode
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

    try {
      // 3. Execute InteractionClassifierGraph
      const aiProvider = this.aiFactory.getProvider();
      const classifierGraph = new InteractionClassifierGraph(aiProvider);

      const result = await classifierGraph.execute({
        interactionId: interaction.id,
        commentText: interaction.content,
        authorUsername: interaction.authorUsernameSnapshot,
        rootPostText: interaction.threadPost?.text,
        parentCommentText: interaction.parentInteraction?.content,
        accountAutonomyMode: autonomyMode,
      });

      const { classification, policyDecision, promptVersion, classifierModel } = result;

      // 4. Transactional Replacement Invariant (Section 3.3 & 7.4)
      // Guarantees atomic deprecation of prior active decisions before inserting the new current record
      await prisma.$transaction(async (tx) => {
        // Step A: Deprecate prior active classifications
        await tx.interactionClassification.updateMany({
          where: {
            interactionId: interaction.id,
            isCurrent: true,
          },
          data: { isCurrent: false },
        });

        // Step B: Insert new current classification
        await tx.interactionClassification.create({
          data: {
            interactionId: interaction.id,
            classificationVersion: 1,
            isCurrent: true,
            intent: classification.intent as InteractionIntent,
            intentConfidence: classification.intentConfidence,
            sentiment: classification.sentiment as Sentiment,
            priorityScore: classification.priorityScore,
            toxicityScore: classification.toxicityScore,
            harassmentScore: classification.harassmentScore,
            controversyScore: classification.controversyScore,
            isPromptInjection: classification.isPromptInjection,
            safetyFlags: classification.safetyFlags,
            classifierModel,
            promptVersion,
            schemaVersion: '1.0',
            decisionSummary: classification.decisionSummary,
          },
        });

        // Step C: Deprecate prior active pre-generation policy decisions
        await tx.policyDecision.updateMany({
          where: {
            interactionId: interaction.id,
            stage: 'PRE_GENERATION',
            isCurrent: true,
          },
          data: { isCurrent: false },
        });

        // Step D: Insert new current pre-generation policy decision
        await tx.policyDecision.create({
          data: {
            interactionId: interaction.id,
            stage: 'PRE_GENERATION',
            policyVersion: policyDecision.policyVersion,
            isCurrent: true,
            decision: policyDecision.decision as PolicyDecisionType,
            reasonCodes: policyDecision.reasonCodes,
            accountAutonomyMode: autonomyMode,
            wouldAutoReplyInLive: policyDecision.wouldAutoReplyInLive,
          },
        });

        // Step E: Update interaction business status based on pre-generation policy
        let nextStatus = interaction.status;
        let nextResponseDecision = interaction.responseDecision;

        if (policyDecision.decision === 'BLOCKED') {
          nextStatus = 'BLOCKED';
          nextResponseDecision = 'POLICY_BLOCKED';
        } else if (policyDecision.decision === 'NOT_APPLICABLE') {
          nextStatus = 'NOT_REQUIRED';
          nextResponseDecision = 'NOT_REQUIRED';
        } else {
          // AUTO_REPLY or REVIEW_REQUIRED: eligible for drafting
          nextStatus = 'DRAFTING';
          nextResponseDecision = 'REQUIRED';
        }

        await tx.interaction.update({
          where: { id: interaction.id },
          data: {
            status: nextStatus,
            responseDecision: nextResponseDecision,
            priorityScore: classification.priorityScore,
          },
        });
      });

      // 5. If eligible for drafting, enqueue into reply-draft-queue
      if (policyDecision.decision === 'AUTO_REPLY' || policyDecision.decision === 'REVIEW_REQUIRED') {
        this.logger.log(`Enqueuing drafting job for interaction ${interaction.id}`);
        await this.draftQueue.add(
          'draft-reply',
          {
            requestId: randomUUID(),
            workspaceId: interaction.workspaceId,
            socialAccountId: interaction.socialAccountId,
            interactionId: interaction.id,
          },
          {
            jobId: `reply-draft_${interaction.id}`,
            priority: classification.priorityScore * 100,
            removeOnComplete: true,
          },
        );
      } else {
        this.logger.log(
          `Interaction ${interaction.id} pre-policy decision is ${policyDecision.decision}. No drafting enqueued.`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Error during classification of interaction ${interaction.id}: ${err?.message}`, err.stack);

      // Revert interaction status to REVIEW_REQUIRED on classification error
      await prisma.interaction.update({
        where: { id: interaction.id },
        data: {
          status: 'REVIEW_REQUIRED',
        },
      });

      throw err;
    }
  }
}

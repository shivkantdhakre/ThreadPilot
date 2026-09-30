import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { prisma, InteractionStatus } from '@threadpilot/database';
import {
  ENGAGEMENT_QUEUES,
  validateThreadText,
  canonicalContentHash,
} from '@threadpilot/types';
import { randomUUID } from 'crypto';

@Injectable()
export class EngagementService {
  private readonly logger = new Logger(EngagementService.name);

  constructor(
    @InjectQueue(ENGAGEMENT_QUEUES.ENGAGEMENT_INGEST) private readonly ingestQueue: Queue,
    @InjectQueue(ENGAGEMENT_QUEUES.REPLY_DRAFT) private readonly draftQueue: Queue,
    @InjectQueue(ENGAGEMENT_QUEUES.REPLY_PUBLISH) private readonly publishQueue: Queue,
  ) {}

  /**
   * Keyset/cursor-paginated list of interactions.
   */
  async listInteractions(
    workspaceId: string,
    query: {
      status?: string | undefined;
      intent?: string | undefined;
      priorityScore?: number | undefined;
      socialAccountId?: string | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
    },
  ) {
    const limit = Math.min(query.limit ?? 25, 100);

    const where: any = { workspaceId };
    if (query.status) {
      where.status = query.status;
    }
    if (query.socialAccountId) {
      where.socialAccountId = query.socialAccountId;
    }
    if (query.priorityScore !== undefined) {
      where.priorityScore = { gte: query.priorityScore };
    }
    if (query.intent) {
      where.classifications = {
        some: {
          isCurrent: true,
          intent: query.intent,
        },
      };
    }

    const items = await prisma.interaction.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ priorityScore: 'desc' }, { createdAt: 'desc' }],
      include: {
        threadPost: {
          select: {
            id: true,
            threadsPostId: true,
            text: true,
            postedAt: true,
          },
        },
        parentInteraction: {
          select: {
            id: true,
            externalInteractionId: true,
            authorUsernameSnapshot: true,
            content: true,
          },
        },
        classifications: {
          where: { isCurrent: true },
          take: 1,
        },
        policyDecisions: {
          where: { isCurrent: true },
        },
        replyDraft: {
          include: {
            currentVersion: true,
            approvedVersion: true,
          },
        },
      },
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? data[data.length - 1]?.id : null;

    return {
      data,
      meta: {
        count: data.length,
        hasMore,
        nextCursor,
      },
    };
  }

  /**
   * Full details of an interaction.
   */
  async getInteraction(workspaceId: string, interactionId: string) {
    const interaction = await prisma.interaction.findFirst({
      where: { id: interactionId, workspaceId },
      include: {
        threadPost: true,
        parentInteraction: true,
        classifications: {
          where: { isCurrent: true },
        },
        policyDecisions: {
          where: { isCurrent: true },
        },
        replyDraft: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
            },
            currentVersion: true,
            approvedVersion: true,
          },
        },
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!interaction) {
      throw new NotFoundException(`Interaction ${interactionId} not found`);
    }

    return interaction;
  }

  /**
   * Enqueues an incremental engagement sync job for a social account.
   */
  async triggerSync(workspaceId: string, socialAccountId: string, rootThreadsPostId?: string) {
    const account = await prisma.socialAccount.findFirst({
      where: { id: socialAccountId, workspaceId },
    });

    if (!account) {
      throw new NotFoundException(`Social account ${socialAccountId} not found in workspace`);
    }

    const requestId = randomUUID();
    await this.ingestQueue.add(
      'sync-engagement',
      {
        requestId,
        workspaceId,
        socialAccountId,
        rootThreadsPostId,
        force: true,
      },
      {
        jobId: `engagement-sync_${socialAccountId}_${rootThreadsPostId ?? 'all'}_${Date.now()}`,
        removeOnComplete: true,
      },
    );

    return {
      success: true,
      requestId,
      message: 'Engagement sync job enqueued successfully',
    };
  }

  /**
   * Triggers reply drafting or regeneration.
   * Supports tenant-scoped Idempotency-Key.
   */
  async triggerDraft(
    workspaceId: string,
    interactionId: string,
    options: { userPreference?: string; regenerate?: boolean } = {},
    idempotencyKey?: string,
  ) {
    const endpoint = `/engagement/interactions/${interactionId}/draft`;

    if (idempotencyKey) {
      const existingRecord = await prisma.idempotencyRecord.findUnique({
        where: {
          workspaceId_key_method_endpoint: {
            workspaceId,
            key: idempotencyKey,
            method: 'POST',
            endpoint,
          },
        },
      });

      if (existingRecord) {
        return existingRecord.response as any;
      }
    }

    const interaction = await prisma.interaction.findFirst({
      where: { id: interactionId, workspaceId },
    });

    if (!interaction) {
      throw new NotFoundException(`Interaction ${interactionId} not found`);
    }

    if (['DISMISSED', 'BLOCKED', 'NOT_REQUIRED', 'REPLIED'].includes(interaction.status)) {
      throw new BadRequestException(`Cannot draft reply for interaction in ${interaction.status} state`);
    }

    // Transition status to DRAFTING
    await prisma.interaction.update({
      where: { id: interaction.id },
      data: { status: 'DRAFTING' },
    });

    const requestId = randomUUID();
    await this.draftQueue.add(
      'draft-reply',
      {
        requestId,
        workspaceId,
        socialAccountId: interaction.socialAccountId,
        interactionId: interaction.id,
        userPreference: options.userPreference,
        regenerate: options.regenerate ?? false,
      },
      {
        jobId: `reply-draft_${interaction.id}_${Date.now()}`,
        removeOnComplete: true,
      },
    );

    const result = {
      success: true,
      requestId,
      message: 'Draft generation enqueued successfully',
    };

    if (idempotencyKey) {
      try {
        await prisma.idempotencyRecord.create({
          data: {
            workspaceId,
            key: idempotencyKey,
            method: 'POST',
            endpoint,
            response: result,
            statusCode: 200,
          },
        });
      } catch (err: any) {
        // If concurrent request inserted the same idempotency record, return existing response
        const concurrentRecord = await prisma.idempotencyRecord.findUnique({
          where: {
            workspaceId_key_method_endpoint: {
              workspaceId,
              key: idempotencyKey,
              method: 'POST',
              endpoint,
            },
          },
        });
        if (concurrentRecord) {
          return concurrentRecord.response as any;
        }
      }
    }

    return result;
  }

  /**
   * Creates a new immutable draft version from user edit (Optimistic Concurrency).
   * Enforces 500-char limit and If-Match version checking.
   */
  async updateDraft(
    workspaceId: string,
    interactionId: string,
    body: string,
    ifMatchVersionNumber: number,
    userId: string,
  ) {
    const validation = validateThreadText(body);
    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    const interaction = await prisma.interaction.findFirst({
      where: { id: interactionId, workspaceId },
      include: {
        replyDraft: {
          include: {
            currentVersion: true,
          },
        },
      },
    });

    if (!interaction || !interaction.replyDraft) {
      throw new NotFoundException(`Reply draft for interaction ${interactionId} not found`);
    }

    const currentVersion = interaction.replyDraft.currentVersion;
    if (currentVersion && currentVersion.versionNumber !== ifMatchVersionNumber) {
      throw new ConflictException({
        error: 'STALE_VERSION',
        message: `Version conflict: draft was modified (current is v${currentVersion.versionNumber}, expected v${ifMatchVersionNumber})`,
        currentVersionNumber: currentVersion.versionNumber,
      });
    }

    const hash = canonicalContentHash(body);
    const nextVersionNumber = (currentVersion?.versionNumber ?? 0) + 1;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create immutable new version
      const newVersion = await tx.replyDraftVersion.create({
        data: {
          replyDraftId: interaction.replyDraft!.id,
          versionNumber: nextVersionNumber,
          body,
          canonicalHash: hash,
          source: 'USER_EDITED',
          parentVersionId: currentVersion?.id ?? null,
        },
      });

      // 2. Point currentVersionId to new version
      await tx.replyDraft.update({
        where: { id: interaction.replyDraft!.id },
        data: {
          currentVersionId: newVersion.id,
          status: 'ACTIVE',
        },
      });

      // 3. Keep interaction in REVIEW_REQUIRED or DRAFTED
      await tx.interaction.update({
        where: { id: interaction.id },
        data: {
          status: 'REVIEW_REQUIRED',
        },
      });

      return newVersion;
    });

    return {
      success: true,
      version: result,
    };
  }

  /**
   * Approves a specific draft version and transactional outbox insert.
   * Atomic CAS: WHERE id = :id AND status = 'REVIEW_REQUIRED'.
   */
  async approveDraft(
    workspaceId: string,
    interactionId: string,
    versionId?: string,
    userId?: string,
  ) {
    const interaction = await prisma.interaction.findFirst({
      where: { id: interactionId, workspaceId },
      include: {
        replyDraft: {
          include: {
            currentVersion: true,
          },
        },
      },
    });

    if (!interaction || !interaction.replyDraft) {
      throw new NotFoundException(`Interaction or draft not found`);
    }

    const targetVersionId = versionId ?? interaction.replyDraft.currentVersionId;
    if (!targetVersionId) {
      throw new BadRequestException('No draft version exists to approve');
    }

    // Verify version exists
    const version = await prisma.replyDraftVersion.findUnique({
      where: { id: targetVersionId },
    });
    if (!version || version.replyDraftId !== interaction.replyDraft.id) {
      throw new NotFoundException(`Draft version ${targetVersionId} not found`);
    }

    // Atomic CAS and outbox transaction
    let executionId: string;
    try {
      const txResult = await prisma.$transaction(async (tx) => {
        // Atomic CAS check
        const rowsUpdated = await tx.$executeRaw`
          UPDATE interactions
          SET status = 'APPROVED'::"InteractionStatus",
              updated_at = NOW()
          WHERE id = ${interaction.id}::uuid
            AND status = 'REVIEW_REQUIRED'::"InteractionStatus";
        `;

        if (rowsUpdated === 0) {
          throw new ConflictException(
            'Interaction is not in REVIEW_REQUIRED state or was already approved/dismissed by another operator',
          );
        }

        // Bind approved version
        await tx.replyDraft.update({
          where: { id: interaction.replyDraft!.id },
          data: { approvedVersionId: targetVersionId },
        });

        // Create exactly one ReplyExecution (status: CREATED)
        const execution = await tx.replyExecution.create({
          data: {
            workspaceId,
            socialAccountId: interaction.socialAccountId,
            interactionId: interaction.id,
            replyDraftId: interaction.replyDraft!.id,
            replyDraftVersionId: targetVersionId,
            status: 'CREATED',
            requestFingerprint: `${interaction.replyDraft!.id}:${targetVersionId}:${Date.now()}`,
          },
        });

        // Create EventOutbox dispatch event
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

        // Set active execution ID
        await tx.interaction.update({
          where: { id: interaction.id },
          data: { activeExecutionId: execution.id },
        });

        // Record in audit log
        if (userId) {
          await tx.auditLog.create({
            data: {
              workspaceId,
              action: 'APPROVE_REPLY_DRAFT',
              entityType: 'Interaction',
              entityId: interaction.id,
              result: 'SUCCESS',
              output: {
                versionId: targetVersionId,
                versionNumber: version.versionNumber,
                replyExecutionId: execution.id,
              },
            },
          });
        }

        return execution;
      });

      executionId = txResult.id;
    } catch (err: any) {
      if (err instanceof ConflictException) throw err;
      throw new ConflictException(`Failed to approve interaction: ${err?.message}`);
    }

    // Dispatch job to BullMQ reply-publish-queue
    await this.publishQueue.add(
      'publish-reply',
      {
        requestId: randomUUID(),
        workspaceId,
        socialAccountId: interaction.socialAccountId,
        replyExecutionId: executionId,
        interactionId: interaction.id,
      },
      {
        jobId: `reply-publish_${executionId}`,
        removeOnComplete: true,
      },
    );

    return {
      success: true,
      replyExecutionId: executionId,
      message: 'Draft approved and dispatched for publication',
    };
  }

  /**
   * Explicitly dismisses an interaction.
   * Atomic CAS: WHERE id = :id AND status = 'REVIEW_REQUIRED'.
   */
  async dismissInteraction(
    workspaceId: string,
    interactionId: string,
    reason?: string,
    userId?: string,
  ) {
    const rowsUpdated = await prisma.$executeRaw`
      UPDATE interactions
      SET status = 'DISMISSED'::"InteractionStatus",
          response_decision = 'USER_DISMISSED'::"ResponseDecision",
          dismissed_reason = ${reason ?? 'Dismissed by user'},
          updated_at = NOW()
      WHERE id = ${interactionId}::uuid
        AND workspace_id = ${workspaceId}::uuid
        AND status = 'REVIEW_REQUIRED'::"InteractionStatus";
    `;

    if (rowsUpdated === 0) {
      throw new ConflictException(
        'Interaction is not in REVIEW_REQUIRED state or was already resolved',
      );
    }

    if (userId) {
      await prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'DISMISS_INTERACTION',
          entityType: 'Interaction',
          entityId: interactionId,
          result: 'SUCCESS',
          output: { reason },
        },
      });
    }

    return {
      success: true,
      message: 'Interaction dismissed successfully',
    };
  }

  /**
   * Operator recovery resolution contract (Section 10.3 & Section 13).
   * Resolves execution in RECOVERY_REQUIRED with recoveryResolution = OPERATOR_REQUIRED.
   */
  async resolveExecution(
    workspaceId: string,
    executionId: string,
    payload: {
      resolution: 'CONFIRMED_PUBLISHED' | 'CONFIRMED_NOT_PUBLISHED';
      externalPostId?: string | undefined;
      notes?: string | undefined;
    },
    userId?: string,
  ) {
    const execution = await prisma.replyExecution.findFirst({
      where: { id: executionId, workspaceId },
      include: { interaction: true },
    });

    if (!execution) {
      throw new NotFoundException(`Reply execution ${executionId} not found`);
    }

    // Strict idempotency: if already resolved to matching state, return 200 OK
    if (
      payload.resolution === 'CONFIRMED_PUBLISHED' &&
      execution.status === 'PUBLISHED' &&
      execution.recoveryResolution === 'CONFIRMED_PUBLISHED'
    ) {
      return { success: true, execution, idempotent: true };
    }

    if (
      payload.resolution === 'CONFIRMED_NOT_PUBLISHED' &&
      execution.recoveryResolution === 'CONFIRMED_NOT_PUBLISHED'
    ) {
      return { success: true, execution, idempotent: true };
    }

    // Atomic CAS check: must be in RECOVERY_REQUIRED
    if (execution.status !== 'RECOVERY_REQUIRED') {
      throw new ConflictException(
        `Execution is in state ${execution.status}, not RECOVERY_REQUIRED`,
      );
    }

    const { resolution, externalPostId, notes } = payload;

    const result = await prisma.$transaction(async (tx) => {
      let updatedExecution;

      if (resolution === 'CONFIRMED_PUBLISHED') {
        // Operator confirmed published externally
        updatedExecution = await tx.replyExecution.update({
          where: { id: execution.id },
          data: {
            status: 'PUBLISHED',
            recoveryResolution: 'CONFIRMED_PUBLISHED',
            publishedThreadPostId: externalPostId ?? execution.containerId ?? 'confirmed_manual',
            publishedAt: new Date(),
          },
        });

        await tx.interaction.update({
          where: { id: execution.interactionId },
          data: { status: 'REPLIED' },
        });
      } else {
        // Operator confirmed NOT published externally
        if (execution.containerId) {
          // Container exists: safe to retry publish against existing container
          updatedExecution = await tx.replyExecution.update({
            where: { id: execution.id },
            data: {
              status: 'RETRYABLE_FAILURE',
              recoveryResolution: 'CONFIRMED_NOT_PUBLISHED',
              nextRetryAt: new Date(),
            },
          });
        } else {
          // Container missing: ambiguous container creation -> FAILED_PERMANENT
          updatedExecution = await tx.replyExecution.update({
            where: { id: execution.id },
            data: {
              status: 'FAILED_PERMANENT',
              recoveryResolution: 'CONFIRMED_NOT_PUBLISHED',
            },
          });

          await tx.interaction.update({
            where: { id: execution.interactionId },
            data: { status: 'REVIEW_REQUIRED' },
          });
        }
      }

      if (userId) {
        await tx.auditLog.create({
          data: {
            workspaceId,
            action: 'RESOLVE_AMBIGUOUS_EXECUTION',
            entityType: 'ReplyExecution',
            entityId: execution.id,
            result: 'SUCCESS',
            output: {
              resolution,
              externalPostId,
              notes,
              previousStatus: execution.status,
            },
          },
        });
      }

      return updatedExecution;
    });

    return {
      success: true,
      execution: result,
      idempotent: false,
    };
  }

  /**
   * Aggregated engagement inbox metrics.
   */
  async getStats(workspaceId: string, socialAccountId?: string) {
    const where: any = { workspaceId };
    if (socialAccountId) {
      where.socialAccountId = socialAccountId;
    }

    const [pendingReview, autoReplied, replied, dismissed, drafting] = await Promise.all([
      prisma.interaction.count({
        where: { ...where, status: 'REVIEW_REQUIRED' },
      }),
      prisma.interaction.count({
        where: {
          ...where,
          status: 'REPLIED',
          policyDecisions: {
            some: {
              stage: 'POST_GENERATION_SAFETY',
              decision: 'AUTO_REPLY',
            },
          },
        },
      }),
      prisma.interaction.count({
        where: { ...where, status: 'REPLIED' },
      }),
      prisma.interaction.count({
        where: { ...where, status: 'DISMISSED' },
      }),
      prisma.interaction.count({
        where: { ...where, status: 'DRAFTING' },
      }),
    ]);

    return {
      pendingReview,
      autoReplied,
      replied,
      dismissed,
      drafting,
    };
  }
}

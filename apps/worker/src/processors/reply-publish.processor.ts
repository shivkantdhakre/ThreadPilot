import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient } from '@threadpilot/database';
import {
  ENGAGEMENT_QUEUES,
  validateThreadText,
  canonicalOutboundText,
} from '@threadpilot/types';
import { ThreadsApiError } from '@threadpilot/threads-client';
import { PublishingService } from '../services/publishing.service';
import { randomUUID } from 'crypto';

export interface ReplyPublishJobPayload {
  requestId: string;
  workspaceId: string;
  socialAccountId: string;
  replyExecutionId: string;
  interactionId: string;
}

export class FencingLeaseExpiredException extends Error {
  constructor(executionId: string, state: string) {
    super(`Fencing token expired or lost lease for execution ${executionId} during state: ${state}`);
    this.name = 'FencingLeaseExpiredException';
  }
}

/**
 * Deterministically classifies external API errors as definitive vs. ambiguous.
 */
export function isAmbiguousError(err: any): boolean {
  if (!err) return false;
  const msg = err.message || '';
  const name = err.name || '';

  // Network timeouts, drops, or aborted requests
  if (name === 'TimeoutError' || name === 'AbortError' || msg.includes('timeout') || msg.includes('ECONNRESET')) {
    return true;
  }

  // HTTP 5xx responses (server might have committed the post before timing out)
  if (err instanceof ThreadsApiError) {
    if (err.statusCode >= 500 && err.statusCode <= 599) {
      return true;
    }
  }

  return false;
}

@Processor(ENGAGEMENT_QUEUES.REPLY_PUBLISH, {
  concurrency: 2,
})
@Injectable()
export class ReplyPublishProcessor extends WorkerHost {
  private readonly logger = new Logger(ReplyPublishProcessor.name);
  private readonly workerNodeId = `${process.env.HOSTNAME || 'worker'}-${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly publishingService: PublishingService,
    @Optional() private readonly db: PrismaClient = prisma,
  ) {
    super();
  }

  async process(job: Job<ReplyPublishJobPayload>): Promise<void> {
    const { replyExecutionId, interactionId, workspaceId, socialAccountId } = job.data;
    const attemptId = randomUUID();

    this.logger.log(
      `Processing reply publication for execution ${replyExecutionId} [attemptId: ${attemptId}]`,
    );

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: ATOMIC CAS CLAIM & FENCING LEASE
    // ─────────────────────────────────────────────────────────────────────────
    const claimResult: Array<{
      id: string;
      status: string;
      attempt_count: number;
      publish_attempt_count: number;
      container_id: string | null;
    }> = await this.db.$queryRaw`
      UPDATE reply_executions
      SET status = 'CLAIMED'::"ReplyExecutionStatus",
          claimed_by = ${this.workerNodeId},
          claimed_at = NOW(),
          lease_until = NOW() + INTERVAL '3 minutes',
          attempt_id = ${attemptId}::uuid,
          updated_at = NOW()
      WHERE id = ${replyExecutionId}::uuid
        AND (
          status IN ('CREATED', 'QUEUED')
          OR (status = 'RETRYABLE_FAILURE' AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
          OR (status = 'CLAIMED' AND lease_until < NOW())
          OR (status = 'QUOTA_BLOCKED' AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
        )
      RETURNING id, status, attempt_count, publish_attempt_count, container_id;
    `;

    const claimed = claimResult[0];
    if (!claimed) {
      this.logger.log(
        `Execution ${replyExecutionId} is already claimed, executing, or in terminal state. Skipping.`,
      );
      return;
    }

    const { attempt_count: initialAttemptCount, container_id: existingContainerId } = claimed;

    // Load full execution context
    const execution = await this.db.replyExecution.findUniqueOrThrow({
      where: { id: replyExecutionId },
      include: {
        interaction: true,
        replyDraft: true,
        replyDraftVersion: true,
        socialAccount: true,
      },
    });

    const { interaction, replyDraft, replyDraftVersion, socialAccount } = execution;

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // STEP 2: PRE-FLIGHT PUBLICATION AUTHORIZATION BOUNDARY
      // ─────────────────────────────────────────────────────────────────────────
      // 2.1 Approved Version Verification
      if (replyDraft.approvedVersionId !== replyDraftVersion.id) {
        this.logger.warn(
          `Approved version mismatch for execution ${replyExecutionId}. Approved: ${replyDraft.approvedVersionId}, Execution: ${replyDraftVersion.id}. Aborting.`,
        );
        await this.fencedUpdate(replyExecutionId, attemptId, {
          status: 'CANCELLED_BY_POLICY',
          lastError: 'Approved version mismatch (stale execution approval)',
        });
        return;
      }

      // 2.2 Interaction Status Boundary
      if (interaction.status !== 'APPROVED' && interaction.status !== 'PUBLISHING') {
        this.logger.warn(
          `Interaction ${interaction.id} is not APPROVED (status=${interaction.status}). Aborting publish.`,
        );
        await this.fencedUpdate(replyExecutionId, attemptId, {
          status: 'CANCELLED_BY_POLICY',
          lastError: `Interaction status is ${interaction.status}`,
        });
        return;
      }

      // 2.3 Social Account Connectivity Boundary
      if (!socialAccount.isConnected) {
        this.logger.warn(`Social account ${socialAccount.id} is disconnected. Marking AUTH_REQUIRED.`);
        await this.fencedUpdate(replyExecutionId, attemptId, {
          status: 'AUTH_REQUIRED',
          lastError: 'Social account is disconnected',
        });
        await this.db.interaction.update({
          where: { id: interaction.id },
          data: { status: 'REVIEW_REQUIRED' },
        });
        return;
      }

      // 2.4 Kill Switch Gating Boundary
      const prefs = await this.db.userPreferences.findUnique({
        where: { workspaceId },
      });
      if (prefs?.repliesPaused) {
        this.logger.warn(`Emergency kill switch active for workspace ${workspaceId}. Halting outbound reply.`);
        await this.fencedUpdate(replyExecutionId, attemptId, {
          status: 'CANCELLED_BY_POLICY',
          lastError: 'Emergency kill switch active (repliesPaused = true)',
        });
        await this.db.interaction.update({
          where: { id: interaction.id },
          data: { status: 'REVIEW_REQUIRED' },
        });
        return;
      }

      // 2.5 OAuth Token Retrieval
      const token = await this.publishingService.tokenService.getValidToken(socialAccount.id);
      if (!token) {
        this.logger.warn(`No valid OAuth token found for account ${socialAccount.id}. Marking AUTH_REQUIRED.`);
        await this.fencedUpdate(replyExecutionId, attemptId, {
          status: 'AUTH_REQUIRED',
          lastError: 'OAuth token missing or expired',
        });
        await this.db.interaction.update({
          where: { id: interaction.id },
          data: { status: 'REVIEW_REQUIRED' },
        });
        return;
      }

      // 2.6 Dynamic Reply Quota Check
      try {
        const limitInfo = await this.publishingService.threadsApi.getReplyPublishingLimit(token);
        const replyUsage = limitInfo.reply_quota_usage ?? limitInfo.quota_usage ?? 0;
        const replyConfig = limitInfo.reply_config ?? limitInfo.config;
        const totalQuota = replyConfig?.quota_total ?? 250;

        if (replyUsage >= totalQuota) {
          this.logger.warn(
            `Threads reply quota exhausted for account ${socialAccount.id}: ${replyUsage}/${totalQuota}`,
          );
          await this.fencedUpdate(replyExecutionId, attemptId, {
            status: 'QUOTA_BLOCKED',
            quotaBlockedAt: new Date(),
            nextRetryAt: new Date(Date.now() + 30 * 60 * 1000), // Retry in 30 minutes
            lastError: `Quota exhausted: ${replyUsage}/${totalQuota}`,
          });
          return;
        }
      } catch (err: any) {
        this.logger.warn(`Could not verify reply quota: ${err.message}. Proceeding cautiously.`);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 3: CONTAINER CREATION — EXACTLY-ONCE INVARIANT
      // ─────────────────────────────────────────────────────────────────────────
      let containerId: string | null = existingContainerId;

      if (!containerId) {
        this.logger.log(`Initiating container creation for execution ${replyExecutionId}...`);

        // Advance to CREATING_CONTAINER with CAS fencing and attempt count increment
        const advanceCreating: number = await this.db.$executeRaw`
          UPDATE reply_executions
          SET status = 'CREATING_CONTAINER'::"ReplyExecutionStatus",
              attempt_count = attempt_count + 1,
              container_create_attempted_at = NOW(),
              container_request_started_at = NOW(),
              lease_until = NOW() + INTERVAL '3 minutes',
              updated_at = NOW()
          WHERE id = ${replyExecutionId}::uuid
            AND attempt_id = ${attemptId}::uuid
            AND claimed_by = ${this.workerNodeId}
            AND lease_until > NOW();
        `;

        if (advanceCreating === 0) {
          throw new FencingLeaseExpiredException(replyExecutionId, 'CREATING_CONTAINER');
        }

        const canonicalText = canonicalOutboundText(replyDraftVersion.body);
        const textCheck = validateThreadText(canonicalText);
        if (!textCheck.valid) {
          this.logger.error(`Validation failed for reply text: ${textCheck.error}`);
          await this.fencedUpdate(replyExecutionId, attemptId, {
            status: 'FAILED_PERMANENT',
            lastError: textCheck.error || 'Text validation failed',
          });
          await this.db.interaction.update({
            where: { id: interaction.id },
            data: { status: 'REVIEW_REQUIRED' },
          });
          return;
        }

        try {
          const containerRes = await this.publishingService.threadsApi.createReplyContainer(
            token,
            canonicalText,
            interaction.externalInteractionId,
          );
          containerId = containerRes.id;

          await this.fencedUpdate(replyExecutionId, attemptId, {
            status: 'CONTAINER_CREATED',
            containerId,
            containerCreatedAt: new Date(),
          });
          this.logger.log(`Container ${containerId} successfully created for execution ${replyExecutionId}`);
        } catch (createErr: any) {
          if (isAmbiguousError(createErr)) {
            this.logger.warn(
              `Ambiguous container creation error for execution ${replyExecutionId}: ${createErr.message}. Entering RECOVERY_REQUIRED.`,
            );
            await this.fencedUpdate(replyExecutionId, attemptId, {
              status: 'RECOVERY_REQUIRED',
              hasExternalAmbiguity: true,
              ambiguityType: 'CONTAINER_CREATE',
              ambiguityDetectedAt: new Date(),
              recoveryDeadlineAt: new Date(Date.now() + 45 * 1000), // 45-second deadline
              lastError: createErr.message,
            });
            await this.db.interaction.update({
              where: { id: interaction.id },
              data: { status: 'RECOVERY_REQUIRED' },
            });
            return;
          }

          // Definitive failure on container creation
          this.logger.error(`Definitive failure on container creation: ${createErr.message}`);
          await this.fencedUpdate(replyExecutionId, attemptId, {
            status: 'FAILED_PERMANENT',
            lastError: createErr.message,
          });
          await this.db.interaction.update({
            where: { id: interaction.id },
            data: { status: 'REVIEW_REQUIRED' },
          });
          return;
        }
      } else {
        this.logger.log(
          `Container ${containerId} already exists for execution ${replyExecutionId}. Skipping container creation.`,
        );
      }

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 4: CONTAINER STATUS VERIFICATION
      // ─────────────────────────────────────────────────────────────────────────
      try {
        const containerStatus = await this.publishingService.threadsApi.getContainerPublishingStatus(
          token,
          containerId!,
        );

        if (containerStatus.status === 'ERROR' || containerStatus.status === 'EXPIRED') {
          this.logger.error(
            `Container ${containerId} failed server-side processing on Meta: ${containerStatus.status} (${containerStatus.error_message})`,
          );
          // Terminal failure: under the exactly-once container invariant, cannot re-create container!
          await this.fencedUpdate(replyExecutionId, attemptId, {
            status: 'FAILED_PERMANENT',
            lastError: `Container failed processing: ${containerStatus.status} - ${containerStatus.error_message || 'Expired'}`,
          });
          await this.db.interaction.update({
            where: { id: interaction.id },
            data: { status: 'REVIEW_REQUIRED' },
          });
          return;
        }
      } catch (statusErr: any) {
        this.logger.warn(`Could not poll container status: ${statusErr.message}. Attempting publish.`);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 5: PUBLISH COMMIT — AT MOST ONE REQUEST IN FLIGHT
      // ─────────────────────────────────────────────────────────────────────────
      this.logger.log(`Committing publish for container ${containerId}...`);

      const advancePublishing: number = await this.db.$executeRaw`
        UPDATE reply_executions
        SET status = 'PUBLISHING'::"ReplyExecutionStatus",
            publish_attempt_count = publish_attempt_count + 1,
            publish_requested_at = NOW(),
            lease_until = NOW() + INTERVAL '3 minutes',
            updated_at = NOW()
        WHERE id = ${replyExecutionId}::uuid
          AND attempt_id = ${attemptId}::uuid
          AND claimed_by = ${this.workerNodeId}
          AND lease_until > NOW();
      `;

      if (advancePublishing === 0) {
        throw new FencingLeaseExpiredException(replyExecutionId, 'PUBLISHING');
      }

      // Also mark interaction as PUBLISHING
      await this.db.interaction.update({
        where: { id: interaction.id },
        data: { status: 'PUBLISHING' },
      });

      try {
        const publishRes = await this.publishingService.threadsApi.publishContainer(token, containerId!);
        const publishedThreadPostId = publishRes.id;

        // Commit successful publication
        await this.fencedUpdate(replyExecutionId, attemptId, {
          status: 'PUBLISHED',
          publishedThreadPostId,
          publishedAt: new Date(),
        });

        await this.db.interaction.update({
          where: { id: interaction.id },
          data: { status: 'REPLIED' },
        });

        this.logger.log(
          `Reply successfully published to Threads! Published ID: ${publishedThreadPostId} [Execution: ${replyExecutionId}]`,
        );

        // Check if this was an editorial edit by human operator; if so, create EditorialFeedback candidate
        if (replyDraft.currentVersionId && replyDraftVersion.versionNumber > 1) {
          const v1 = await this.db.replyDraftVersion.findFirst({
            where: { replyDraftId: replyDraft.id, versionNumber: 1 },
          });
          if (v1 && v1.body !== replyDraftVersion.body) {
            await this.db.editorialFeedback.create({
              data: {
                workspaceId,
                socialAccountId: socialAccount.id,
                interactionId: interaction.id,
                replyExecutionId,
                feedbackType: 'STYLE_CORRECTION',
                originalText: v1.body,
                finalText: replyDraftVersion.body,
                wordDiffSummary: `Diff from v1 to v${replyDraftVersion.versionNumber}`,
                isVectorCandidate: true,
              },
            });
          }
        }
      } catch (pubErr: any) {
        if (isAmbiguousError(pubErr)) {
          this.logger.warn(
            `Ambiguous publish outcome for execution ${replyExecutionId}: ${pubErr.message}. Entering RECOVERY_REQUIRED.`,
          );
          await this.fencedUpdate(replyExecutionId, attemptId, {
            status: 'RECOVERY_REQUIRED',
            hasExternalAmbiguity: true,
            ambiguityType: 'PUBLISH',
            ambiguityDetectedAt: new Date(),
            recoveryDeadlineAt: new Date(Date.now() + 45 * 1000),
            lastError: pubErr.message,
          });
          await this.db.interaction.update({
            where: { id: interaction.id },
            data: { status: 'RECOVERY_REQUIRED' },
          });
          return;
        }

        // Definitive rejection (e.g. rate limit 429)
        const currentExecution = await this.db.replyExecution.findUniqueOrThrow({
          where: { id: replyExecutionId },
        });

        const publishAttempt = currentExecution.publishAttemptCount;
        if (publishAttempt < 5) {
          // Canonical publish retry backoffs: Attempt 1 -> 5s, 2 -> 15s, 3 -> 30s, 4 -> 60s
          const canonicalBackoffs = [5, 15, 30, 60];
          const backoffSec = canonicalBackoffs[publishAttempt - 1] ?? 60;
          const nextRetryAt = new Date(Date.now() + backoffSec * 1000);

          this.logger.warn(
            `Definitive publish rejection (Attempt ${publishAttempt}/5): ${pubErr.message}. Scheduling retry in ${backoffSec}s.`,
          );

          await this.fencedUpdate(replyExecutionId, attemptId, {
            status: 'RETRYABLE_FAILURE',
            nextRetryAt,
            lastError: pubErr.message,
          });
        } else {
          this.logger.error(`Publish retries exhausted (${publishAttempt}/5): ${pubErr.message}`);
          await this.fencedUpdate(replyExecutionId, attemptId, {
            status: 'FAILED_PERMANENT',
            lastError: `Publish retries exhausted: ${pubErr.message}`,
          });
          await this.db.interaction.update({
            where: { id: interaction.id },
            data: { status: 'REVIEW_REQUIRED' },
          });
        }
      }
    } catch (err: any) {
      if (err instanceof FencingLeaseExpiredException) {
        this.logger.warn(err.message);
        return;
      }
      this.logger.error(`Unhandled error during reply publishing: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Helper executing a universal worker fenced update on ReplyExecution.
   */
  private async fencedUpdate(
    executionId: string,
    attemptId: string,
    data: {
      status: string;
      containerId?: string | null;
      containerCreatedAt?: Date | null;
      publishedThreadPostId?: string | null;
      publishedAt?: Date | null;
      hasExternalAmbiguity?: boolean;
      ambiguityType?: string | null;
      ambiguityDetectedAt?: Date | null;
      recoveryDeadlineAt?: Date | null;
      lastError?: string | null;
      nextRetryAt?: Date | null;
      quotaBlockedAt?: Date | null;
    },
  ): Promise<void> {
    const updated = await this.db.$executeRaw`
      UPDATE reply_executions
      SET status = ${data.status}::"ReplyExecutionStatus",
          container_id = COALESCE(${data.containerId ?? null}, container_id),
          container_created_at = COALESCE(${data.containerCreatedAt ?? null}, container_created_at),
          published_thread_post_id = COALESCE(${data.publishedThreadPostId ?? null}, published_thread_post_id),
          published_at = COALESCE(${data.publishedAt ?? null}, published_at),
          has_external_ambiguity = COALESCE(${data.hasExternalAmbiguity ?? false}, has_external_ambiguity),
          ambiguity_type = COALESCE(${data.ambiguityType ?? null}::"AmbiguityType", ambiguity_type),
          ambiguity_detected_at = COALESCE(${data.ambiguityDetectedAt ?? null}, ambiguity_detected_at),
          recovery_deadline_at = COALESCE(${data.recoveryDeadlineAt ?? null}, recovery_deadline_at),
          last_error = COALESCE(${data.lastError ?? null}, last_error),
          next_retry_at = ${data.nextRetryAt ?? null},
          quota_blocked_at = COALESCE(${data.quotaBlockedAt ?? null}, quota_blocked_at),
          lease_until = NOW() + INTERVAL '3 minutes',
          updated_at = NOW()
      WHERE id = ${executionId}::uuid
        AND attempt_id = ${attemptId}::uuid
        AND claimed_by = ${this.workerNodeId}
        AND lease_until > NOW();
    `;

    if (updated === 0) {
      throw new FencingLeaseExpiredException(executionId, data.status);
    }
  }
}

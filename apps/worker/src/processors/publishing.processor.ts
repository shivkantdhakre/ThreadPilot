import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient } from '@threadpilot/database';
import { QUEUES, PublishJobPayload, canonicalOutboundText } from '@threadpilot/types';
import { ThreadsApiError } from '@threadpilot/threads-client';
import { PublishingService } from '../services/publishing.service';
import { createHash, randomUUID } from 'crypto';

export class FencingTokenExpiredException extends Error {
  constructor(state: string) {
    super(`Fencing token expired or lost lease during state: ${state}. Execution halted.`);
    this.name = 'FencingTokenExpiredException';
  }
}

export type ErrorClassification =
  | { type: 'PERMANENT'; code: string; message: string }
  | { type: 'AUTH_REQUIRED'; code: string; message: string }
  | { type: 'RETRYABLE'; code: string; message: string }
  | { type: 'QUOTA_BLOCKED'; code: string; message: string };

export function classifyPublishError(err: any): ErrorClassification {
  if (err instanceof ThreadsApiError) {
    if (
      err.statusCode === 401 ||
      err.statusCode === 403 ||
      err.body?.includes('OAuthException') ||
      err.body?.includes('access token') ||
      err.body?.includes('permissions')
    ) {
      return { type: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED', message: err.message };
    }
    if (err.statusCode === 400) {
      return { type: 'PERMANENT', code: 'THREADS_BAD_REQUEST', message: err.message };
    }
    if (err.statusCode === 404) {
      return {
        type: 'PERMANENT',
        code: 'CONTAINER_NOT_FOUND',
        message: 'Media container not found on Threads platform',
      };
    }
    if (err.statusCode === 429 || err.statusCode >= 500) {
      return { type: 'RETRYABLE', code: 'THREADS_SERVER_ERROR', message: err.message };
    }
  }
  const msg = err?.message || '';
  if (
    msg.includes('revoked') ||
    msg.includes('expired') ||
    msg.includes('Token refresh failed') ||
    msg.includes('No access token')
  ) {
    return { type: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED', message: msg };
  }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return { type: 'RETRYABLE', code: 'NETWORK_TIMEOUT', message: 'Request timed out' };
  }
  return {
    type: 'RETRYABLE',
    code: 'INTERNAL_ERROR',
    message: err?.message || 'Unknown execution failure',
  };
}

@Processor(QUEUES.PUBLISH)
@Injectable()
export class PublishingProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishingProcessor.name);
  private readonly workerNodeId = `${process.env.HOSTNAME || 'worker'}-${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly publishingService: PublishingService,
    @Optional() private readonly db: PrismaClient = prisma,
  ) {
    super();
  }

  async process(job: Job<PublishJobPayload>): Promise<void> {
    const { scheduledPostId } = job.data;
    const attemptId = randomUUID();

    this.logger.log(
      `Processing publish job for scheduledPostId: ${scheduledPostId} [attempt: ${attemptId}]`,
    );

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: ATOMIC CAS CLAIM (Enforce attempt_count < 5 & Ambiguity Segregation)
    // ─────────────────────────────────────────────────────────────────────────
    const claimResult: Array<{
      previous_status: string;
      attempt_count: number;
      attempt_id: string;
    }> = await this.db.$queryRaw`
      WITH claimable AS (
        SELECT id, status AS previous_status, attempt_count
        FROM scheduled_posts
        WHERE id = ${scheduledPostId}::uuid
          AND (
            (status = 'SCHEDULED' AND attempt_count < 5)
            OR (
              status = 'FAILED_RETRYABLE'
              AND (next_retry_at IS NULL OR next_retry_at <= NOW())
              AND (attempt_count < 5 OR publish_requested_at IS NOT NULL OR ambiguity_detected_at IS NOT NULL)
            )
            OR (status = 'QUOTA_BLOCKED' AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
            OR (
              status IN ('CLAIMED', 'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING')
              AND lease_until < NOW()
              AND (attempt_count < 5 OR publish_requested_at IS NOT NULL OR ambiguity_detected_at IS NOT NULL)
            )
          )
        FOR UPDATE
      )
      UPDATE scheduled_posts sp
      SET status = 'CLAIMED',
          claimed_by = ${this.workerNodeId},
          claimed_at = NOW(),
          lease_until = NOW() + INTERVAL '90 seconds',
          attempt_id = ${attemptId}::uuid,
          updated_at = NOW()
      FROM claimable c
      WHERE sp.id = c.id
      RETURNING c.previous_status, sp.attempt_count, sp.attempt_id;
    `;

    const firstClaim = claimResult[0];
    if (claimResult.length === 0 || !firstClaim) {
      this.logger.log(
        `Could not claim scheduledPostId ${scheduledPostId}. Already executing, published, or cancelled.`,
      );
      return;
    }

    const {
      previous_status: previousStatus,
      attempt_count: initialAttemptCount,
    } = firstClaim;

    const claimedFromSchedule = previousStatus === 'SCHEDULED';

    const post = await this.db.scheduledPost.findUniqueOrThrow({
      where: { id: scheduledPostId },
    });

    // Declare hasPublishAmbiguity BEFORE try block so it remains in scope for execution and catch
    let hasPublishAmbiguity =
      !!post.publishRequestedAt || post.status === 'PUBLISHING' || !!post.ambiguityDetectedAt;

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // STEP 2: INITIAL DISPATCH LATENESS GUARD & MAX RETRY AGE/ATTEMPT POLICY
      // ─────────────────────────────────────────────────────────────────────────
      const MAX_EXECUTION_ATTEMPTS = 5;

      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const isInitialAttempt =
        claimedFromSchedule && initialAttemptCount === 0 && !hasPublishAmbiguity;
      const isSeverelyDelayedInitial = isInitialAttempt && post.scheduledAt < fifteenMinutesAgo;

      const maxRetryAgeReached =
        !hasPublishAmbiguity &&
        post.scheduledAt < new Date(Date.now() - 24 * 60 * 60 * 1000);
      const maxAttemptsReached =
        !hasPublishAmbiguity && post.attemptCount >= MAX_EXECUTION_ATTEMPTS;

      if (isSeverelyDelayedInitial || maxRetryAgeReached || maxAttemptsReached) {
        const terminalStatus =
          isSeverelyDelayedInitial || maxRetryAgeReached ? 'EXPIRED' : 'FAILED_PERMANENT';
        const errorCode = isSeverelyDelayedInitial
          ? 'SCHEDULE_EXPIRED'
          : maxRetryAgeReached
            ? 'MAX_AGE_EXCEEDED'
            : 'MAX_RETRIES_EXCEEDED';
        const errorMsg = isSeverelyDelayedInitial
          ? 'Initial execution delayed beyond 15m window before worker pickup'
          : maxRetryAgeReached
            ? 'Schedule exceeded maximum 24h retry lifetime'
            : `Exceeded maximum ${MAX_EXECUTION_ATTEMPTS} publishing retry attempts`;

        await this.db.$executeRaw`
          UPDATE scheduled_posts
          SET status = ${terminalStatus},
              last_error_code = ${errorCode},
              last_error_msg = ${errorMsg},
              claimed_by = NULL,
              lease_until = NULL,
              attempt_id = NULL,
              updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        return;
      }

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 3: TOKEN RESOLUTION & LIVE QUOTA GATE
      // ─────────────────────────────────────────────────────────────────────────
      const accessToken = await this.publishingService.tokenService.getValidToken(
        post.socialAccountId,
      );
      const quota = await this.publishingService.threadsApi.getPublishingLimit(accessToken);

      if (quota.quota_usage >= quota.config.quota_total) {
        const nextRetryAt = new Date(Date.now() + 15 * 60 * 1000);
        this.logger.warn(
          `Quota exhausted (${quota.quota_usage}/${quota.config.quota_total}). Marking QUOTA_BLOCKED.`,
        );

        await this.db.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'QUOTA_BLOCKED',
              last_quota_checked_at = NOW(),
              next_retry_at = ${nextRetryAt},
              claimed_by = NULL,
              lease_until = NULL,
              attempt_id = NULL,
              last_error_code = 'QUOTA_EXHAUSTED',
              last_error_msg = 'Publishing limit reached. Live quota re-evaluated on schedule without consuming execution attempts.',
              updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        return;
      }

      // Live quota is available. Enforce attempt cap before commencing execution
      if (!hasPublishAmbiguity && post.attemptCount >= MAX_EXECUTION_ATTEMPTS) {
        this.logger.error(
          `Exceeded maximum ${MAX_EXECUTION_ATTEMPTS} attempts for non-ambiguous post ${post.id}. Marking FAILED_PERMANENT.`,
        );
        await this.db.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'FAILED_PERMANENT',
              last_error_code = 'MAX_RETRIES_EXCEEDED',
              last_error_msg = ${`Exceeded maximum ${MAX_EXECUTION_ATTEMPTS} publishing execution attempts.`},
              claimed_by = NULL,
              lease_until = NULL,
              attempt_id = NULL,
              updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        return;
      }

      // Increment attempt_count and update last_attempt_at atomically
      const execStep = await this.db.$executeRaw`
        UPDATE scheduled_posts
        SET attempt_count = attempt_count + 1,
            last_attempt_at = NOW(),
            updated_at = NOW()
        WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
      `;
      if (execStep === 0) throw new FencingTokenExpiredException('EXECUTION_COMMENCEMENT');
      post.attemptCount += 1;

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 4: CONTAINER CREATION (3-Attempt Cap)
      // ─────────────────────────────────────────────────────────────────────────
      let containerId = post.containerId;

      if (!containerId) {
        if (post.containerCreateAttempts >= 3) {
          this.logger.error(
            `Exceeded maximum 3 container creation attempts for post ${post.id}`,
          );
          await this.db.$executeRaw`
            UPDATE scheduled_posts
            SET status = 'FAILED_PERMANENT',
                last_error_code = 'CONTAINER_CREATION_FAILED',
                last_error_msg = 'Exceeded maximum 3 container creation attempts without platform acknowledgment.',
                claimed_by = NULL,
                lease_until = NULL,
                attempt_id = NULL,
                updated_at = NOW()
            WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
          `;
          return;
        }

        const step1 = await this.db.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'CREATING_CONTAINER',
              container_create_attempts = container_create_attempts + 1,
              lease_until = NOW() + INTERVAL '90 seconds',
              updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        if (step1 === 0) throw new FencingTokenExpiredException('CREATING_CONTAINER');

        const snapshot = post.contentSnapshot as { body: string };
        const outboundText = canonicalOutboundText(snapshot.body);
        const container = await this.publishingService.threadsApi.createTextContainer(
          accessToken,
          outboundText,
        );
        containerId = container.id;

        const step2 = await this.db.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'CONTAINER_CREATED',
              container_id = ${containerId},
              lease_until = NOW() + INTERVAL '90 seconds',
              updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        if (step2 === 0) throw new FencingTokenExpiredException('CONTAINER_CREATED');
      }

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 5: CONTAINER READINESS POLLING & AMBIGUITY CHECKPOINT
      // ─────────────────────────────────────────────────────────────────────────
      let isReady = false;
      let isAlreadyPublished = false;
      let ambiguityReferenceTime: Date | null =
        post.publishRequestedAt ?? post.ambiguityDetectedAt ?? null;

      for (let attempt = 1; attempt <= 5; attempt++) {
        const hb = await this.db.$executeRaw`
          UPDATE scheduled_posts
          SET lease_until = NOW() + INTERVAL '90 seconds', updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        if (hb === 0) throw new FencingTokenExpiredException('POLLING_HEARTBEAT');

        let statusResponse: { status: string; error_message?: string } | null = null;
        try {
          statusResponse = await this.publishingService.threadsApi.getContainerStatus(
            accessToken,
            containerId,
          );
        } catch (containerErr: any) {
          if (hasPublishAmbiguity) {
            this.logger.warn(
              `Container status query failed (${containerErr?.message || containerErr}), but publish ambiguity exists. Bypassing container error to proceed to feed recovery.`,
            );
            break;
          }
          throw containerErr;
        }

        if (!statusResponse) break;

        if (statusResponse.status === 'PUBLISHED') {
          isAlreadyPublished = true;
          hasPublishAmbiguity = true;
          ambiguityReferenceTime ??= new Date();
          post.ambiguityDetectedAt = ambiguityReferenceTime;
          await this.db.$executeRaw`
            UPDATE scheduled_posts
            SET ambiguity_detected_at = COALESCE(ambiguity_detected_at, ${ambiguityReferenceTime}), updated_at = NOW()
            WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
          `;
          break;
        }
        if (statusResponse.status === 'FINISHED') {
          isReady = true;
          break;
        }
        if (statusResponse.status === 'ERROR' || statusResponse.status === 'EXPIRED') {
          if (hasPublishAmbiguity) {
            this.logger.warn(
              `Container reported ${statusResponse.status}, but publish ambiguity already exists. Bypassing container error to proceed to feed recovery.`,
            );
            break;
          }

          if (statusResponse.status === 'ERROR') {
            await this.db.$executeRaw`
              UPDATE scheduled_posts
              SET status = 'FAILED_PERMANENT',
                  last_error_code = 'CONTAINER_ERROR',
                  last_error_msg = ${statusResponse.error_message || 'Container processing error'},
                  claimed_by = NULL,
                  lease_until = NULL,
                  attempt_id = NULL,
                  updated_at = NOW()
              WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
            `;
            return;
          }

          if (statusResponse.status === 'EXPIRED') {
            if (!hasPublishAmbiguity && post.attemptCount >= MAX_EXECUTION_ATTEMPTS) {
              this.logger.error(
                `Container EXPIRED and maximum ${MAX_EXECUTION_ATTEMPTS} attempts reached for non-ambiguous post ${post.id}. Marking FAILED_PERMANENT.`,
              );
              await this.db.$executeRaw`
                UPDATE scheduled_posts
                SET status = 'FAILED_PERMANENT',
                    container_id = NULL,
                    last_error_code = 'CONTAINER_EXPIRED_MAX_RETRIES',
                    last_error_msg = ${`Threads container expired (>24h) and maximum retry attempts (${MAX_EXECUTION_ATTEMPTS}) reached.`},
                    claimed_by = NULL,
                    lease_until = NULL,
                    attempt_id = NULL,
                    updated_at = NOW()
                WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
              `;
              return;
            }

            const backoffSeconds = Math.min(30 * Math.pow(2, post.attemptCount), 900);
            const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
            await this.db.$executeRaw`
              UPDATE scheduled_posts
              SET status = 'FAILED_RETRYABLE',
                  container_id = NULL,
                  next_retry_at = ${nextRetryAt},
                  last_error_code = 'CONTAINER_EXPIRED',
                  last_error_msg = 'Threads container expired (>24h). Refreshing on next retry.',
                  claimed_by = NULL,
                  lease_until = NULL,
                  attempt_id = NULL,
                  updated_at = NOW()
              WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
            `;
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 3000));
      }

      if (!isReady && !isAlreadyPublished) {
        if (hasPublishAmbiguity) {
          this.logger.warn(
            `Container ${containerId} did not reach FINISHED state, but publish ambiguity exists. Proceeding directly to feed recovery.`,
          );
        } else {
          throw new Error(
            `Container ${containerId} did not reach FINISHED state within polling window`,
          );
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 6: PUBLISHING & AMBIGUOUS RECOVERY (45s Wall-Clock Deadline)
      // ─────────────────────────────────────────────────────────────────────────
      let finalThreadsPostId: string | null = null;
      let platformTimestamp: Date | null = null;

      const hasPriorPublishAttempt = !!post.publishRequestedAt;
      const publishAttemptUuid = randomUUID();

      if (hasPriorPublishAttempt || isAlreadyPublished || hasPublishAmbiguity) {
        const recoveryDeadline = Date.now() + 45_000;
        this.logger.warn(
          `Entering 45s wall-clock ambiguity recovery deadline for post ${post.id}`,
        );
        const referenceTime = ambiguityReferenceTime ?? new Date();

        while (Date.now() < recoveryDeadline) {
          const remainingBudgetMs = recoveryDeadline - Date.now();
          if (remainingBudgetMs <= 0) break;

          const hb = await this.db.$executeRaw`
            UPDATE scheduled_posts
            SET lease_until = NOW() + INTERVAL '90 seconds', updated_at = NOW()
            WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
          `;
          if (hb === 0) throw new FencingTokenExpiredException('RECOVERY_HEARTBEAT');

          const recovered = await this.recoverFromFeed(
            accessToken,
            post.contentHash,
            referenceTime,
            recoveryDeadline,
          );
          if (recovered) {
            finalThreadsPostId = recovered.id;
            platformTimestamp = recovered.timestamp;
            break;
          }

          const postFeedRemainingMs = recoveryDeadline - Date.now();
          if (postFeedRemainingMs <= 0) break;

          const containerTimeoutMs = Math.min(8000, postFeedRemainingMs);
          const checkStatus = await this.publishingService.threadsApi
            .getContainerStatus(accessToken, containerId, { timeoutMs: containerTimeoutMs })
            .catch(() => null);
          if (checkStatus?.status === 'PUBLISHED') {
            isAlreadyPublished = true;
          }

          const sleepMs = Math.min(5000, Math.max(0, recoveryDeadline - Date.now()));
          if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
        }

        if (!finalThreadsPostId) {
          this.logger.error(
            `Ambiguous publish unconfirmed after 45s deadline for post ${post.id}. Marking RECOVERY_REQUIRED.`,
          );
          await this.db.$executeRaw`
            UPDATE scheduled_posts
            SET status = 'RECOVERY_REQUIRED',
                last_error_code = 'AMBIGUOUS_PUBLISH_UNCONFIRMED',
                last_error_msg = 'Publish was attempted or container reported PUBLISHED, but post ID could not be confirmed after 45s.',
                claimed_by = NULL,
                lease_until = NULL,
                attempt_id = NULL,
                updated_at = NOW()
            WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
          `;
          return;
        }
      }

      // True First Attempt
      if (!finalThreadsPostId) {
        const publishRequestedAt = new Date();
        const stepPublishing = await this.db.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'PUBLISHING',
              publish_requested_at = ${publishRequestedAt},
              publish_attempt_id = ${publishAttemptUuid}::uuid,
              lease_until = NOW() + INTERVAL '90 seconds',
              updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        if (stepPublishing === 0) throw new FencingTokenExpiredException('PUBLISHING');

        hasPublishAmbiguity = true;
        post.publishRequestedAt = publishRequestedAt;
        post.status = 'PUBLISHING';

        try {
          const pubRes = await this.publishingService.threadsApi.publishContainer(
            accessToken,
            containerId,
          );
          finalThreadsPostId = pubRes.id;
        } catch (publishErr: any) {
          ambiguityReferenceTime ??= new Date();
          hasPublishAmbiguity = true;
          post.ambiguityDetectedAt = ambiguityReferenceTime;
          await this.db.$executeRaw`
            UPDATE scheduled_posts
            SET ambiguity_detected_at = COALESCE(ambiguity_detected_at, ${ambiguityReferenceTime}), updated_at = NOW()
            WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
          `.catch(() => {});

          const recoveryDeadline = Date.now() + 45_000;
          this.logger.warn(
            `publishContainer failed (${publishErr?.message || publishErr}). Entering immediate 45s wall-clock ambiguity recovery loop for post ${post.id}`,
          );

          while (Date.now() < recoveryDeadline) {
            const remainingBudgetMs = recoveryDeadline - Date.now();
            if (remainingBudgetMs <= 0) break;

            const hb = await this.db.$executeRaw`
              UPDATE scheduled_posts
              SET lease_until = NOW() + INTERVAL '90 seconds', updated_at = NOW()
              WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
            `;
            if (hb === 0) throw new FencingTokenExpiredException('RECOVERY_HEARTBEAT');

            const recovered = await this.recoverFromFeed(
              accessToken,
              post.contentHash,
              publishRequestedAt,
              recoveryDeadline,
            );
            if (recovered) {
              finalThreadsPostId = recovered.id;
              platformTimestamp = recovered.timestamp;
              break;
            }

            const postFeedRemainingMs = recoveryDeadline - Date.now();
            if (postFeedRemainingMs <= 0) break;

            const containerTimeoutMs = Math.min(8000, postFeedRemainingMs);
            const checkStatus = await this.publishingService.threadsApi
              .getContainerStatus(accessToken, containerId, { timeoutMs: containerTimeoutMs })
              .catch(() => null);
            if (checkStatus?.status === 'PUBLISHED') {
              isAlreadyPublished = true;
            }

            const sleepMs = Math.min(5000, Math.max(0, recoveryDeadline - Date.now()));
            if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
          }

          if (!finalThreadsPostId) {
            this.logger.error(
              `Ambiguous publish unconfirmed after 45s deadline for post ${post.id}. Quarantining to RECOVERY_REQUIRED.`,
            );
            await this.db.$executeRaw`
              UPDATE scheduled_posts
              SET status = 'RECOVERY_REQUIRED',
                  last_error_code = 'AMBIGUOUS_PUBLISH_UNCONFIRMED',
                  last_error_msg = 'Publish request was dispatched to Meta, but post could not be confirmed in feed after 45s.',
                  claimed_by = NULL,
                  lease_until = NULL,
                  attempt_id = NULL,
                  updated_at = NOW()
              WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
            `;
            return;
          }
        }

        // Best-effort platform timestamp enrichment
        try {
          for (let pRetry = 1; pRetry <= 3; pRetry++) {
            try {
              const postDetails = await this.publishingService.threadsApi.getPost(
                accessToken,
                finalThreadsPostId,
              );
              if (!postDetails.timestamp) continue;
              const ts = new Date(postDetails.timestamp);
              if (Number.isFinite(ts.getTime())) {
                platformTimestamp = ts;
                break;
              }
            } catch (enrichErr) {
              this.logger.warn(
                `Post-publish timestamp enrichment attempt ${pRetry} failed: ${enrichErr}`,
              );
              if (pRetry < 3) await new Promise((r) => setTimeout(r, pRetry * 500));
            }
          }
        } catch (err) {
          this.logger.warn(
            `Failed to enrich platform timestamp for published post ${finalThreadsPostId}: ${err}`,
          );
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 7: ATOMIC TERMINAL COMMIT
      // ─────────────────────────────────────────────────────────────────────────
      const publishedObservedAt = new Date();

      await this.db.$transaction(async (tx) => {
        const term = await tx.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'PUBLISHED',
              published_at = ${platformTimestamp},
              published_observed_at = ${publishedObservedAt},
              claimed_by = NULL,
              lease_until = NULL,
              attempt_id = NULL,
              updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        if (term === 0) throw new FencingTokenExpiredException('TERMINAL_COMMIT');

        const publishedPost = await tx.publishedPost.create({
          data: {
            workspaceId: post.workspaceId,
            socialAccountId: post.socialAccountId,
            draftId: post.draftId,
            publishedVersionId: post.contentVersionId,
            threadsPostId: finalThreadsPostId!,
            publishedAt: platformTimestamp,
            publishedObservedAt,
          },
        });

        await tx.threadPost.upsert({
          where: {
            socialAccountId_threadsPostId: {
              socialAccountId: post.socialAccountId,
              threadsPostId: finalThreadsPostId!,
            },
          },
          create: {
            socialAccountId: post.socialAccountId,
            threadsPostId: finalThreadsPostId!,
            text: (post.contentSnapshot as any).body,
            mediaType: 'TEXT',
            postedAt: platformTimestamp,
            postedObservedAt: publishedObservedAt,
            isOurs: true,
            sourceType: 'PUBLISHED',
            publishedPostId: publishedPost.id,
          },
          update: {
            text: (post.contentSnapshot as any).body,
            mediaType: 'TEXT',
            isOurs: true,
            sourceType: 'PUBLISHED',
            publishedPostId: publishedPost.id,
            postedAt: platformTimestamp,
            postedObservedAt: publishedObservedAt,
          },
        });

        await tx.contentDraft.update({
          where: { id: post.draftId },
          data: { status: 'ARCHIVED' },
        });

        await tx.eventOutbox.create({
          data: {
            workspaceId: post.workspaceId,
            eventType: 'POST_PUBLISHED',
            payload: {
              scheduledPostId: post.id,
              draftId: post.draftId,
              threadsPostId: finalThreadsPostId!,
              socialAccountId: post.socialAccountId,
              publishedAt: platformTimestamp?.toISOString() || null,
              publishedObservedAt: publishedObservedAt.toISOString(),
            },
          },
        });

        await tx.auditLog.create({
          data: {
            workspaceId: post.workspaceId,
            action: 'POST_PUBLISHED',
            entityType: 'ScheduledPost',
            entityId: post.id,
            output: {
              threadsPostId: finalThreadsPostId!,
              platformTimestamp: platformTimestamp?.toISOString() || null,
            },
            result: 'PUBLISHED',
          },
        });
      });

      this.logger.log(
        `Successfully published scheduled post ${post.id} (Threads post: ${finalThreadsPostId})`,
      );
    } catch (err: any) {
      if (err instanceof FencingTokenExpiredException) {
        this.logger.error(`Aborting execution: ${err.message}`);
        return;
      }

      if (err.message?.includes('AMBIGUOUS_FEED_MATCH')) {
        this.logger.error(
          `Multiple duplicate matching posts detected for ${post.id}. Marking RECOVERY_REQUIRED.`,
        );
        await this.db.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'RECOVERY_REQUIRED',
              last_error_code = 'AMBIGUOUS_FEED_MATCH',
              last_error_msg = ${err.message},
              claimed_by = NULL,
              lease_until = NULL,
              attempt_id = NULL,
              updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        return;
      }

      // Safe ambiguity check: hasPublishAmbiguity is in scope
      const isAmbiguous =
        hasPublishAmbiguity ||
        !!post.publishRequestedAt ||
        post.status === 'PUBLISHING' ||
        !!post.ambiguityDetectedAt;

      const classified = classifyPublishError(err);
      this.logger.error(`Publishing error classified as ${classified.type}: ${classified.message}`);

      if (classified.type === 'PERMANENT') {
        if (isAmbiguous) {
          this.logger.error(
            `Permanent platform error (${classified.code}) received, but post ${post.id} has publish ambiguity! Marking RECOVERY_REQUIRED instead of FAILED_PERMANENT.`,
          );
          await this.db.$executeRaw`
            UPDATE scheduled_posts
            SET status = 'RECOVERY_REQUIRED',
                last_error_code = ${classified.code},
                last_error_msg = ${`Ambiguous publication encountered permanent error: ${classified.message}`},
                claimed_by = NULL,
                lease_until = NULL,
                attempt_id = NULL,
                updated_at = NOW()
            WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
          `;
          return;
        }

        const updated = await this.db.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'FAILED_PERMANENT',
              last_error_code = ${classified.code},
              last_error_msg = ${classified.message},
              claimed_by = NULL,
              lease_until = NULL,
              attempt_id = NULL,
              updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        if (updated === 0) {
          this.logger.warn(`Could not set FAILED_PERMANENT: lease lost or reclaimed by another worker`);
          return;
        }
      } else if (classified.type === 'AUTH_REQUIRED') {
        const updated = await this.db.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'AUTH_REQUIRED',
              last_error_code = ${classified.code},
              last_error_msg = ${classified.message},
              claimed_by = NULL,
              lease_until = NULL,
              attempt_id = NULL,
              updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        if (updated === 0) {
          this.logger.warn(`Could not set AUTH_REQUIRED: lease lost or reclaimed by another worker`);
          return;
        }
        await this.db.notification.create({
          data: {
            workspaceId: post.workspaceId,
            type: 'ACCOUNT_DISCONNECTED',
            title: 'Action Required: Reconnect Threads Account',
            body: `Publishing failed because your Threads authorization has expired or was revoked.`,
            entityType: 'social_account',
            entityId: post.socialAccountId,
          },
        });
      } else {
        const MAX_RETRY_ATTEMPTS = 5;
        if (post.attemptCount >= MAX_RETRY_ATTEMPTS && !isAmbiguous) {
          this.logger.error(
            `Exceeded maximum ${MAX_RETRY_ATTEMPTS} attempts for non-ambiguous post ${post.id}. Marking FAILED_PERMANENT.`,
          );
          const updated = await this.db.$executeRaw`
            UPDATE scheduled_posts
            SET status = 'FAILED_PERMANENT',
                last_error_code = 'MAX_RETRIES_EXCEEDED',
                last_error_msg = ${`Exceeded maximum ${MAX_RETRY_ATTEMPTS} publishing retry attempts. Last error: ${classified.message}`},
                claimed_by = NULL,
                lease_until = NULL,
                attempt_id = NULL,
                updated_at = NOW()
            WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
          `;
          if (updated === 0) {
            this.logger.warn(`Could not set FAILED_PERMANENT: lease lost or reclaimed by another worker`);
          }
          return;
        }

        const backoffSeconds = Math.min(30 * Math.pow(2, post.attemptCount), 900);
        const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);

        const updated = await this.db.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'FAILED_RETRYABLE',
              next_retry_at = ${nextRetryAt},
              last_error_code = ${classified.code},
              last_error_msg = ${classified.message},
              claimed_by = NULL,
              lease_until = NULL,
              attempt_id = NULL,
              updated_at = NOW()
          WHERE id = ${post.id}::uuid AND attempt_id = ${attemptId}::uuid AND lease_until > NOW()
        `;
        if (updated === 0) {
          this.logger.warn(`Could not set FAILED_RETRYABLE: lease lost or reclaimed by another worker`);
          return;
        }
      }
    }
  }

  private async recoverFromFeed(
    accessToken: string,
    expectedHash: string,
    referenceTime: Date,
    deadlineTimestamp: number,
  ): Promise<{ id: string; timestamp: Date } | null> {
    const searchSince = new Date(referenceTime.getTime() - 4 * 60 * 1000);
    const searchUntil = new Date(referenceTime.getTime() + 4 * 60 * 1000);
    let cursor: string | undefined;
    let pageCount = 0;
    const maxPages = 3;
    const candidates: Array<{ id: string; timestamp: Date }> = [];

    try {
      while (pageCount < maxPages) {
        const remainingBudgetMs = deadlineTimestamp - Date.now();
        if (remainingBudgetMs <= 0) break;

        pageCount++;
        const requestTimeoutMs = Math.min(8000, remainingBudgetMs);

        const feed = await this.publishingService.threadsApi.getUserPosts(accessToken, {
          limit: 50,
          since: searchSince,
          until: searchUntil,
          cursor,
          timeoutMs: requestTimeoutMs,
        });

        for (const p of feed.data) {
          if (p.text && p.media_type === 'TEXT_POST') {
            const hash = createHash('sha256')
              .update(canonicalOutboundText(p.text))
              .digest('hex');
            if (hash === expectedHash) {
              const postDate = new Date(p.timestamp);
              if (
                Number.isFinite(postDate.getTime()) &&
                Math.abs(postDate.getTime() - referenceTime.getTime()) <= 180_000
              ) {
                candidates.push({ id: p.id, timestamp: postDate });
              }
            }
          }
        }

        cursor = feed.paging?.cursors?.after;
        if (!cursor || feed.data.length === 0) break;
        const lastFeedItem = feed.data[feed.data.length - 1];
        if (!lastFeedItem) break;
        const oldestInPage = new Date(lastFeedItem.timestamp);
        if (oldestInPage < searchSince) break;
      }
    } catch (feedErr) {
      this.logger.warn(`Could not query /me/threads during recovery: ${feedErr}`);
    }

    if (candidates.length === 1 && candidates[0]) {
      return candidates[0];
    }
    if (candidates.length > 1) {
      this.logger.error(
        `Feed recovery found ${candidates.length} duplicate matching posts within ±3m acceptance window. Refusing auto-adoption.`,
      );
      throw new Error(
        `AMBIGUOUS_FEED_MATCH: Multiple identical posts (${candidates.length}) detected within recovery window.`,
      );
    }

    return null;
  }
}

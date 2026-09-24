import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createHash, randomUUID } from 'crypto';
import { prisma, PrismaClient, ScheduledPost, ScheduledPostDispatch } from '@threadpilot/database';
import {
  QUEUES,
  PublishJobPayload,
  canonicalOutboundText,
  canonicalRequestFingerprint,
  ThreadsApiPost,
  ScheduleDraftDto,
  ResolveScheduleDto,
} from '@threadpilot/types';
import {
  ThreadsApiClient,
  ThreadsApiError,
  ThreadsTokenService,
  TokenEncryptionService,
} from '@threadpilot/threads-client';
import { JobDispatcherService } from '../jobs/job-dispatcher.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';

export const PUBLISH_JOB_OPTIONS = {
  removeOnComplete: 100,
  removeOnFail: 500,
} as const;

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);
  private readonly tokenService: ThreadsTokenService;
  private readonly threadsApi: ThreadsApiClient;
  private readonly db: PrismaClient;

  constructor(
    private readonly jobDispatcher: JobDispatcherService,
    @InjectQueue(QUEUES.PUBLISH) private readonly publishQueue: Queue<PublishJobPayload>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    @Optional() dbClient?: PrismaClient,
  ) {
    this.db = (dbClient || prisma) as PrismaClient;

    const encKey = this.config.get<string>('TOKEN_ENCRYPTION_KEY', 'CHANGE_ME_32_BYTE_BASE64_KEY');
    const encVersion = Number(this.config.get<number>('TOKEN_ENCRYPTION_KEY_VERSION', 1));
    const encryption = new TokenEncryptionService(encKey, encVersion);

    const redisAdapter = {
      set: async (key: string, value: string, options: { nx?: boolean; ex?: number }) => {
        if (options.nx) {
          return this.redis.set(key, value, 'EX', options.ex ?? 30, 'NX');
        }
        if (options.ex) {
          return this.redis.set(key, value, 'EX', options.ex);
        }
        return this.redis.set(key, value);
      },
      del: (key: string) => this.redis.del(key),
      get: (key: string) => this.redis.get(key),
    };

    const apiBaseUrl = this.config.get<string>('THREADS_API_BASE_URL', 'https://graph.threads.net/v1.0');
    const appId = this.config.get<string>('THREADS_APP_ID', '');
    const appSecret = this.config.get<string>('THREADS_APP_SECRET', '');

    this.tokenService = new ThreadsTokenService(
      this.db,
      encryption,
      redisAdapter,
      apiBaseUrl,
      appId,
      appSecret,
    );

    this.threadsApi = new ThreadsApiClient(apiBaseUrl);
  }

  async listDrafts(
    workspaceId: string,
    options?: { status?: string; page?: number; limit?: number },
  ): Promise<{ data: any[]; meta: { total: number; page: number; limit: number; hasMore: boolean } }> {
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : 20;
    const skip = (page - 1) * limit;

    const where = {
      workspaceId,
      ...(options?.status ? { status: options.status } : {}),
    };

    const [total, drafts] = await Promise.all([
      this.db.contentDraft.count({ where }),
      this.db.contentDraft.findMany({
        where,
        include: {
          versions: {
            orderBy: { version: 'desc' },
          },
          idea: true,
          scheduledPosts: {
            orderBy: { scheduledAt: 'desc' },
            take: 5,
          },
          publishedPosts: {
            orderBy: { publishedAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: drafts.map((d) => {
        const latestVersion = d.versions[0] ?? null;
        return {
          id: d.id,
          workspaceId: d.workspaceId,
          ideaId: d.ideaId,
          topic: d.idea?.topic ?? null,
          format: d.idea?.format ?? null,
          status: d.status,
          generatedBy: d.generatedBy,
          promptVersion: d.promptVersion,
          profileVersion: d.profileVersion,
          editedByUser: d.editedByUser,
          currentVersion: latestVersion
            ? {
                id: latestVersion.id,
                draftId: latestVersion.draftId,
                version: latestVersion.version,
                body: latestVersion.body,
                hook: latestVersion.hook,
                cta: latestVersion.cta,
                editedBy: latestVersion.editedBy,
                diffSummary: latestVersion.diffSummary,
                createdAt: latestVersion.createdAt.toISOString(),
              }
            : null,
          versionsCount: d.versions.length,
          scheduledPosts: d.scheduledPosts,
          publishedPosts: d.publishedPosts,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        };
      }),
      meta: {
        total,
        page,
        limit,
        hasMore: skip + drafts.length < total,
      },
    };
  }

  async getDraft(workspaceId: string, id: string): Promise<any> {
    const draft = await this.db.contentDraft.findFirst({
      where: { id, workspaceId },
      include: {
        versions: {
          orderBy: { version: 'asc' },
        },
        idea: true,
        scheduledPosts: {
          orderBy: { scheduledAt: 'desc' },
        },
        publishedPosts: {
          orderBy: { publishedAt: 'desc' },
        },
      },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${id} not found in workspace`);
    }

    return draft;
  }

  async createDraft(
    workspaceId: string,
    userId: string,
    data: {
      body: string;
      hook?: string;
      cta?: string;
      ideaId?: string;
    },
  ) {
    return this.db.$transaction(async (tx: any) => {
      const draft = await tx.contentDraft.create({
        data: {
          workspaceId,
          ideaId: data.ideaId ?? null,
          status: 'DRAFT',
          editedByUser: true,
          generatedBy: 'manual',
          versions: {
            create: [
              {
                version: 1,
                body: data.body,
                hook: data.hook ?? null,
                cta: data.cta ?? null,
                editedBy: userId,
                diffSummary: 'Initial manual draft',
              },
            ],
          },
        },
        include: {
          versions: true,
        },
      });

      return {
        ...draft,
        currentVersion: draft.versions[0] ?? null,
      };
    });
  }

  async updateDraft(
    workspaceId: string,
    id: string,
    data: {
      status?: string;
    },
  ) {
    const draft = await this.db.contentDraft.findFirst({
      where: { id, workspaceId },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${id} not found`);
    }

    return this.db.contentDraft.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status } : {}),
      },
    });
  }

  async createVersion(
    workspaceId: string,
    draftId: string,
    userId: string,
    data: {
      body: string;
      hook?: string;
      cta?: string;
      diffSummary?: string;
    },
  ) {
    const draft = await this.db.contentDraft.findFirst({
      where: { id: draftId, workspaceId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${draftId} not found`);
    }

    const nextVersionNum = (draft.versions[0]?.version ?? 1) + 1;

    return this.db.$transaction(async (tx: any) => {
      const version = await tx.contentVersion.create({
        data: {
          draftId,
          version: nextVersionNum,
          body: data.body,
          hook: data.hook ?? null,
          cta: data.cta ?? null,
          editedBy: userId,
          diffSummary: data.diffSummary ?? `Manual edit v${nextVersionNum}`,
        },
      });

      await tx.contentDraft.update({
        where: { id: draftId },
        data: {
          editedByUser: true,
        },
      });

      return version;
    });
  }

  async listVersions(workspaceId: string, draftId: string) {
    const draft = await this.db.contentDraft.findFirst({
      where: { id: draftId, workspaceId },
      select: { id: true },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${draftId} not found`);
    }

    const versions = await this.db.contentVersion.findMany({
      where: { draftId },
      orderBy: { version: 'asc' },
    });

    return { versions };
  }

  async deleteDraft(workspaceId: string, id: string) {
    const draft = await this.db.contentDraft.findFirst({
      where: { id, workspaceId },
      include: {
        scheduledPosts: true,
        publishedPosts: true,
      },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${id} not found`);
    }

    if (
      draft.publishedPosts.length > 0 ||
      draft.scheduledPosts.some((sp) => sp.status === 'PUBLISHED')
    ) {
      throw new ConflictException(
        'Cannot delete draft that has already been published. Please archive it instead.',
      );
    }

    const activeStatuses = [
      'SCHEDULED',
      'CLAIMED',
      'CREATING_CONTAINER',
      'CONTAINER_CREATED',
      'PUBLISHING',
      'QUOTA_BLOCKED',
      'FAILED_RETRYABLE',
      'RECOVERY_REQUIRED',
    ];
    const hasActiveSchedule = draft.scheduledPosts.some((sp) =>
      activeStatuses.includes(sp.status),
    );
    if (hasActiveSchedule) {
      throw new ConflictException(
        'Cannot delete draft with active or pending scheduled posts. Please cancel or resolve scheduled posts first.',
      );
    }

    const scheduleIds = draft.scheduledPosts.map((sp) => sp.id);

    // Clean up any remaining BullMQ jobs for terminal schedules
    if (this.publishQueue && scheduleIds.length > 0) {
      for (const spId of scheduleIds) {
        const jobIdsToRemove = [
          `publish-${spId}`,
          ...Array.from({ length: 6 }, (_, i) => `publish-${spId}-retry-${i}`),
          ...Array.from({ length: 6 }, (_, i) => `publish-${spId}-reclaim-${i}`),
        ];
        for (const jid of jobIdsToRemove) {
          try {
            const job = await this.publishQueue.getJob(jid);
            if (job) await job.remove();
          } catch {
            // Non-blocking cleanup
          }
        }
      }
    }

    await this.db.$transaction(async (tx: any) => {
      if (scheduleIds.length > 0) {
        await tx.scheduledPostDispatch.deleteMany({
          where: { scheduledPostId: { in: scheduleIds } },
        });
        await tx.scheduledPost.deleteMany({
          where: { id: { in: scheduleIds } },
        });
      }
      await tx.contentVersion.deleteMany({
        where: { draftId: id },
      });
      await tx.contentDraft.delete({
        where: { id },
      });
    });

    return { success: true };
  }

  async generate(
    workspaceId: string,
    userId: string,
    payload: {
      ideaId?: string;
      topic?: string;
      format?: string;
      tone?: string;
      additionalContext?: string;
    },
  ) {
    const requestId = randomUUID();

    await this.jobDispatcher.dispatchContentGeneration({
      requestId,
      workspaceId,
      requestedBy: userId,
      ...(payload.ideaId ? { ideaId: payload.ideaId } : {}),
      ...(payload.topic ? { topic: payload.topic } : {}),
      ...(payload.format ? { format: payload.format } : {}),
      ...(payload.tone ? { tone: payload.tone } : {}),
      ...(payload.additionalContext ? { additionalContext: payload.additionalContext } : {}),
    });

    return { requestId };
  }

  async improve(
    workspaceId: string,
    payload: {
      draftId: string;
      versionId: string;
      instruction: string;
    },
  ) {
    const draft = await this.db.contentDraft.findFirst({
      where: { id: payload.draftId, workspaceId },
      include: {
        versions: true,
      },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${payload.draftId} not found`);
    }

    const version = draft.versions.find((v) => v.id === payload.versionId);
    if (!version) {
      throw new NotFoundException(`Version ${payload.versionId} not found for draft`);
    }

    const requestId = randomUUID();

    await this.jobDispatcher.dispatchContentImprovement({
      requestId,
      workspaceId,
      draftId: payload.draftId,
      versionId: payload.versionId,
      instruction: payload.instruction,
    });

    return { requestId };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PHASE 2 SCHEDULING & RESOLUTION
  // ───────────────────────────────────────────────────────────────────────────

  async scheduleDraft(
    workspaceId: string,
    draftId: string,
    dto: ScheduleDraftDto,
  ): Promise<any> {
    // Explicit UTC Instant & Timezone Validation Contract (Offset-Aware Regex)
    const ISO_OFFSET_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
    if (!ISO_OFFSET_REGEX.test(dto.scheduledAt)) {
      throw new BadRequestException(
        'scheduledAt must be a fully-qualified ISO-8601 string with an explicit UTC (Z) or offset indicator (e.g. 2026-09-21T15:30:00Z or 2026-09-21T15:30:00+05:30)',
      );
    }
    const scheduledDate = new Date(dto.scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid ISO-8601 timestamp string');
    }
    if (scheduledDate.getTime() <= Date.now()) {
      throw new BadRequestException('Scheduled time must be in the future');
    }
    try {
      Intl.DateTimeFormat(undefined, { timeZone: dto.timezone });
    } catch {
      throw new BadRequestException(`Invalid IANA timezone identifier: ${dto.timezone}`);
    }

    const account = await this.db.socialAccount.findFirst({
      where: { id: dto.socialAccountId, workspaceId, isConnected: true },
    });
    if (!account) {
      throw new BadRequestException('Social account not found or does not belong to this workspace');
    }

    const idempotencyKey = dto.idempotencyKey || randomUUID();

    const draft = await this.db.contentDraft.findFirst({
      where: { id: draftId, workspaceId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    // Multi-Account Draft Reuse Support:
    // Allow scheduling drafts that are READY or ARCHIVED (e.g. cross-posting an already-published draft to another Threads account)
    if (!draft || !['READY', 'ARCHIVED'].includes(draft.status)) {
      throw new BadRequestException('Draft must exist and have status READY or ARCHIVED to be scheduled');
    }
    const latestVersion = draft.versions[0];
    if (!latestVersion) {
      throw new BadRequestException('Draft has no content versions');
    }

    // Multi-Account Uniqueness: Cannot schedule or re-publish the same draft to the same Threads account
    const alreadyPublished = await this.db.publishedPost.findUnique({
      where: {
        draftId_socialAccountId: {
          draftId,
          socialAccountId: dto.socialAccountId,
        },
      },
    });
    if (alreadyPublished) {
      throw new ConflictException('Draft has already been published to this Threads account');
    }

    // Ensure no competing active schedule exists for this draft on this social account
    const activeSchedule = await this.db.scheduledPost.findFirst({
      where: {
        draftId,
        socialAccountId: dto.socialAccountId,
        status: {
          in: [
            'SCHEDULED',
            'CLAIMED',
            'CREATING_CONTAINER',
            'CONTAINER_CREATED',
            'PUBLISHING',
            'QUOTA_BLOCKED',
            'FAILED_RETRYABLE',
            'RECOVERY_REQUIRED',
          ],
        },
      },
    });
    if (activeSchedule) {
      throw new ConflictException(
        `Draft already has an active schedule for this Threads account (status: ${activeSchedule.status}). Please resolve, complete, or cancel it before rescheduling.`,
      );
    }

    // Exact Canonical Outbound Text Contract: body is exact outbound text; hook & cta are metadata
    const canonicalBody = canonicalOutboundText(latestVersion.body);
    const contentSnapshot = {
      body: canonicalBody,
      hook: latestVersion.hook,
      cta: latestVersion.cta,
    };
    const contentHash = createHash('sha256').update(canonicalBody).digest('hex');

    // Unified Canonical Request Fingerprinting
    const requestFingerprint = canonicalRequestFingerprint({
      draftId,
      socialAccountId: dto.socialAccountId,
      scheduledAt: scheduledDate,
      timezone: dto.timezone,
      contentVersionId: latestVersion.id,
    });

    let scheduledPost: ScheduledPost;
    let dispatchRecord: ScheduledPostDispatch;

    try {
      const res = await this.db.$transaction(async (tx: any) => {
        const sp = await tx.scheduledPost.create({
          data: {
            workspaceId,
            draftId,
            socialAccountId: dto.socialAccountId,
            contentVersionId: latestVersion.id,
            contentSnapshot,
            contentHash,
            requestFingerprint,
            scheduledAt: scheduledDate,
            timezone: dto.timezone,
            status: 'SCHEDULED',
            idempotencyKey,
          },
        });

        const disp = await tx.scheduledPostDispatch.create({
          data: {
            scheduledPostId: sp.id,
            status: 'PENDING',
          },
        });

        return { sp, disp };
      });
      scheduledPost = res.sp;
      dispatchRecord = res.disp;
    } catch (err: any) {
      if (err.code === 'P2002') {
        const target = err.meta?.target;
        const targetStr = Array.isArray(target) ? target.join(',') : String(target || '');

        if (
          targetStr.includes('idempotency_key') ||
          targetStr.includes('unique_workspace_idempotency_key')
        ) {
          const existing = await this.db.scheduledPost.findUnique({
            where: { unique_workspace_idempotency_key: { workspaceId, idempotencyKey } },
          });
          if (existing) {
            // Reject mismatched idempotency payload
            if (existing.requestFingerprint && existing.requestFingerprint !== requestFingerprint) {
              throw new ConflictException(
                'Idempotency key was previously used with a different scheduling payload (draft, account, or time mismatch)',
              );
            }
            return existing;
          }
        }

        throw new ConflictException('Draft already has an active schedule in progress (concurrent race)');
      }
      throw err;
    }

    const delayMs = Math.max(0, scheduledDate.getTime() - Date.now());
    const bullJobId = `publish-${scheduledPost.id}`;

    try {
      await this.publishQueue.add(
        'PUBLISH',
        {
          requestId: randomUUID(),
          workspaceId,
          scheduledPostId: scheduledPost.id,
        },
        {
          jobId: bullJobId,
          delay: delayMs,
          ...PUBLISH_JOB_OPTIONS,
        },
      );

      await this.db.scheduledPostDispatch.update({
        where: { id: dispatchRecord.id },
        data: { status: 'DISPATCHED', dispatchedAt: new Date(), bullJobId },
      });
      await this.db.scheduledPost.update({
        where: { id: scheduledPost.id },
        data: { bullJobId },
      });
    } catch {
      this.logger.warn(
        `Immediate queue dispatch failed for ${scheduledPost.id}. Outbox will reconcile.`,
      );
    }

    return scheduledPost;
  }

  async resolveSchedule(
    workspaceId: string,
    userId: string,
    scheduledPostId: string,
    dto: ResolveScheduleDto,
  ) {
    // Tenancy & authorization check: user must own the workspace
    const workspace = await this.db.workspace.findFirst({
      where: { id: workspaceId, userId },
      select: { id: true },
    });
    if (!workspace) {
      throw new ForbiddenException('Only authorized workspace owner can resolve ambiguous schedules');
    }

    const post = await this.db.scheduledPost.findFirst({
      where: { id: scheduledPostId, workspaceId },
      include: { draft: true },
    });
    if (!post) throw new NotFoundException('Scheduled post not found');
    if (post.status !== 'RECOVERY_REQUIRED') {
      throw new BadRequestException(
        `Cannot resolve schedule: current status is ${post.status}, expected RECOVERY_REQUIRED`,
      );
    }

    // PATH 1: CONFIRM_NOT_PUBLISHED
    if (dto.action === 'CONFIRM_NOT_PUBLISHED') {
      if (!dto.confirmUnpublished) {
        throw new BadRequestException(
          'Operator certification required: confirmUnpublished must be true after manual inspection of the Threads profile.',
        );
      }

      // Fail-Closed automated platform pre-check with strict SAFE_TO_RESOLVE allowlist
      if (post.containerId) {
        let cStatus: { id: string; status: string; error_message?: string } | undefined;
        try {
          const token = await this.tokenService.getValidToken(post.socialAccountId);
          cStatus = await this.threadsApi.getContainerStatus(token, post.containerId, {
            timeoutMs: 5000,
          });
        } catch (checkErr: any) {
          throw new ServiceUnavailableException(
            `Automated pre-check failed: unable to verify container status on Threads platform (${checkErr.message}). Cannot confirm unpublished while platform status is unknown. Please retry after verifying connectivity.`,
          );
        }

        const SAFE_TO_RESOLVE = ['FINISHED', 'ERROR', 'EXPIRED'];
        const status = cStatus?.status?.toUpperCase();

        if (status === 'PUBLISHED') {
          throw new ConflictException(
            'Cannot confirm as unpublished: container reports status PUBLISHED on Meta. Please resolve using CONFIRM_PUBLISHED.',
          );
        }
        if (status === 'IN_PROGRESS') {
          throw new ConflictException(
            'Cannot confirm as unpublished: container is still processing on Meta (IN_PROGRESS). Wait for platform processing to complete before resolving.',
          );
        }
        if (!status || !SAFE_TO_RESOLVE.includes(status)) {
          throw new ConflictException(
            `Cannot confirm as unpublished: container returned unknown or unverified status "${cStatus?.status}". Fail-closed allowlist requires one of: ${SAFE_TO_RESOLVE.join(', ')}.`,
          );
        }
      }

      await this.db.$transaction(async (tx: any) => {
        // Atomic CAS asserting status = 'RECOVERY_REQUIRED'
        const updated = await tx.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'CANCELLED',
              last_error_msg = ${`Operator attested NOT_PUBLISHED by user ${userId}. Reason: ${dto.reason || 'Manual verification'} (Audited)`},
              updated_at = NOW()
          WHERE id = ${post.id}::uuid
            AND workspace_id = ${workspaceId}::uuid
            AND status = 'RECOVERY_REQUIRED'
        `;

        if (updated === 0) {
          throw new ConflictException(
            'Schedule was already resolved or is no longer in RECOVERY_REQUIRED status',
          );
        }

        await tx.auditLog.create({
          data: {
            workspaceId,
            action: 'OPERATOR_ATTESTED_NOT_PUBLISHED',
            entityType: 'ScheduledPost',
            entityId: post.id,
            input: { reason: dto.reason, confirmedBy: userId },
            result: 'CANCELLED',
          },
        });
      });

      return { success: true, status: 'CANCELLED' };
    }

    // PATH 2: CONFIRM_PUBLISHED
    if (dto.action === 'CONFIRM_PUBLISHED') {
      if (!dto.threadsPostId) {
        throw new BadRequestException('threadsPostId is required when confirming published post');
      }

      const account = await this.db.socialAccount.findUniqueOrThrow({
        where: { id: post.socialAccountId },
      });

      const token = await this.tokenService.getValidToken(post.socialAccountId);
      let postDetails: ThreadsApiPost;
      try {
        postDetails = await this.threadsApi.getPost(token, dto.threadsPostId);
      } catch (err: any) {
        if (err instanceof ThreadsApiError) {
          if (err.statusCode === 404) {
            throw new NotFoundException(
              `Verification failed: Post ${dto.threadsPostId} was not found on Threads platform.`,
            );
          }
          if (err.statusCode === 401 || err.statusCode === 403) {
            throw new UnauthorizedException(
              `Verification failed: Threads access token is expired or unauthorized: ${err.message}`,
            );
          }
          if (err.statusCode === 429 || err.statusCode >= 500) {
            throw new ServiceUnavailableException(
              `Verification transient failure: Threads platform returned HTTP ${err.statusCode}: ${err.message}. Please retry.`,
            );
          }
        }
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
          throw new ServiceUnavailableException(
            `Verification failed: Network timeout while querying Threads API. Please retry.`,
          );
        }
        throw new ServiceUnavailableException(
          `Verification failed: Unable to query Threads platform (${err.message}). Please retry.`,
        );
      }

      // Strict Account Ownership Assertion (Fail-Closed, Owner-Authoritative)
      const postOwnerId = postDetails.ownerId || postDetails.owner?.id;
      const postUsername = postDetails.username;

      if (postOwnerId) {
        if (postOwnerId !== account.externalId) {
          throw new BadRequestException(
            `Verification failed: Post ${dto.threadsPostId} belongs to Threads user ${postOwnerId}, not connected account ${account.externalId}`,
          );
        }
        if (
          postUsername &&
          account.username &&
          postUsername.toLowerCase() !== account.username.toLowerCase()
        ) {
          this.logger.warn(
            `Post ${dto.threadsPostId} username @${postUsername} differs from connected account @${account.username}, but platform user ID matches.`,
          );
        }
      } else if (postUsername) {
        if (!account.username || postUsername.toLowerCase() !== account.username.toLowerCase()) {
          throw new BadRequestException(
            `Verification failed: Post ${dto.threadsPostId} belongs to @${postUsername}, not connected account @${account.username}`,
          );
        }
      } else {
        throw new BadRequestException(
          `Verification failed: Threads API did not return post owner ID or username. Cannot verify account ownership (fail-closed).`,
        );
      }

      // Verify media_type strictly matches TEXT_POST
      if (postDetails.media_type !== 'TEXT_POST') {
        throw new BadRequestException(
          `Verification failed: Threads post is not a TEXT_POST (received '${postDetails.media_type}')`,
        );
      }

      // Verify content hash match
      if (!postDetails.text) {
        throw new BadRequestException('Verification failed: Threads post contains no text');
      }
      const actualHash = createHash('sha256')
        .update(canonicalOutboundText(postDetails.text))
        .digest('hex');
      if (actualHash !== post.contentHash) {
        throw new BadRequestException(
          'Verification failed: Threads post text does not match the scheduled content snapshot hash',
        );
      }

      // Validate platform timestamp with Number.isFinite
      const platformTimestamp = new Date(postDetails.timestamp);
      if (!Number.isFinite(platformTimestamp.getTime())) {
        throw new BadRequestException(
          'Verification failed: Threads returned an invalid post timestamp',
        );
      }
      const referenceTime = post.publishRequestedAt || post.ambiguityDetectedAt || post.scheduledAt;
      const minAcceptableTime = new Date(referenceTime.getTime() - 10 * 60 * 1000);
      const maxAcceptableTime = new Date(referenceTime.getTime() + 60 * 60 * 1000);
      if (platformTimestamp < minAcceptableTime || platformTimestamp > maxAcceptableTime) {
        throw new BadRequestException(
          `Verification failed: Threads post timestamp (${platformTimestamp.toISOString()}) is outside acceptable proximity window [${minAcceptableTime.toISOString()} - ${maxAcceptableTime.toISOString()}] for this publish attempt`,
        );
      }

      const publishedObservedAt = new Date();
      await this.db.$transaction(async (tx: any) => {
        // Atomic CAS asserting status = 'RECOVERY_REQUIRED'
        const updated = await tx.$executeRaw`
          UPDATE scheduled_posts
          SET status = 'PUBLISHED',
              published_at = ${platformTimestamp},
              published_observed_at = ${publishedObservedAt},
              claimed_by = NULL,
              lease_until = NULL,
              attempt_id = NULL,
              updated_at = NOW()
          WHERE id = ${post.id}::uuid
            AND workspace_id = ${workspaceId}::uuid
            AND status = 'RECOVERY_REQUIRED'
        `;

        if (updated === 0) {
          throw new ConflictException(
            'Schedule was already resolved or is no longer in RECOVERY_REQUIRED status',
          );
        }

        const publishedPost = await tx.publishedPost.create({
          data: {
            workspaceId,
            socialAccountId: post.socialAccountId,
            draftId: post.draftId,
            publishedVersionId: post.contentVersionId,
            threadsPostId: dto.threadsPostId!,
            publishedAt: platformTimestamp,
            publishedObservedAt,
          },
        });

        // Upsert ThreadPost keyed by (socialAccountId, threadsPostId)
        await tx.threadPost.upsert({
          where: {
            socialAccountId_threadsPostId: {
              socialAccountId: post.socialAccountId,
              threadsPostId: dto.threadsPostId!,
            },
          },
          create: {
            socialAccountId: post.socialAccountId,
            threadsPostId: dto.threadsPostId!,
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

        // Emit POST_PUBLISHED outbox event
        await tx.eventOutbox.create({
          data: {
            workspaceId,
            eventType: 'POST_PUBLISHED',
            payload: {
              scheduledPostId: post.id,
              threadsPostId: dto.threadsPostId!,
              publishedAt: platformTimestamp.toISOString(),
            },
            status: 'PENDING',
          },
        });

        await tx.auditLog.create({
          data: {
            workspaceId,
            action: 'SCHEDULE_RESOLVED_PUBLISHED',
            entityType: 'ScheduledPost',
            entityId: post.id,
            input: { threadsPostId: dto.threadsPostId, verifiedBy: userId },
            output: { platformTimestamp },
            result: 'PUBLISHED',
          },
        });
      });

      return { success: true, status: 'PUBLISHED', threadsPostId: dto.threadsPostId };
    }

    throw new BadRequestException(`Unrecognized action "${dto.action}"`);
  }

  async cancelSchedule(workspaceId: string, scheduledPostId: string) {
    // Rejects if RECOVERY_REQUIRED
    const updated = await this.db.$executeRaw`
      UPDATE scheduled_posts
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE id = ${scheduledPostId}::uuid
        AND workspace_id = ${workspaceId}::uuid
        AND status IN ('SCHEDULED', 'QUOTA_BLOCKED', 'FAILED_RETRYABLE', 'AUTH_REQUIRED')
        AND publish_requested_at IS NULL
        AND ambiguity_detected_at IS NULL
    `;

    if (updated === 0) {
      throw new ConflictException(
        'Cannot cancel schedule: post is already executing or requires explicit operator resolution (RECOVERY_REQUIRED)',
      );
    }

    // Cleanup known base, retry, and reclaim jobs across standard 0..5 lifecycle attempts
    const jobIdsToRemove = [
      `publish-${scheduledPostId}`,
      ...Array.from({ length: 6 }, (_, i) => `publish-${scheduledPostId}-retry-${i}`),
      ...Array.from({ length: 6 }, (_, i) => `publish-${scheduledPostId}-reclaim-${i}`),
    ];

    for (const jid of jobIdsToRemove) {
      try {
        const job = await this.publishQueue.getJob(jid);
        if (job) await job.remove();
      } catch (err) {
        this.logger.warn(`Could not remove BullMQ job ${jid}: ${err}`);
      }
    }

    return { success: true, message: 'Schedule successfully cancelled' };
  }

  async listSchedules(
    workspaceId: string,
    options?: { status?: string; page?: number; limit?: number; order?: 'asc' | 'desc' },
  ): Promise<{ data: any[]; meta: { total: number; page: number; limit: number; hasMore: boolean } }> {
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : 20;
    const skip = (page - 1) * limit;

    let statusFilter: any = undefined;
    if (options?.status) {
      const statusUpper = options.status.toUpperCase();
      if (statusUpper === 'UPCOMING') {
        statusFilter = {
          in: ['SCHEDULED', 'CLAIMED', 'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING'],
        };
      } else if (statusUpper === 'ATTENTION') {
        statusFilter = {
          in: ['RECOVERY_REQUIRED', 'QUOTA_BLOCKED', 'FAILED_RETRYABLE', 'AUTH_REQUIRED'],
        };
      } else if (options.status.includes(',')) {
        statusFilter = {
          in: options.status.split(',').map((s) => s.trim().toUpperCase()),
        };
      } else {
        statusFilter = options.status;
      }
    }

    const where = {
      workspaceId,
      ...(statusFilter !== undefined ? { status: statusFilter } : {}),
    };

    // Sort order: if explicitly passed, use it. Otherwise:
    // UPCOMING/SCHEDULED sorts ascending (soonest first).
    // Historical/all sorts descending (most recent first).
    const sortOrder: 'asc' | 'desc' =
      options?.order ||
      (options?.status && ['UPCOMING', 'SCHEDULED'].includes(options.status.toUpperCase())
        ? 'asc'
        : 'desc');

    const [total, items] = await Promise.all([
      this.db.scheduledPost.count({ where }),
      this.db.scheduledPost.findMany({
        where,
        include: {
          socialAccount: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profileUrl: true,
            },
          },
          draft: {
            select: {
              id: true,
              status: true,
              versions: {
                orderBy: { version: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { scheduledAt: sortOrder },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: items.map((sp) => ({
        id: sp.id,
        workspaceId: sp.workspaceId,
        draftId: sp.draftId,
        socialAccountId: sp.socialAccountId,
        contentVersionId: sp.contentVersionId,
        scheduledAt: sp.scheduledAt.toISOString(),
        timezone: sp.timezone,
        status: sp.status,
        attemptCount: sp.attemptCount,
        lastAttemptAt: sp.lastAttemptAt?.toISOString() ?? null,
        nextRetryAt: sp.nextRetryAt?.toISOString() ?? null,
        lastErrorCode: sp.lastErrorCode,
        lastErrorMsg: sp.lastErrorMsg,
        containerId: sp.containerId,
        publishedAt: sp.publishedAt?.toISOString() ?? null,
        publishedObservedAt: sp.publishedObservedAt?.toISOString() ?? null,
        socialAccount: sp.socialAccount,
        draft: sp.draft,
        contentSnapshot: sp.contentSnapshot,
        createdAt: sp.createdAt.toISOString(),
        updatedAt: sp.updatedAt.toISOString(),
      })),
      meta: {
        total,
        page,
        limit,
        hasMore: skip + items.length < total,
      },
    };
  }

  async getSchedule(workspaceId: string, scheduledPostId: string): Promise<any> {
    const sp = await this.db.scheduledPost.findFirst({
      where: { id: scheduledPostId, workspaceId },
      include: {
        socialAccount: true,
        draft: {
          include: {
            versions: {
              orderBy: { version: 'desc' },
            },
          },
        },
        contentVersion: true,
      },
    });

    if (!sp) {
      throw new NotFoundException(`Schedule ${scheduledPostId} not found in workspace`);
    }

    return {
      id: sp.id,
      workspaceId: sp.workspaceId,
      draftId: sp.draftId,
      socialAccountId: sp.socialAccountId,
      contentVersionId: sp.contentVersionId,
      scheduledAt: sp.scheduledAt.toISOString(),
      timezone: sp.timezone,
      status: sp.status,
      attemptCount: sp.attemptCount,
      lastAttemptAt: sp.lastAttemptAt?.toISOString() ?? null,
      nextRetryAt: sp.nextRetryAt?.toISOString() ?? null,
      lastErrorCode: sp.lastErrorCode,
      lastErrorMsg: sp.lastErrorMsg,
      containerId: sp.containerId,
      publishedAt: sp.publishedAt?.toISOString() ?? null,
      publishedObservedAt: sp.publishedObservedAt?.toISOString() ?? null,
      socialAccount: sp.socialAccount,
      draft: sp.draft,
      contentVersion: sp.contentVersion,
      contentSnapshot: sp.contentSnapshot,
      createdAt: sp.createdAt.toISOString(),
      updatedAt: sp.updatedAt.toISOString(),
    };
  }
}

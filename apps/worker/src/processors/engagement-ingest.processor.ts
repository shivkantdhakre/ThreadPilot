import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@threadpilot/database';
import {
  ENGAGEMENT_QUEUES,
  EngagementSyncJobPayload,
  canonicalContentHash,
} from '@threadpilot/types';
import { PublishingService } from '../services/publishing.service';
import { JobProgressService } from '../services/job-progress.service';
import { randomUUID } from 'crypto';

export const SYNC_TIER_INTERVALS_MS = {
  HOT: 3 * 60 * 1000,         // 3 minutes (< 48 hours)
  WARM: 20 * 60 * 1000,       // 20 minutes (48 hours - 7 days)
  COLD: 3 * 60 * 60 * 1000,   // 3 hours (7 days - lookback days)
} as const;

export const DEFAULT_ENGAGEMENT_LOOKBACK_DAYS = 14;

@Processor(ENGAGEMENT_QUEUES.ENGAGEMENT_INGEST, { concurrency: 2 })
export class EngagementIngestProcessor extends WorkerHost {
  private readonly logger = new Logger(EngagementIngestProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly publishingService: PublishingService,
    private readonly progressService: JobProgressService,
    @InjectQueue(ENGAGEMENT_QUEUES.ENGAGEMENT_CLASSIFY) private readonly classifyQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<EngagementSyncJobPayload>): Promise<void> {
    return this.handle(job);
  }

  async handle(job: Job<EngagementSyncJobPayload>): Promise<void> {
    const { requestId, workspaceId, socialAccountId, rootThreadsPostId, force = false } = job.data;
    this.logger.log(`Starting engagement sync job ${requestId} for account ${socialAccountId}`);

    // Update job record progress if tracked
    if (requestId) {
      await this.progressService.update(requestId, {
        status: 'RUNNING',
        progress: 10,
        progressMessage: 'Validating account credentials and sync state...',
      });
    }

    // 1. Fetch social account and verify it is connected
    const socialAccount = await prisma.socialAccount.findFirst({
      where: { id: socialAccountId, workspaceId },
      include: { oauthToken: true },
    });

    if (!socialAccount || !socialAccount.isConnected || !socialAccount.oauthToken) {
      this.logger.warn(`Social account ${socialAccountId} is not connected or missing token`);
      if (requestId) {
        await this.progressService.update(requestId, {
          status: 'FAILED',
          progress: 100,
          progressMessage: 'Social account is not connected or token is missing',
          error: 'Social account is not connected or token is missing',
        });
      }
      return;
    }

    // 2. Obtain valid Threads access token
    let accessToken: string;
    try {
      accessToken = await this.publishingService.tokenService.getValidToken(socialAccountId);
    } catch (tokenErr: any) {
      this.logger.error(`Failed to obtain valid access token for ${socialAccountId}: ${tokenErr?.message}`);
      if (requestId) {
        await this.progressService.update(requestId, {
          status: 'FAILED',
          progress: 100,
          progressMessage: `Authentication failed: ${tokenErr?.message}`,
          error: `Authentication failed: ${tokenErr?.message}`,
        });
      }
      return;
    }

    // 3. Collect root posts to sync
    const lookbackDays = this.config.get<number>('ENGAGEMENT_SYNC_LOOKBACK_DAYS', DEFAULT_ENGAGEMENT_LOOKBACK_DAYS);
    const lookbackCutoff = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000);

    const postsToSync: Array<{ rootThreadsPostId: string; threadPostId?: string | null; publishedAt?: Date | null }> = [];

    if (rootThreadsPostId) {
      // Targeted sync for a single root post
      const threadPost = await prisma.threadPost.findFirst({
        where: { socialAccountId, threadsPostId: rootThreadsPostId },
      });
      postsToSync.push({
        rootThreadsPostId,
        threadPostId: threadPost?.id ?? null,
        publishedAt: threadPost?.postedAt ?? null,
      });
    } else {
      // General sync: find existing sync states and recent thread posts
      const recentPosts = await prisma.threadPost.findMany({
        where: {
          socialAccountId,
          postedAt: { gte: lookbackCutoff },
        },
      });

      for (const p of recentPosts) {
        postsToSync.push({
          rootThreadsPostId: p.threadsPostId,
          threadPostId: p.id,
          publishedAt: p.postedAt,
        });
      }

      // Also include any EngagementSyncState that might not map to a known ThreadPost
      const existingStates = await prisma.engagementSyncState.findMany({
        where: {
          socialAccountId,
          createdAt: { gte: lookbackCutoff },
        },
      });

      for (const s of existingStates) {
        if (!postsToSync.some((p) => p.rootThreadsPostId === s.rootThreadsPostId)) {
          postsToSync.push({
            rootThreadsPostId: s.rootThreadsPostId,
            threadPostId: s.threadPostId,
            publishedAt: null,
          });
        }
      }
    }

    this.logger.log(`Found ${postsToSync.length} root post(s) to inspect for account ${socialAccountId}`);

    let totalSyncedPosts = 0;
    let totalNewInteractions = 0;

    for (const postInfo of postsToSync) {
      try {
        const result = await this.syncRootPost({
          workspaceId,
          socialAccountId,
          accountUsername: socialAccount.username,
          accountExternalId: socialAccount.externalId,
          rootThreadsPostId: postInfo.rootThreadsPostId,
          threadPostId: postInfo.threadPostId ?? null,
          rootPostPublishedAt: postInfo.publishedAt ?? null,
          accessToken,
          force,
        });

        if (result.synced) {
          totalSyncedPosts++;
          totalNewInteractions += result.newInteractions;
        }
      } catch (err: any) {
        this.logger.error(`Error syncing root post ${postInfo.rootThreadsPostId}: ${err?.message}`, err.stack);
      }
    }

    if (requestId) {
      await this.progressService.update(requestId, {
        status: 'COMPLETE',
        progress: 100,
        progressMessage: `Sync completed: ${totalSyncedPosts} root post(s) synced, ${totalNewInteractions} new interaction(s) ingested.`,
      });
    }

    this.logger.log(
      `Finished engagement sync job ${requestId}: ${totalSyncedPosts} post(s) synced, ${totalNewInteractions} interaction(s) discovered.`,
    );
  }

  /**
   * Syncs replies for an individual root post using tiered scheduling, CAS leasing,
   * timestamp overlap window, and self-reply loop breaking.
   */
  private async syncRootPost(params: {
    workspaceId: string;
    socialAccountId: string;
    accountUsername: string;
    accountExternalId: string;
    rootThreadsPostId: string;
    threadPostId: string | null;
    rootPostPublishedAt: Date | null;
    accessToken: string;
    force: boolean;
  }): Promise<{ synced: boolean; newInteractions: number }> {
    const {
      workspaceId,
      socialAccountId,
      accountUsername,
      accountExternalId,
      rootThreadsPostId,
      threadPostId,
      rootPostPublishedAt,
      accessToken,
      force,
    } = params;

    // 1. Ensure EngagementSyncState exists
    let syncState = await prisma.engagementSyncState.findUnique({
      where: {
        socialAccountId_rootThreadsPostId: {
          socialAccountId,
          rootThreadsPostId,
        },
      },
    });

    if (!syncState) {
      syncState = await prisma.engagementSyncState.create({
        data: {
          workspaceId,
          socialAccountId,
          threadPostId,
          rootThreadsPostId,
          syncTier: 'HOT',
          syncStatus: 'IDLE',
        },
      });
    }

    // 2. Determine tier based on root post age
    const now = new Date();
    const effectivePublishedAt = rootPostPublishedAt ?? syncState.createdAt;
    const postAgeMs = now.getTime() - effectivePublishedAt.getTime();

    let tier: 'HOT' | 'WARM' | 'COLD' = 'HOT';
    if (postAgeMs < 48 * 3600 * 1000) {
      tier = 'HOT';
    } else if (postAgeMs < 7 * 24 * 3600 * 1000) {
      tier = 'WARM';
    } else {
      tier = 'COLD';
    }

    // Check cadence interval unless force is requested
    if (!force && syncState.lastSyncedAt) {
      const intervalMs = SYNC_TIER_INTERVALS_MS[tier];
      const elapsedMs = now.getTime() - syncState.lastSyncedAt.getTime();
      if (elapsedMs < intervalMs) {
        // Not due for sync yet
        return { synced: false, newInteractions: 0 };
      }
    }

    // 3. Acquire CAS lease lock (lease for 3 minutes)
    const leaseToken = randomUUID();
    const rowsUpdated = await prisma.$executeRaw`
      UPDATE engagement_sync_states
      SET sync_status = 'SYNCING'::"SyncStatus",
          lease_token = ${leaseToken}::uuid,
          lease_until = NOW() + INTERVAL '3 minutes',
          sync_tier = ${tier}::"SyncTier",
          updated_at = NOW()
      WHERE id = ${syncState.id}::uuid
        AND (sync_status = 'IDLE'::"SyncStatus" OR sync_status = 'FAILED'::"SyncStatus" OR lease_until < NOW());
    `;

    if (rowsUpdated === 0) {
      this.logger.debug(`Could not acquire sync lease for root post ${rootThreadsPostId} (locked by another worker)`);
      return { synced: false, newInteractions: 0 };
    }

    this.logger.debug(`Acquired lease ${leaseToken} for root post ${rootThreadsPostId} (Tier: ${tier})`);

    // 4. Calculate sliding timestamp overlap window:
    // since = max(lastSeenInteractionAt - 120s, rootPostTimestamp)
    let sinceDate: Date | undefined = undefined;
    if (syncState.lastSeenInteractionAt) {
      const overlapTime = syncState.lastSeenInteractionAt.getTime() - 120_000;
      if (rootPostPublishedAt) {
        sinceDate = new Date(Math.max(overlapTime, rootPostPublishedAt.getTime()));
      } else {
        sinceDate = new Date(overlapTime);
      }
    } else if (rootPostPublishedAt) {
      sinceDate = rootPostPublishedAt;
    }

    let newInteractionsCount = 0;
    let maxSeenTimestamp = syncState.lastSeenInteractionAt;
    let nextCursor: string | null = null;

    try {
      // 5. Query Meta Threads API for replies
      let replyList;
      try {
        replyList = await this.publishingService.threadsApi.getPostReplies(
          accessToken,
          rootThreadsPostId,
          {
            since: sinceDate,
            cursor: syncState.paginationCursor ?? undefined,
            limit: 50,
            reverse: false,
          },
        );
      } catch (fetchErr: any) {
        // Cursor fallback: If cursor failed, retry without cursor using timestamp overlap
        if (syncState.paginationCursor) {
          this.logger.warn(
            `Cursor query failed for ${rootThreadsPostId}, falling back to timestamp overlap: ${fetchErr?.message}`,
          );
          replyList = await this.publishingService.threadsApi.getPostReplies(
            accessToken,
            rootThreadsPostId,
            {
              since: sinceDate,
              cursor: undefined,
              limit: 50,
              reverse: false,
            },
          );
        } else {
          throw fetchErr;
        }
      }

      nextCursor = replyList.paging?.cursors?.after ?? null;
      const replies = replyList.data ?? [];

      this.logger.debug(`Fetched ${replies.length} reply items for root post ${rootThreadsPostId}`);

      // 6. Process replies & apply Self-Reply Loop Breaker
      for (const reply of replies) {
        const replyTimestamp = new Date(reply.timestamp);
        if (!maxSeenTimestamp || replyTimestamp > maxSeenTimestamp) {
          maxSeenTimestamp = replyTimestamp;
        }

        // ─── DEFENSE-IN-DEPTH SELF-REPLY LOOP BREAKER (Invariant 12) ───
        // Check 1: Meta authoritative is_reply_owned_by_me === true
        // Check 2: Author username matches account username (case-insensitive)
        // Check 3: External author ID matches account externalId
        const isOwnedByMe =
          Boolean(reply.is_reply_owned_by_me) ||
          (Boolean(reply.username) && reply.username?.toLowerCase() === accountUsername.toLowerCase()) ||
          (Boolean(accountExternalId) && (
            (reply as any).owner?.id === accountExternalId ||
            (reply as any).author_id === accountExternalId
          ));

        const canonicalHash = canonicalContentHash(reply.text || '');

        // Check if interaction already exists
        const existing = await prisma.interaction.findUnique({
          where: {
            socialAccountId_externalInteractionId: {
              socialAccountId,
              externalInteractionId: reply.id,
            },
          },
        });

        if (existing) {
          // Idempotent update: update observation timestamp and hideStatus
          await prisma.interaction.update({
            where: { id: existing.id },
            data: {
              lastSeenAt: new Date(),
              hideStatus: (reply.hide_status as any) || existing.hideStatus,
              permalink: reply.permalink ?? existing.permalink,
            },
          });
          continue;
        }

        // New interaction discovered!
        // Link parent interaction if replied_to.id exists
        let parentInteractionId: string | null = null;
        if (reply.replied_to?.id) {
          const parentInteraction = await prisma.interaction.findUnique({
            where: {
              socialAccountId_externalInteractionId: {
                socialAccountId,
                externalInteractionId: reply.replied_to.id,
              },
            },
          });
          if (parentInteraction) {
            parentInteractionId = parentInteraction.id;
          }
        }

        const newInteraction = await prisma.interaction.create({
          data: {
            workspaceId,
            socialAccountId,
            threadPostId,
            rootThreadsPostId,
            parentExternalId: reply.replied_to?.id ?? null,
            parentInteractionId,
            externalInteractionId: reply.id,
            authorExternalId: (reply as any).owner?.id ?? null,
            authorUsernameSnapshot: reply.username || 'unknown',
            content: reply.text || '',
            canonicalContentHash: canonicalHash,
            interactionType: 'REPLY',
            isReplyOwnedByMe: isOwnedByMe,
            replyAudience: reply.reply_audience ?? null,
            hideStatus: (reply.hide_status as any) || 'NOT_HUSHED',
            postedAt: replyTimestamp,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            permalink: reply.permalink ?? null,
            status: isOwnedByMe ? 'REPLIED' : 'NEW',
            responseDecision: isOwnedByMe ? 'NOT_REQUIRED' : 'PENDING',
            priorityScore: 5,
          },
        });

        if (isOwnedByMe) {
          this.logger.debug(
            `Self-reply detected for reply ${reply.id} (ownedByMe=${reply.is_reply_owned_by_me}, username=${reply.username}). Marked REPLIED/NOT_REQUIRED with zero generation.`,
          );
        } else {
          // Third-party reply: enqueue for classification
          newInteractionsCount++;
          await this.classifyQueue.add(
            'classify',
            {
              requestId: randomUUID(),
              workspaceId,
              socialAccountId,
              interactionId: newInteraction.id,
              priorityScore: newInteraction.priorityScore,
            },
            {
              jobId: `classify_${newInteraction.id}`,
              priority: newInteraction.priorityScore * 100,
              removeOnComplete: true,
            },
          );
        }
      }

      // 7. Release lease successfully and advance watermark
      await prisma.$executeRaw`
        UPDATE engagement_sync_states
        SET sync_status = 'IDLE'::"SyncStatus",
            lease_token = NULL,
            lease_until = NULL,
            last_synced_at = NOW(),
            last_seen_interaction_at = COALESCE(${maxSeenTimestamp}, last_seen_interaction_at),
            pagination_cursor = ${nextCursor},
            sync_tier = ${tier}::"SyncTier",
            error_count = 0,
            last_error = NULL,
            updated_at = NOW()
        WHERE id = ${syncState.id}::uuid
          AND lease_token = ${leaseToken}::uuid;
      `;

      return { synced: true, newInteractions: newInteractionsCount };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      this.logger.error(`Error during reply sync for ${rootThreadsPostId}: ${errMsg}`);

      // Release lease with FAILED status and increment error count
      await prisma.$executeRaw`
        UPDATE engagement_sync_states
        SET sync_status = 'FAILED'::"SyncStatus",
            lease_token = NULL,
            lease_until = NULL,
            error_count = error_count + 1,
            last_error = ${errMsg.slice(0, 1000)},
            updated_at = NOW()
        WHERE id = ${syncState.id}::uuid
          AND lease_token = ${leaseToken}::uuid;
      `;

      throw err;
    }
  }
}

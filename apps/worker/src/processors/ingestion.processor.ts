import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  prisma,
  MemoryRepository,
  ObservationSlot,
  ObservationStatus,
  AnalyticsOutboxType,
} from '@threadpilot/database';
import {
  QUEUES,
  IngestionJobPayload,
  StyleExtractionJobPayload,
} from '@threadpilot/types';
import {
  ThreadsApiClient,
  TokenEncryptionService,
} from '@threadpilot/threads-client';
import { JobProgressService } from '../services/job-progress.service';
import { AIFactoryService } from '../services/ai-factory.service';
import { PublishingService } from '../services/publishing.service';
import { randomUUID } from 'crypto';

@Processor(QUEUES.INGESTION)
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);
  private readonly encryptionService: TokenEncryptionService;
  private readonly threadsApiClient: ThreadsApiClient;
  private readonly memoryRepo = new MemoryRepository(prisma);

  constructor(
    private readonly progressService: JobProgressService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.STYLE) private readonly styleQueue: Queue,
    @InjectQueue(QUEUES.EMBEDDING) private readonly embeddingQueue: Queue,
    private readonly aiFactory: AIFactoryService,
    @Optional() private readonly publishingService?: PublishingService,
  ) {
    super();
    const encKey = this.config.get<string>('TOKEN_ENCRYPTION_KEY', 'CHANGE_ME_32_BYTE_BASE64_KEY');
    const encVersion = Number(this.config.get<number>('TOKEN_ENCRYPTION_KEY_VERSION', 1));
    this.encryptionService = new TokenEncryptionService(encKey, encVersion);

    const baseUrl = this.config.get<string>('THREADS_API_BASE_URL', 'https://graph.threads.net/v1.0');
    this.threadsApiClient = new ThreadsApiClient(baseUrl);
  }

  async process(job: Job<IngestionJobPayload>): Promise<void> {
    return this.handle(job);
  }

  async handle(job: Job<IngestionJobPayload>): Promise<void> {
    const { requestId, workspaceId, socialAccountId, maxPosts = 500, pageSize = 25, isInitial } = job.data;
    this.logger.log(`Starting ingestion job ${requestId} for account ${socialAccountId}`);

    // Idempotency check
    const existingJob = await prisma.jobRecord.findUnique({ where: { requestId } });
    if (existingJob && existingJob.status === 'COMPLETE') {
      this.logger.log(`Job ${requestId} already completed. Skipping.`);
      return;
    }

    await this.progressService.update(requestId, {
      status: 'RUNNING',
      progress: 5,
      progressMessage: 'Connecting to account and validating tokens...',
    });

    try {
      let accessToken: string;
      if (this.publishingService?.tokenService) {
        accessToken = await this.publishingService.tokenService.getValidToken(socialAccountId);
      } else {
        const socialAccount = await prisma.socialAccount.findFirst({
          where: { id: socialAccountId, workspaceId },
          include: { oauthToken: true },
        });

        if (!socialAccount || !socialAccount.oauthToken) {
          throw new Error('Social account or OAuth token not found');
        }

        accessToken = this.encryptionService.decrypt(socialAccount.oauthToken.accessTokenEncrypted);
      }

      await this.progressService.update(requestId, {
        status: 'RUNNING',
        progress: 15,
        progressMessage: 'Fetching historical posts from Threads API...',
      });

      let currentCursor = job.data.cursor;
      let totalIngested = 0;
      let hasMore = true;

      while (hasMore && totalIngested < maxPosts) {
        const fetchLimit = Math.min(pageSize, maxPosts - totalIngested);
        let postList;
        try {
          postList = await this.threadsApiClient.getUserPosts(accessToken, currentCursor, fetchLimit);
        } catch (apiErr: any) {
          const errMsg = apiErr?.message || String(apiErr);
          this.logger.error({ apiErr }, `Failed to fetch posts from Threads API: ${errMsg}`);
          if (totalIngested === 0) {
            throw new Error(`Failed to fetch posts from Threads API: ${errMsg}`);
          }
          break;
        }

        const posts = postList.data ?? [];
        if (posts.length === 0) {
          break;
        }

        for (const post of posts) {
          const postId = String(post.id);

          // 1. Raw ExternalPost
          const external = await prisma.externalPost.upsert({
            where: {
              socialAccountId_externalId: {
                socialAccountId,
                externalId: postId,
              },
            },
            create: {
              socialAccountId,
              externalId: postId,
              rawPayload: post as any,
              fetchedAt: new Date(),
              normalizedAt: new Date(),
            },
            update: {
              rawPayload: post as any,
              fetchedAt: new Date(),
              normalizedAt: new Date(),
            },
          });

          // 2. Canonical ThreadPost
          const threadPost = await prisma.threadPost.upsert({
            where: {
              socialAccountId_threadsPostId: {
                socialAccountId,
                threadsPostId: postId,
              },
            },
            create: {
              socialAccountId,
              threadsPostId: postId,
              text: post.text ?? '',
              mediaType: post.media_type ?? 'TEXT',
              postedAt: new Date(post.timestamp),
              isOurs: true,
              sourceType: 'INGESTED',
              externalPostId: external.id,
            },
            update: {
              text: post.text ?? '',
              mediaType: post.media_type ?? 'TEXT',
              postedAt: new Date(post.timestamp),
            },
          });

          // 3. Historical Vector Memory: Create MemoryItem & dual embeddings (DOCUMENT + SIMILARITY)
          const postText = (post.text ?? '').trim();
          if (postText) {
            try {
              const memoryItem = await prisma.memoryItem.upsert({
                where: {
                  workspaceId_sourceId: {
                    workspaceId,
                    sourceId: threadPost.id,
                  },
                },
                create: {
                  workspaceId,
                  type: 'POST',
                  content: postText,
                  sourceId: threadPost.id,
                  metadata: {
                    socialAccountId,
                    threadsPostId: postId,
                    postedAt: post.timestamp,
                  },
                },
                update: {
                  content: postText,
                  metadata: {
                    socialAccountId,
                    threadsPostId: postId,
                    postedAt: post.timestamp,
                  },
                },
              });

              const aiProvider = this.aiFactory.getProvider();

              // Generate both embeddings independently (DOCUMENT + SIMILARITY)
              const [docResult, simResult] = await Promise.allSettled([
                aiProvider.embed({
                  texts: [postText],
                  taskType: 'DOCUMENT',
                }),
                aiProvider.embed({
                  texts: [postText],
                  taskType: 'SIMILARITY',
                }),
              ]);

              // Persist or enqueue DOCUMENT representation
              const embeddingModelName = (docResult.status === 'fulfilled' && docResult.value?.model) || process.env.GEMINI_MODEL_EMBEDDING || 'gemini-embedding-2';
              const docVector = docResult.status === 'fulfilled' ? docResult.value.embeddings[0] : undefined;
              if (docVector && docVector.length > 0) {
                await this.memoryRepo.upsertEmbedding(
                  memoryItem.id,
                  docVector,
                  embeddingModelName,
                  docVector.length,
                  'DOCUMENT',
                  'v2',
                );
              } else {
                const reason = docResult.status === 'rejected' ? docResult.reason : 'empty embedding';
                this.logger.warn(
                  { postId, reason },
                  'DOCUMENT embedding failed inline, enqueuing for background retry',
                );
                const docJobId = `embedding-${memoryItem.id}-${embeddingModelName}-DOCUMENT-v2`;
                await this.embeddingQueue.add(
                  'EMBEDDING',
                  {
                    requestId: randomUUID(),
                    workspaceId,
                    memoryItemId: memoryItem.id,
                    text: postText,
                    taskType: 'DOCUMENT',
                    model: embeddingModelName,
                    pipelineVersion: 'v2',
                  },
                  { jobId: docJobId, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
                );
              }

              // Persist or enqueue SIMILARITY representation
              const simEmbeddingModelName = (simResult.status === 'fulfilled' && simResult.value?.model) || process.env.GEMINI_MODEL_EMBEDDING || 'gemini-embedding-2';
              const simVector = simResult.status === 'fulfilled' ? simResult.value.embeddings[0] : undefined;
              if (simVector && simVector.length > 0) {
                await this.memoryRepo.upsertEmbedding(
                  memoryItem.id,
                  simVector,
                  simEmbeddingModelName,
                  simVector.length,
                  'SIMILARITY',
                  'v2',
                );
              } else {
                const reason = simResult.status === 'rejected' ? simResult.reason : 'empty embedding';
                this.logger.warn(
                  { postId, reason },
                  'SIMILARITY embedding failed inline, enqueuing for background retry',
                );
                const simJobId = `embedding-${memoryItem.id}-${simEmbeddingModelName}-SIMILARITY-v2`;
                await this.embeddingQueue.add(
                  'EMBEDDING',
                  {
                    requestId: randomUUID(),
                    workspaceId,
                    memoryItemId: memoryItem.id,
                    text: postText,
                    taskType: 'SIMILARITY',
                    model: simEmbeddingModelName,
                    pipelineVersion: 'v2',
                  },
                  { jobId: simJobId, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
                );
              }
            } catch (embedErr) {
              this.logger.error(
                { err: embedErr, postId },
                'Failed during memory item creation or dual embedding handling',
              );
            }
          }

          totalIngested++;
        }

        const calculatedProgress = Math.min(85, Math.round((totalIngested / maxPosts) * 70) + 15);
        await this.progressService.update(requestId, {
          status: 'RUNNING',
          progress: calculatedProgress,
          progressMessage: `Ingested ${totalIngested} posts...`,
        });

        currentCursor = postList.paging?.cursors?.after;
        hasMore = Boolean(currentCursor && postList.paging?.next);
      }

      // If initial ingestion and posts were found, trigger style extraction.
      // Architectural Note: Style extraction operates directly on canonical ThreadPost text rows
      // to calculate linguistic features (sentence patterns, vocabulary, emojis, hooks).
      // It is intentionally decoupled from the asynchronous vector embedding pipeline.
      if (isInitial && totalIngested > 0) {
        const styleRequestId = randomUUID();
        const stylePayload: StyleExtractionJobPayload = {
          requestId: styleRequestId,
          workspaceId,
          socialAccountId,
          sampleSize: Math.min(totalIngested, 100),
        };

        await prisma.jobRecord.create({
          data: {
            requestId: styleRequestId,
            workspaceId,
            type: 'STYLE',
            status: 'PENDING',
            progress: 0,
            progressMessage: 'Queued automatically after initial ingestion',
          },
        });

        await this.styleQueue.add('STYLE', stylePayload, {
          jobId: styleRequestId,
        });
      }

      // Automatically register ingested posts for analytics tracking
      if (totalIngested > 0) {
        try {
          const registered = await this.registerIngestedPostsForAnalytics(workspaceId, socialAccountId);
          if (registered > 0) {
            this.logger.log(
              `Automatically registered ${registered} ingested posts for analytics tracking (socialAccount: ${socialAccountId})`,
            );
          }
        } catch (analyticsErr: any) {
          this.logger.warn(
            `Could not auto-register ingested posts for analytics: ${analyticsErr.message}`,
          );
        }
      }

      await this.progressService.update(requestId, {
        status: 'COMPLETE',
        progress: 100,
        progressMessage: `Ingestion complete: ${totalIngested} historical posts imported. Vector memory enrichment enqueued.`,
        resultEntityType: 'socialAccount',
        resultEntityId: socialAccountId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error({ err, requestId }, `Ingestion job failed: ${msg}`);
      await this.progressService.update(requestId, {
        status: 'FAILED',
        progress: 0,
        progressMessage: 'Ingestion failed',
        error: msg,
      });
      throw err;
    }
  }

  /**
   * Helper to automatically register unlinked historical ThreadPosts for analytics.
   * Creates synthetic Draft + Version + PublishedPost records with valid future observation windows
   * and triggers the outbox pipeline.
   */
  private async registerIngestedPostsForAnalytics(
    workspaceId: string,
    socialAccountId: string,
  ): Promise<number> {
    const unlinkedPosts = await prisma.threadPost.findMany({
      where: {
        socialAccountId,
        publishedPostId: null,
      },
      orderBy: { postedAt: 'desc' },
      take: 200,
    });

    if (unlinkedPosts.length === 0) return 0;

    await prisma.analyticsSyncState.upsert({
      where: { socialAccountId },
      create: { workspaceId, socialAccountId, analyticsRevision: 0, ingestionGeneration: 0 },
      update: {},
    });

    let registeredCount = 0;
    const now = new Date();
    const windowClosesAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const slots = [ObservationSlot.T_24H, ObservationSlot.T_30D];

    for (const tp of unlinkedPosts) {
      try {
        await prisma.$transaction(async (tx) => {
          const postText =
            tp.text || `Historical Threads post from ${tp.postedAt?.toISOString() ?? 'unknown date'}`;

          const draft = await tx.contentDraft.create({
            data: {
              workspaceId,
              status: 'ARCHIVED',
              generatedBy: 'BACKFILL',
            },
          });

          const version = await tx.contentVersion.create({
            data: {
              draftId: draft.id,
              version: 1,
              body: postText.slice(0, 500),
              hook: postText.split('\n')[0]?.slice(0, 100) ?? null,
              editedBy: 'BACKFILL',
            },
          });

          const publishedPost = await tx.publishedPost.create({
            data: {
              workspaceId,
              socialAccountId,
              draftId: draft.id,
              publishedVersionId: version.id,
              threadsPostId: tp.threadsPostId,
              publishedAt: tp.postedAt ?? now,
              publishedObservedAt: now,
            },
          });

          await tx.threadPost.update({
            where: { id: tp.id },
            data: { publishedPostId: publishedPost.id },
          });

          for (const slot of slots) {
            const dedupeKey = `backfill_obs:${publishedPost.id}:${slot}`;
            const obs = await tx.analyticsObservation.upsert({
              where: {
                uq_observation_slot: { publishedPostId: publishedPost.id, observationSlot: slot },
              },
              create: {
                workspaceId,
                socialAccountId,
                publishedPostId: publishedPost.id,
                observationSlot: slot,
                scheduledFor: now,
                windowClosesAt,
                status: ObservationStatus.SCHEDULED,
              },
              update: {
                scheduledFor: now,
                windowClosesAt,
                status: ObservationStatus.SCHEDULED,
              },
            });

            await tx.analyticsOutboxEvent.upsert({
              where: { dedupeKey },
              create: {
                workspaceId,
                socialAccountId,
                dedupeKey,
                eventType: AnalyticsOutboxType.TRIGGER_OBSERVATION,
                executeAt: now,
                payload: {
                  observationId: obs.id,
                  workspaceId,
                  socialAccountId,
                  publishedPostId: publishedPost.id,
                  slot,
                },
              },
              update: {
                status: 'PENDING',
                executeAt: now,
                errorMessage: null,
              },
            });
          }

          registeredCount++;
        });
      } catch (err: any) {
        this.logger.warn(
          `Skipping auto-analytics registration for post ${tp.threadsPostId}: ${err?.message}`,
        );
      }
    }

    return registeredCount;
  }
}

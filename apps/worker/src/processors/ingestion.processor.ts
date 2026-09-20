import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma, MemoryRepository } from '@threadpilot/database';
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
      const socialAccount = await prisma.socialAccount.findFirst({
        where: { id: socialAccountId, workspaceId },
        include: { oauthToken: true },
      });

      if (!socialAccount || !socialAccount.oauthToken) {
        throw new Error('Social account or OAuth token not found');
      }

      const accessToken = this.encryptionService.decrypt(socialAccount.oauthToken.accessTokenEncrypted);

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
        } catch (apiErr) {
          this.logger.warn({ apiErr }, 'Failed to fetch posts from Threads API (may be sandbox or dev mode)');
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
              const docVector = docResult.status === 'fulfilled' ? docResult.value.embeddings[0] : undefined;
              if (docVector && docVector.length > 0) {
                await this.memoryRepo.upsertEmbedding(
                  memoryItem.id,
                  docVector,
                  aiProvider.modelName,
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
                const docJobId = `embedding-${memoryItem.id}-${aiProvider.modelName}-DOCUMENT-v2`;
                await this.embeddingQueue.add(
                  'EMBEDDING',
                  {
                    requestId: randomUUID(),
                    workspaceId,
                    memoryItemId: memoryItem.id,
                    text: postText,
                    taskType: 'DOCUMENT',
                    model: aiProvider.modelName,
                    pipelineVersion: 'v2',
                  },
                  { jobId: docJobId, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
                );
              }

              // Persist or enqueue SIMILARITY representation
              const simVector = simResult.status === 'fulfilled' ? simResult.value.embeddings[0] : undefined;
              if (simVector && simVector.length > 0) {
                await this.memoryRepo.upsertEmbedding(
                  memoryItem.id,
                  simVector,
                  aiProvider.modelName,
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
                const simJobId = `embedding-${memoryItem.id}-${aiProvider.modelName}-SIMILARITY-v2`;
                await this.embeddingQueue.add(
                  'EMBEDDING',
                  {
                    requestId: randomUUID(),
                    workspaceId,
                    memoryItemId: memoryItem.id,
                    text: postText,
                    taskType: 'SIMILARITY',
                    model: aiProvider.modelName,
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
}

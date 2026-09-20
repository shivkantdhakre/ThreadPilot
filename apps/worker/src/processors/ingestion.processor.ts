import { Processor, Process } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
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
export class IngestionProcessor {
  private readonly logger = new Logger(IngestionProcessor.name);
  private readonly encryptionService: TokenEncryptionService;
  private readonly threadsApiClient: ThreadsApiClient;
  private readonly memoryRepo = new MemoryRepository(prisma);

  constructor(
    private readonly progressService: JobProgressService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.STYLE) private readonly styleQueue: Queue,
    @Optional() private readonly aiFactory?: AIFactoryService,
  ) {
    const encKey = this.config.get<string>('TOKEN_ENCRYPTION_KEY', 'CHANGE_ME_32_BYTE_BASE64_KEY');
    const encVersion = Number(this.config.get<number>('TOKEN_ENCRYPTION_KEY_VERSION', 1));
    this.encryptionService = new TokenEncryptionService(encKey, encVersion);

    const baseUrl = this.config.get<string>('THREADS_API_BASE_URL', 'https://graph.threads.net/v1.0');
    this.threadsApiClient = new ThreadsApiClient(baseUrl);
  }

  @Process('INGESTION')
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
          if (postText && this.aiFactory) {
            try {
              let memoryItem = await prisma.memoryItem.findFirst({
                where: { workspaceId, sourceId: threadPost.id },
              });

              if (!memoryItem) {
                memoryItem = await prisma.memoryItem.create({
                  data: {
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
                });
              }

              const aiProvider = this.aiFactory.getProvider();

              // Generate both embeddings:
              // - DOCUMENT: for asymmetric semantic retrieval (retrieveMemories)
              // - SIMILARITY: for symmetric duplicate detection (checkDuplicate)
              const [docResponse, simResponse] = await Promise.all([
                aiProvider.embed({
                  texts: [postText],
                  taskType: 'DOCUMENT',
                }),
                aiProvider.embed({
                  texts: [postText],
                  taskType: 'SIMILARITY',
                }),
              ]);

              const docVector = docResponse.embeddings[0];
              const simVector = simResponse.embeddings[0];

              if (docVector && docVector.length > 0) {
                await this.memoryRepo.upsertEmbedding(
                  memoryItem.id,
                  docVector,
                  aiProvider.modelName,
                  docVector.length,
                  'DOCUMENT',
                  'v2',
                );
              }

              if (simVector && simVector.length > 0) {
                await this.memoryRepo.upsertEmbedding(
                  memoryItem.id,
                  simVector,
                  aiProvider.modelName,
                  simVector.length,
                  'SIMILARITY',
                  'v2',
                );
              }
            } catch (embedErr) {
              this.logger.warn(
                { err: embedErr, postId },
                'Failed to create dual vector memory embeddings for ingested post, continuing',
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

      // If initial ingestion and posts were found, trigger style extraction
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
        progressMessage: `Successfully ingested ${totalIngested} posts`,
        resultEntityType: 'thread_post',
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

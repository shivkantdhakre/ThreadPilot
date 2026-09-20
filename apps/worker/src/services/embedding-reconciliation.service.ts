import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { prisma, MemoryRepository } from '@threadpilot/database';
import { QUEUES, EmbeddingJobPayload } from '@threadpilot/types';
import { AIFactoryService } from './ai-factory.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { randomUUID } from 'crypto';

@Injectable()
export class EmbeddingReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingReconciliationService.name);
  private db: any = prisma;
  private memoryRepo = new MemoryRepository(prisma);
  private intervalRef: NodeJS.Timeout | null = null;

  constructor(
    @InjectQueue(QUEUES.EMBEDDING) private readonly embeddingQueue: Queue,
    private readonly aiFactory: AIFactoryService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redisClient?: Redis,
  ) {}

  startRecurring(intervalMs = Number(process.env.RECONCILIATION_INTERVAL_MS ?? 15 * 60 * 1000)): void {
    if (this.intervalRef) {
      this.stopRecurring();
    }
    if (intervalMs > 0) {
      this.logger.log(`Starting automated embedding reconciliation timer (interval: ${intervalMs}ms)`);
      this.intervalRef = setInterval(() => {
        this.reconcileAllWorkspaces().catch((err) => {
          this.logger.error({ err }, 'Error running automated embedding reconciliation cycle');
        });
      }, intervalMs);
    }
  }

  stopRecurring(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  isRecurringActive(): boolean {
    return this.intervalRef !== null;
  }

  onModuleInit() {
    if (process.env.NODE_ENV !== 'test' || process.env.ENABLE_TEST_RECONCILIATION === 'true') {
      this.startRecurring();
    }
    if (process.env.RECONCILE_ON_STARTUP === 'true') {
      this.reconcileAllWorkspaces().catch((err) => {
        this.logger.error({ err }, 'Error running startup reconciliation cycle');
      });
    }
  }

  onModuleDestroy() {
    this.stopRecurring();
  }

  /**
   * Reconciles missing vector representations for a specific workspace.
   * Finds items where required representations (DOCUMENT and/or SIMILARITY) are missing,
   * and enqueues idempotent BullMQ embedding jobs using hyphenated deterministic job IDs.
   */
  async reconcileWorkspace(
    workspaceId: string,
    model?: string,
    pipelineVersion = 'v2',
  ): Promise<{ checked: number; enqueued: number; itemIds: string[] }> {
    const activeModel = model ?? this.aiFactory.getProvider().modelName;
    const itemsNeedingRepair = await this.memoryRepo.findItemsNeedingReEmbedding(
      workspaceId,
      {
        model: activeModel,
        targetPipelineVersion: pipelineVersion,
      },
    );

    let enqueuedCount = 0;
    const enqueuedItemIds: string[] = [];

    for (const item of itemsNeedingRepair) {
      for (const taskType of item.missingTaskTypes) {
        // Deterministic BullMQ job ID without colons
        const deterministicJobId = `embedding-${item.id}-${activeModel}-${taskType}-${pipelineVersion}`;

        const payload: EmbeddingJobPayload = {
          requestId: randomUUID(),
          workspaceId,
          memoryItemId: item.id,
          text: item.content,
          taskType,
          model: activeModel,
          pipelineVersion,
        };

        await this.embeddingQueue.add('EMBEDDING', payload, {
          jobId: deterministicJobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        });

        enqueuedCount++;
      }
      enqueuedItemIds.push(item.id);
    }

    if (enqueuedCount > 0) {
      this.logger.log(
        `Reconciliation: enqueued ${enqueuedCount} missing embedding job(s) for ${itemsNeedingRepair.length} item(s) in workspace ${workspaceId}`,
      );
    }

    return {
      checked: itemsNeedingRepair.length,
      enqueued: enqueuedCount,
      itemIds: enqueuedItemIds,
    };
  }

  /**
   * Reconciles missing vector representations across all active workspaces.
   */
  async reconcileAllWorkspaces(options?: {
    model?: string;
    pipelineVersion?: string;
  }): Promise<{ totalWorkspaces: number; totalEnqueued: number }> {
    // Leader lease: ensure only one worker replica runs the global scan cycle at a time
    const LEASE_KEY = 'reconciliation-run:leader-lease';
    const LEASE_TTL_MS = 60000;
    const leaseToken = randomUUID();
    let leaseAcquired = false;

    if (this.redisClient) {
      try {
        const res = await this.redisClient.set(LEASE_KEY, leaseToken, 'PX', LEASE_TTL_MS, 'NX');
        leaseAcquired = res === 'OK';
        if (!leaseAcquired) {
          this.logger.log('Another worker holds reconciliation leader lease; skipping this cycle.');
          return { totalWorkspaces: 0, totalEnqueued: 0 };
        }
      } catch (leaseErr) {
        this.logger.warn({ leaseErr }, 'Failed to acquire reconciliation leader lease, proceeding anyway');
      }
    }

    try {
      const workspaces = await this.db.workspace.findMany({
        select: { id: true },
      });

      let totalEnqueued = 0;
      for (const ws of workspaces) {
        try {
          const res = await this.reconcileWorkspace(
            ws.id,
            options?.model,
            options?.pipelineVersion,
          );
          totalEnqueued += res.enqueued;
        } catch (wsErr) {
          this.logger.error({ wsErr, workspaceId: ws.id }, 'Reconciliation failed for workspace');
        }
      }

      return {
        totalWorkspaces: workspaces.length,
        totalEnqueued,
      };
    } finally {
      if (leaseAcquired && this.redisClient) {
        await this.redisClient
          .eval(
            `if redis.call("GET", KEYS[1]) == ARGV[1] then
              return redis.call("DEL", KEYS[1])
            else
              return 0
            end`,
            1,
            LEASE_KEY,
            leaseToken,
          )
          .catch(() => {});
      }
    }
  }
}

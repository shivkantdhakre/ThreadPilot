import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { prisma, MemoryRepository } from '@threadpilot/database';
import { QUEUES, EmbeddingJobPayload } from '@threadpilot/types';
import { AIFactoryService } from './ai-factory.service';
import { randomUUID } from 'crypto';

@Injectable()
export class EmbeddingReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingReconciliationService.name);
  private readonly memoryRepo = new MemoryRepository(prisma);
  private intervalRef: NodeJS.Timeout | null = null;

  constructor(
    @InjectQueue(QUEUES.EMBEDDING) private readonly embeddingQueue: Queue,
    private readonly aiFactory: AIFactoryService,
  ) {}

  onModuleInit() {
    const intervalMs = Number(process.env.RECONCILIATION_INTERVAL_MS ?? 15 * 60 * 1000);
    if (intervalMs > 0 && process.env.NODE_ENV !== 'test') {
      this.logger.log(`Starting automated embedding reconciliation timer (interval: ${intervalMs}ms)`);
      this.intervalRef = setInterval(() => {
        this.reconcileAllWorkspaces().catch((err) => {
          this.logger.error({ err }, 'Error running automated embedding reconciliation cycle');
        });
      }, intervalMs);
    }
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
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
    const workspaces = await prisma.workspace.findMany({
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
  }
}

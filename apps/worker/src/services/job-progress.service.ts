import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { prisma } from '@threadpilot/database';
import { JobStatus, JobLifecycleStage } from '@threadpilot/types';
import { REDIS_CLIENT } from '../redis/redis.module';

export interface ProgressUpdate {
  status: JobStatus;
  stage?: JobLifecycleStage;
  progress: number;
  progressMessage: string;
  resultEntityType?: string | null | undefined;
  resultEntityId?: string | null | undefined;
  error?: string | null | undefined;
}

@Injectable()
export class JobProgressService {
  private readonly logger = new Logger(JobProgressService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async update(requestId: string, update: ProgressUpdate): Promise<void> {
    const isStarting = update.status === 'RUNNING' && update.progress <= 10;
    const isFinishing = update.status === 'COMPLETE' || update.status === 'FAILED';

    try {
      // 1. Update Database
      await prisma.jobRecord.update({
        where: { requestId },
        data: {
          status: update.status,
          progress: update.progress,
          progressMessage: update.progressMessage,
          ...(update.resultEntityType !== undefined ? { resultEntityType: update.resultEntityType } : {}),
          ...(update.resultEntityId !== undefined ? { resultEntityId: update.resultEntityId } : {}),
          ...(update.error !== undefined ? { error: update.error } : {}),
          ...(isStarting ? { startedAt: new Date() } : {}),
          ...(isFinishing ? { completedAt: new Date() } : {}),
        },
      });

      // 2. Publish to Redis Pub/Sub for SSE live progress
      const channel = `tp:job:progress:${requestId}`;
      const payload = JSON.stringify({
        requestId,
        status: update.status,
        stage: update.stage ?? null,
        progress: update.progress,
        progressMessage: update.progressMessage,
        resultEntityType: update.resultEntityType ?? null,
        resultEntityId: update.resultEntityId ?? null,
        error: update.error ?? null,
        timestamp: new Date().toISOString(),
      });

      await this.redis.publish(channel, payload);
    } catch (err) {
      this.logger.error({ err, requestId }, `Failed to update job progress for ${requestId}`);
    }
  }
}


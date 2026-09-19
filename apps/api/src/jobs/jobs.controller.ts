import {
  Controller,
  Get,
  Param,
  UseGuards,
  Sse,
  Inject,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard';
import { WorkspaceId } from '../common/decorators/workspace.decorator';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { JobsService } from './jobs.service';

@Controller('jobs')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  @Get(':requestId/status')
  async getStatus(
    @WorkspaceId() workspaceId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.jobsService.getJobStatus(workspaceId, requestId);
  }

  @Sse(':requestId/stream')
  streamProgress(
    @WorkspaceId() workspaceId: string,
    @Param('requestId') requestId: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let isCompleted = false;
      const subClient = this.redisClient.duplicate();

      // Check current status in DB first
      this.jobsService
        .getJobStatus(workspaceId, requestId)
        .then(async (currentJob) => {
          if (!currentJob) {
            subscriber.error(new NotFoundException(`Job ${requestId} not found`));
            return;
          }

          // Emit initial state
          subscriber.next({
            data: {
              requestId: currentJob.requestId,
              status: currentJob.status,
              progress: currentJob.progress,
              progressMessage: currentJob.progressMessage,
              resultEntityType: currentJob.resultEntityType,
              resultEntityId: currentJob.resultEntityId,
              error: currentJob.error,
            },
          });

          // If already finished, complete stream
          if (currentJob.status === 'COMPLETE' || currentJob.status === 'FAILED') {
            isCompleted = true;
            subscriber.complete();
            return;
          }

          // Otherwise subscribe to live progress channel
          const channel = `tp:job:progress:${requestId}`;
          await subClient.subscribe(channel);

          subClient.on('message', (chan, message) => {
            if (chan !== channel || isCompleted) return;

            try {
              const data = JSON.parse(message);
              subscriber.next({ data });

              if (data.status === 'COMPLETE' || data.status === 'FAILED' || data.progress === 100) {
                isCompleted = true;
                subscriber.complete();
              }
            } catch (err) {
              subscriber.next({ data: { raw: message } });
            }
          });
        })
        .catch((err) => {
          subscriber.error(err);
        });

      return () => {
        isCompleted = true;
        subClient.unsubscribe().catch(() => {});
        subClient.quit().catch(() => {});
      };
    });
  }
}

import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  UseGuards,
  Sse,
  Inject,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard';
import { WorkspaceId } from '../common/decorators/workspace.decorator';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.list(workspaceId, {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Patch(':id/read')
  async markAsRead(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(workspaceId, id);
  }

  @Post('read-all')
  async markAllAsRead(@WorkspaceId() workspaceId: string) {
    return this.notificationsService.markAllAsRead(workspaceId);
  }

  @Sse('stream')
  stream(@WorkspaceId() workspaceId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const subClient = this.redisClient.duplicate();
      const channel = `tp:notifications:${workspaceId}`;

      subClient.subscribe(channel).then(() => {
        subClient.on('message', (chan, message) => {
          if (chan !== channel) return;
          try {
            subscriber.next({ data: JSON.parse(message) });
          } catch {
            subscriber.next({ data: message });
          }
        });
      });

      return () => {
        subClient.unsubscribe().catch(() => {});
        subClient.quit().catch(() => {});
      };
    });
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Headers,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard';
import { WorkspaceId } from '../common/decorators/workspace.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EngagementService } from './engagement.service';

@Controller('engagement')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class EngagementController {
  constructor(private readonly engagementService: EngagementService) {}

  @Get('interactions')
  async listInteractions(
    @WorkspaceId() workspaceId: string,
    @Query('status') status?: string,
    @Query('intent') intent?: string,
    @Query('priorityScore') priorityScore?: string,
    @Query('socialAccountId') socialAccountId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.engagementService.listInteractions(workspaceId, {
      status,
      intent,
      priorityScore: priorityScore ? parseInt(priorityScore, 10) : undefined,
      socialAccountId,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('stats')
  async getStats(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
  ) {
    return this.engagementService.getStats(workspaceId, socialAccountId);
  }

  @Get('interactions/:id')
  async getInteraction(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.engagementService.getInteraction(workspaceId, id);
  }

  @Post('sync')
  async triggerSync(
    @WorkspaceId() workspaceId: string,
    @Body() body: { socialAccountId: string; rootThreadsPostId?: string },
  ) {
    if (!body.socialAccountId) {
      throw new BadRequestException('socialAccountId is required');
    }
    return this.engagementService.triggerSync(workspaceId, body.socialAccountId, body.rootThreadsPostId);
  }

  @Post('interactions/:id/draft')
  async triggerDraft(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body?: { userPreference?: string; regenerate?: boolean },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.engagementService.triggerDraft(workspaceId, id, body ?? {}, idempotencyKey);
  }

  @Patch('interactions/:id/draft')
  async updateDraft(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body: { body: string; versionNumber?: number },
    @Headers('if-match') ifMatchHeader: string,
    @CurrentUser('userId') userId: string,
  ) {
    if (!body.body) {
      throw new BadRequestException('body is required');
    }

    const versionNumber = body.versionNumber ?? (ifMatchHeader ? parseInt(ifMatchHeader.replace(/"/g, ''), 10) : NaN);
    if (isNaN(versionNumber)) {
      throw new BadRequestException('If-Match header or body.versionNumber is required for optimistic concurrency');
    }

    return this.engagementService.updateDraft(workspaceId, id, body.body, versionNumber, userId);
  }

  @Post('interactions/:id/approve')
  async approveDraft(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body?: { versionId?: string },
    @CurrentUser('userId') userId?: string,
  ) {
    return this.engagementService.approveDraft(workspaceId, id, body?.versionId, userId);
  }

  @Post('interactions/:id/dismiss')
  async dismissInteraction(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body?: { reason?: string },
    @CurrentUser('userId') userId?: string,
  ) {
    return this.engagementService.dismissInteraction(workspaceId, id, body?.reason, userId);
  }

  @Post('executions/:id/resolve')
  async resolveExecution(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body()
    body: {
      resolution: 'CONFIRMED_PUBLISHED' | 'CONFIRMED_NOT_PUBLISHED';
      externalPostId?: string;
      notes?: string;
    },
    @CurrentUser('userId') userId?: string,
  ) {
    if (!body.resolution || !['CONFIRMED_PUBLISHED', 'CONFIRMED_NOT_PUBLISHED'].includes(body.resolution)) {
      throw new BadRequestException('resolution must be CONFIRMED_PUBLISHED or CONFIRMED_NOT_PUBLISHED');
    }

    return this.engagementService.resolveExecution(workspaceId, id, body, userId);
  }
}

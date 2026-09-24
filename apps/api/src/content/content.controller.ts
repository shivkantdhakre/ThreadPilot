import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard';
import { WorkspaceId } from '../common/decorators/workspace.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ContentService } from './content.service';
import type { ScheduleDraftDto, ResolveScheduleDto } from '@threadpilot/types';

@Controller('content')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('drafts')
  async listDrafts(
    @WorkspaceId() workspaceId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ data: any[]; meta: { total: number; page: number; limit: number; hasMore: boolean } }> {
    return this.contentService.listDrafts(workspaceId, {
      ...(status ? { status } : {}),
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('drafts/:id')
  async getDraft(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.contentService.getDraft(workspaceId, id);
  }

  @Post('drafts')
  async createDraft(
    @WorkspaceId() workspaceId: string,
    @CurrentUser('userId') userId: string,
    @Body()
    body: {
      body: string;
      hook?: string;
      cta?: string;
      ideaId?: string;
    },
  ) {
    return this.contentService.createDraft(workspaceId, userId, body);
  }

  @Patch('drafts/:id')
  async updateDraft(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body()
    body: {
      status?: string;
    },
  ) {
    return this.contentService.updateDraft(workspaceId, id, body);
  }

  @Get('drafts/:id/versions')
  async listVersions(
    @WorkspaceId() workspaceId: string,
    @Param('id') draftId: string,
  ) {
    return this.contentService.listVersions(workspaceId, draftId);
  }

  @Post('drafts/:id/versions')
  async createVersion(
    @WorkspaceId() workspaceId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') draftId: string,
    @Body()
    body: {
      body: string;
      hook?: string;
      cta?: string;
      diffSummary?: string;
    },
  ) {
    return this.contentService.createVersion(workspaceId, draftId, userId, body);
  }

  @Delete('drafts/:id')
  async deleteDraft(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.contentService.deleteDraft(workspaceId, id);
  }

  @Post('generate')
  async generate(
    @WorkspaceId() workspaceId: string,
    @CurrentUser('userId') userId: string,
    @Body()
    body: {
      ideaId?: string;
      topic?: string;
      format?: string;
      tone?: string;
      additionalContext?: string;
    },
  ) {
    return this.contentService.generate(workspaceId, userId, body);
  }

  @Post('improve')
  async improve(
    @WorkspaceId() workspaceId: string,
    @Body()
    body: {
      draftId: string;
      versionId: string;
      instruction: string;
    },
  ) {
    return this.contentService.improve(workspaceId, body);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PHASE 2: SCHEDULING & RESOLUTION ENDPOINTS
  // ───────────────────────────────────────────────────────────────────────────

  @Post('drafts/:id/schedule')
  async scheduleDraft(
    @WorkspaceId() workspaceId: string,
    @Param('id') draftId: string,
    @Body() body: ScheduleDraftDto,
  ): Promise<any> {
    return this.contentService.scheduleDraft(workspaceId, draftId, body);
  }

  @Get('schedules')
  async listSchedules(
    @WorkspaceId() workspaceId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('order') order?: 'asc' | 'desc',
  ): Promise<{ data: any[]; meta: { total: number; page: number; limit: number; hasMore: boolean } }> {
    return this.contentService.listSchedules(workspaceId, {
      ...(status ? { status } : {}),
      ...(order ? { order } : {}),
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('schedules/:id')
  async getSchedule(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.contentService.getSchedule(workspaceId, id);
  }

  @Post('schedules/:id/cancel')
  async cancelSchedule(
    @WorkspaceId() workspaceId: string,
    @Param('id') scheduledPostId: string,
  ) {
    return this.contentService.cancelSchedule(workspaceId, scheduledPostId);
  }

  @Post('schedules/:id/resolve')
  async resolveSchedule(
    @WorkspaceId() workspaceId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') scheduledPostId: string,
    @Body() body: ResolveScheduleDto,
  ) {
    return this.contentService.resolveSchedule(workspaceId, userId, scheduledPostId, body);
  }
}

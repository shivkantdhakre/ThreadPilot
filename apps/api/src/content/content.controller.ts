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
  ) {
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
  ) {
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
}

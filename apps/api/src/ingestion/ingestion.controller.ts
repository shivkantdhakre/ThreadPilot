import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard';
import { WorkspaceId } from '../common/decorators/workspace.decorator';
import { IngestionService } from './ingestion.service';

@Controller('ingestion')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('start')
  async startIngestion(
    @WorkspaceId() workspaceId: string,
    @Body()
    body: {
      socialAccountId?: string;
      maxPosts?: number;
      pageSize?: number;
      isInitial?: boolean;
    },
  ) {
    return this.ingestionService.startIngestion(workspaceId, body);
  }

  @Get('status')
  async getStatus(@WorkspaceId() workspaceId: string) {
    return this.ingestionService.getLatestStatus(workspaceId);
  }

  @Get('posts')
  async getPosts(
    @WorkspaceId() workspaceId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ingestionService.listIngestedPosts(workspaceId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }
}

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard';
import { WorkspaceId } from '../common/decorators/workspace.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { RecommendationAttributionStatus } from '@threadpilot/database';

@Controller('recommendations')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class RecommendationsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  async getRecommendations(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
    @Query('status') status?: RecommendationAttributionStatus,
    @Query('limit') limit?: string,
  ) {
    const params: {
      socialAccountId?: string;
      status?: RecommendationAttributionStatus;
      limit?: number;
    } = {};
    if (socialAccountId) params.socialAccountId = socialAccountId;
    if (status) params.status = status;
    if (limit) params.limit = parseInt(limit, 10);

    return this.analyticsService.getRecommendations(workspaceId, params);
  }

  @Post(':id/accept')
  async acceptRecommendation(
    @WorkspaceId() workspaceId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') exposureId: string,
  ) {
    return this.analyticsService.acceptRecommendation(workspaceId, userId, exposureId);
  }

  @Post(':id/dismiss')
  async dismissRecommendation(
    @WorkspaceId() workspaceId: string,
    @Param('id') exposureId: string,
  ) {
    return this.analyticsService.dismissRecommendation(workspaceId, exposureId);
  }
}

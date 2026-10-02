import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard';
import { WorkspaceId } from '../common/decorators/workspace.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import {
  AggregationDimension,
  ObservationSlot,
  AggregationGranularity,
  EvidenceGrade,
  RecommendationAttributionStatus,
} from '@threadpilot/database';

@Controller('analytics')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  async getOverview(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
  ) {
    return this.analyticsService.getOverview(workspaceId, socialAccountId);
  }

  @Get('aggregates')
  async getAggregates(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
    @Query('dimension') dimension?: AggregationDimension,
    @Query('slot') slot?: ObservationSlot,
    @Query('granularity') granularity?: AggregationGranularity,
  ) {
    const params: {
      socialAccountId?: string;
      dimension?: AggregationDimension;
      slot?: ObservationSlot;
      granularity?: AggregationGranularity;
    } = {};
    if (socialAccountId) params.socialAccountId = socialAccountId;
    if (dimension) params.dimension = dimension;
    if (slot) params.slot = slot;
    if (granularity) params.granularity = granularity;

    return this.analyticsService.getAggregates(workspaceId, params);
  }

  @Get('insights')
  async getInsights(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
    @Query('isActive') isActive?: string,
    @Query('evidenceGrade') evidenceGrade?: EvidenceGrade,
    @Query('limit') limit?: string,
  ) {
    const params: {
      socialAccountId?: string;
      isActive?: boolean;
      evidenceGrade?: EvidenceGrade;
      limit?: number;
    } = {};
    if (socialAccountId) params.socialAccountId = socialAccountId;
    if (isActive !== undefined) params.isActive = isActive === 'true';
    if (evidenceGrade) params.evidenceGrade = evidenceGrade;
    if (limit) params.limit = parseInt(limit, 10);

    return this.analyticsService.getInsights(workspaceId, params);
  }

  @Get('learning')
  async getLearningProfile(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
  ) {
    return this.analyticsService.getLearningProfile(workspaceId, socialAccountId);
  }

  @Get('recommendations')
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

  @Post('recommendations/:id/accept')
  async acceptRecommendation(
    @WorkspaceId() workspaceId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') exposureId: string,
  ) {
    return this.analyticsService.acceptRecommendation(workspaceId, userId, exposureId);
  }

  @Post('recommendations/:id/dismiss')
  async dismissRecommendation(
    @WorkspaceId() workspaceId: string,
    @Param('id') exposureId: string,
  ) {
    return this.analyticsService.dismissRecommendation(workspaceId, exposureId);
  }

  @Post('admin/outbox/replay')
  async replayOutboxEvents(
    @WorkspaceId() workspaceId: string,
    @CurrentUser('userId') userId: string,
    @Body() body: { eventIds: string[]; reason?: string },
  ) {
    return this.analyticsService.replayOutboxEvents(
      workspaceId,
      userId,
      body.eventIds,
      body.reason || 'Manual admin replay',
    );
  }
}

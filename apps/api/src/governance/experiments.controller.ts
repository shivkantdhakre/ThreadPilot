import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard.js';
import { WorkspaceId } from '../common/decorators/workspace.decorator.js';
import { GovernanceService } from './governance.service.js';

@Controller('experiments')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class ExperimentsController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Post()
  async createExperiment(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId: string,
    @Body() body: any,
  ) {
    const targetAccountId = socialAccountId || body?.socialAccountId;
    if (!targetAccountId) {
      throw new BadRequestException('socialAccountId is required in query parameters or request body');
    }
    return this.governanceService.createExperiment(workspaceId, targetAccountId, body);
  }

  @Post(':id/activate')
  async activateExperiment(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.governanceService.activateExperiment(workspaceId, id);
  }

  @Get()
  async listExperiments(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
  ) {
    return this.governanceService.listExperiments(workspaceId, socialAccountId);
  }

  @Get(':id')
  async getExperiment(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.governanceService.getExperiment(workspaceId, id);
  }
}

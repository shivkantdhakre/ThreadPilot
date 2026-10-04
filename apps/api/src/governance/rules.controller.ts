import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
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

@Controller('rules')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class RulesController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Post()
  async createRule(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId: string,
    @Body() body: any,
  ): Promise<any> {
    const targetAccountId = socialAccountId || body?.socialAccountId;
    if (!targetAccountId) {
      throw new BadRequestException('socialAccountId query parameter is required');
    }
    return this.governanceService.createRule(workspaceId, targetAccountId, body);
  }

  @Get()
  async listRules(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
  ): Promise<any[]> {
    return this.governanceService.listRules(workspaceId, socialAccountId);
  }

  @Get('executions')
  async listAllRuleExecutions(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
    @Query('limit') limit?: string,
  ): Promise<any[]> {
    return this.governanceService.listRuleExecutions(
      workspaceId,
      socialAccountId,
      undefined,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get(':id/executions')
  async listRuleExecutions(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Query('socialAccountId') socialAccountId?: string,
    @Query('limit') limit?: string,
  ): Promise<any[]> {
    return this.governanceService.listRuleExecutions(
      workspaceId,
      socialAccountId,
      id,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Put(':id')
  async updateRule(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<any> {
    return this.governanceService.updateRule(workspaceId, id, body);
  }

  @Patch(':id/toggle')
  async toggleRule(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() body?: { isActive?: boolean },
  ): Promise<any> {
    const existing = await this.governanceService.listRules(workspaceId);
    const rule = existing.find((r) => r.id === id);
    const newStatus = body?.isActive !== undefined ? body.isActive : !rule?.isActive;
    return this.governanceService.updateRule(workspaceId, id, { isActive: newStatus });
  }

  @Delete(':id')
  async deleteRule(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.governanceService.deleteRule(workspaceId, id);
  }
}

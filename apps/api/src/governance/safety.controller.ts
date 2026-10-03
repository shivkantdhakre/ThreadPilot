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
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator.js';
import { GovernanceService } from './governance.service.js';

@Controller('safety')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class SafetyController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get('audits')
  async listAudits(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
  ): Promise<any[]> {
    return this.governanceService.listSafetyAudits(workspaceId, socialAccountId);
  }

  @Get()
  async listAuditsRoot(
    @WorkspaceId() workspaceId: string,
  ): Promise<any[]> {
    return this.governanceService.listSafetyAudits(workspaceId);
  }

  @Get('audit/:id')
  async getAudit(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    return this.governanceService.getSafetyAudit(workspaceId, id);
  }

  @Post('override')
  async requestOverride(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { auditId: string; reason: string; riskAcknowledged: boolean },
  ): Promise<any> {
    if (!body.auditId) {
      throw new BadRequestException('auditId is required');
    }
    return this.governanceService.requestSafetyOverride(
      workspaceId,
      body.auditId,
      user.userId,
      body,
    );
  }
}

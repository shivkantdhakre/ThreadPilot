import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard.js';
import { WorkspaceId } from '../common/decorators/workspace.decorator.js';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator.js';
import { GovernanceService } from './governance.service.js';
import { UpdateOperatorConfigRequestSchema } from '@threadpilot/types';

@Controller('operator')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class OperatorController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get('status')
  async getStatus(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
  ): Promise<any> {
    return this.governanceService.getOperatorStatus(workspaceId, socialAccountId);
  }

  @Patch('config')
  async updateConfig(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: any,
  ): Promise<any> {
    const targetAccountId = socialAccountId || body?.socialAccountId;
    if (!targetAccountId) {
      throw new BadRequestException('socialAccountId is required in query parameters or request body');
    }
    try {
      const parsed = UpdateOperatorConfigRequestSchema.parse(body);
      return this.governanceService.updateOperatorConfig(
        workspaceId,
        targetAccountId,
        user.userId,
        parsed,
      );
    } catch (err: any) {
      throw new BadRequestException(`Invalid operator config payload: ${err?.message || ''}`);
    }
  }

  @Post('pause')
  async pauseOperator(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body?: any,
  ): Promise<any> {
    const targetAccountId = socialAccountId || body?.socialAccountId;
    if (!targetAccountId) {
      throw new BadRequestException('socialAccountId is required in query parameters or request body');
    }
    return this.governanceService.pauseOperator(
      workspaceId,
      targetAccountId,
      user.userId,
    );
  }

  @Post('toggle')
  async toggleOperator(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('resume') resume?: string,
    @Body() body?: any,
  ): Promise<any> {
    const targetAccountId = socialAccountId || body?.socialAccountId;
    if (!targetAccountId) {
      throw new BadRequestException('socialAccountId is required in query parameters or request body');
    }
    const isResume = resume === 'true' || resume === '1' || body?.resume === true;
    return this.governanceService.toggleOperator(
      workspaceId,
      targetAccountId,
      user.userId,
      isResume,
    );
  }
}

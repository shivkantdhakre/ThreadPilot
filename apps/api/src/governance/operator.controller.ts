import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard.js';
import { WorkspaceId } from '../common/decorators/workspace.decorator.js';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator.js';
import { GovernanceService } from './governance.service.js';

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

  @Post('pause')
  async pauseOperator(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<any> {
    return this.governanceService.pauseOperator(
      workspaceId,
      socialAccountId,
      user.userId,
    );
  }

  @Post('toggle')
  async toggleOperator(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('resume') resume?: string,
  ): Promise<any> {
    const isResume = resume === 'true' || resume === '1';
    return this.governanceService.toggleOperator(
      workspaceId,
      socialAccountId,
      user.userId,
      isResume,
    );
  }
}

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard.js';
import { WorkspaceId } from '../common/decorators/workspace.decorator.js';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator.js';
import { GovernanceService } from './governance.service.js';
import { AdaptationProposalStatus } from '@threadpilot/database';

@Controller('adaptation')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class AdaptationController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get('proposals')
  async listProposals(
    @WorkspaceId() workspaceId: string,
    @Query('socialAccountId') socialAccountId?: string,
    @Query('status') status?: AdaptationProposalStatus,
  ) {
    return this.governanceService.listAdaptationProposals(
      workspaceId,
      socialAccountId,
      status,
    );
  }

  @Post('proposals/:id/apply')
  async applyProposal(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.governanceService.applyAdaptationProposal(
      workspaceId,
      id,
      user.userId,
    );
  }
}

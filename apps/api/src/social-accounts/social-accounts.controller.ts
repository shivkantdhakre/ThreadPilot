import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SocialAccountsService } from './social-accounts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard';
import { WorkspaceId } from '../common/decorators/workspace.decorator';

@Controller('social-accounts')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class SocialAccountsController {
  constructor(private readonly service: SocialAccountsService) {}

  @Get()
  listAccounts(@WorkspaceId() workspaceId: string) {
    return this.service.listAccounts(workspaceId);
  }

  @Get(':id')
  getAccount(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.service.getAccount(workspaceId, id);
  }
}

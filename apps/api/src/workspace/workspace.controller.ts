import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceScopeGuard } from '../common/guards/workspace-scope.guard';
import { WorkspaceId } from '../common/decorators/workspace.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { IsString, MinLength } from 'class-validator';

export class UpdateWorkspaceDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

@Controller('workspaces')
@UseGuards(JwtAuthGuard, WorkspaceScopeGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get(':workspaceId')
  getWorkspace(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workspaceService.getWorkspace(workspaceId, user.userId);
  }

  @Patch(':workspaceId')
  updateWorkspace(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspaceService.updateWorkspace(workspaceId, user.userId, dto.name);
  }
}

import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from './current-user.decorator';

export const WorkspaceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<
      Request & {
        user?: AuthenticatedUser;
        workspaceId?: string;
        params: Record<string, string>;
        headers: Record<string, string | string[] | undefined>;
      }
    >();

    // Priority:
    // 1. request.workspaceId (set by WorkspaceScopeGuard)
    // 2. header 'x-workspace-id'
    // 3. route param 'workspaceId'
    // 4. user.workspaceId (default workspace)
    const headerWorkspaceId = request.headers['x-workspace-id'];
    const resolvedHeader = Array.isArray(headerWorkspaceId) ? headerWorkspaceId[0] : headerWorkspaceId;

    const workspaceId =
      request.workspaceId ??
      resolvedHeader ??
      request.params?.['workspaceId'] ??
      request.user?.workspaceId;

    if (!workspaceId) {
      throw new BadRequestException('Workspace ID is required (via x-workspace-id header, route param, or user context)');
    }

    return workspaceId;
  },
);

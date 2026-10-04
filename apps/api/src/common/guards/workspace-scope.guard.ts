import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { prisma } from '@threadpilot/database';
import type { Request } from 'express';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class WorkspaceScopeGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & {
        user?: AuthenticatedUser;
        workspaceId?: string;
        params: Record<string, string>;
        query: Record<string, string>;
        body: Record<string, unknown>;
        headers: Record<string, string | string[] | undefined>;
      }
    >();

    const user = request.user;
    if (!user || !user.userId) {
      throw new ForbiddenException('User authentication required for workspace access');
    }

    const headerWorkspaceId = request.headers['x-workspace-id'];
    const resolvedHeader = Array.isArray(headerWorkspaceId) ? headerWorkspaceId[0] : headerWorkspaceId;

    const targetWorkspaceId =
      resolvedHeader ??
      request.params?.['workspaceId'] ??
      request.query?.['workspaceId'] ??
      (typeof request.body?.['workspaceId'] === 'string' ? request.body['workspaceId'] : undefined) ??
      user.workspaceId;

    if (!targetWorkspaceId) {
      // If endpoint doesn't require a workspace or couldn't determine one
      throw new BadRequestException('Workspace ID could not be determined');
    }

    // Verify tenancy: workspace must belong to the authenticated user or user is an active member
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: targetWorkspaceId,
        userId: user.userId,
      },
      select: { id: true },
    }).catch(() => null);

    if (workspace) {
      request.workspaceId = workspace.id;
      return true;
    }

    if (prisma.workspaceMember?.findFirst) {
      const membership = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: targetWorkspaceId,
          userId: user.userId,
        },
        select: { id: true },
      }).catch(() => null);

      if (membership) {
        request.workspaceId = targetWorkspaceId;
        return true;
      }
    }

    throw new ForbiddenException(`Access to workspace ${targetWorkspaceId} denied`);
  }
}

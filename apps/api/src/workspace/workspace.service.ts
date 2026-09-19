import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@threadpilot/database';

@Injectable()
export class WorkspaceService {
  async getWorkspace(workspaceId: string, userId: string) {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId },
      include: {
        socialAccounts: {
          select: {
            id: true,
            platform: true,
            username: true,
            displayName: true,
            isConnected: true,
            connectedAt: true,
          },
        },
        profile: true,
        preferences: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
  }

  async updateWorkspace(workspaceId: string, userId: string, name: string) {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return prisma.workspace.update({
      where: { id: workspaceId },
      data: { name },
    });
  }
}

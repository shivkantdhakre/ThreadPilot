import { Injectable } from '@nestjs/common';
import { prisma } from '@threadpilot/database';

@Injectable()
export class SocialAccountsService {
  async listAccounts(workspaceId: string) {
    return prisma.socialAccount.findMany({
      where: { workspaceId },
      select: {
        id: true,
        platform: true,
        externalId: true,
        username: true,
        displayName: true,
        profileUrl: true,
        isConnected: true,
        connectedAt: true,
        disconnectedAt: true,
      },
    });
  }

  async getAccount(workspaceId: string, socialAccountId: string) {
    return prisma.socialAccount.findFirst({
      where: { id: socialAccountId, workspaceId },
      select: {
        id: true,
        platform: true,
        externalId: true,
        username: true,
        displayName: true,
        profileUrl: true,
        isConnected: true,
        connectedAt: true,
        disconnectedAt: true,
      },
    });
  }
}

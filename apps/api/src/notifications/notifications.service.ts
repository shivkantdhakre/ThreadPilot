import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@threadpilot/database';

@Injectable()
export class NotificationsService {
  async list(workspaceId: string, options?: { unreadOnly?: boolean; limit?: number }) {
    const limit = options?.limit ?? 50;
    const where = {
      workspaceId,
      ...(options?.unreadOnly ? { read: false } : {}),
    };

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({
        where: { workspaceId, read: false },
      }),
    ]);

    return {
      notifications,
      unreadCount,
    };
  }

  async markAsRead(workspaceId: string, id: string) {
    const notification = await prisma.notification.findFirst({
      where: { id, workspaceId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllAsRead(workspaceId: string) {
    return prisma.notification.updateMany({
      where: { workspaceId, read: false },
      data: { read: true },
    });
  }
}

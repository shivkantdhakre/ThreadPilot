import { Injectable, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { prisma } from '@threadpilot/database';
import type { PrismaClient } from '@threadpilot/database';
import { JobDispatcherService } from '../jobs/job-dispatcher.service';
import { randomUUID } from 'crypto';

@Injectable()
export class IngestionService {
  constructor(
    private readonly jobDispatcher: JobDispatcherService,
    @Optional() private readonly db: PrismaClient = prisma,
  ) {}

  async startIngestion(
    workspaceId: string,
    options?: {
      socialAccountId?: string;
      maxPosts?: number;
      pageSize?: number;
      isInitial?: boolean;
    },
  ) {
    let socialAccountId = options?.socialAccountId;
    if (!socialAccountId) {
      const activeAccount = await this.db.socialAccount.findFirst({
        where: { workspaceId, isConnected: true },
      });
      if (!activeAccount) {
        throw new BadRequestException('No active Threads social account found in this workspace');
      }
      socialAccountId = activeAccount.id;
    }

    const requestId = randomUUID();

    await this.jobDispatcher.dispatchIngestion({
      requestId,
      workspaceId,
      socialAccountId,
      maxPosts: options?.maxPosts ?? 500,
      pageSize: options?.pageSize ?? 25,
      isInitial: options?.isInitial ?? true,
    });

    return { requestId };
  }

  async getLatestStatus(workspaceId: string) {
    const latestJob = await this.db.jobRecord.findFirst({
      where: {
        workspaceId,
        type: 'INGESTION',
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalIngested = await this.db.threadPost.count({
      where: {
        socialAccount: { workspaceId },
        sourceType: 'INGESTED',
      },
    });

    return {
      latestJob,
      totalIngested,
    };
  }

  async listIngestedPosts(
    workspaceId: string,
    options?: { page?: number; limit?: number },
  ) {
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : 25;
    const skip = (page - 1) * limit;

    const where = {
      socialAccount: { workspaceId },
      sourceType: 'INGESTED',
    };

    const [total, posts] = await Promise.all([
      this.db.threadPost.count({ where }),
      this.db.threadPost.findMany({
        where,
        orderBy: { postedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: posts,
      meta: {
        total,
        page,
        limit,
        hasMore: skip + posts.length < total,
      },
    };
  }
}

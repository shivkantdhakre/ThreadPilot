import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@threadpilot/database';

@Injectable()
export class JobsService {
  async getJobStatus(workspaceId: string, requestId: string) {
    const job = await prisma.jobRecord.findFirst({
      where: { requestId, workspaceId },
    });

    if (!job) {
      throw new NotFoundException(`Job with request ID ${requestId} not found in workspace`);
    }

    return job;
  }
}

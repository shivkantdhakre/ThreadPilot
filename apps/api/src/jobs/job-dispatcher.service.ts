import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { prisma } from '@threadpilot/database';
import {
  QUEUES,
  JobType,
  IngestionJobPayload,
  StyleExtractionJobPayload,
  ContentGenerationJobPayload,
  ContentImprovementJobPayload,
  TokenRefreshJobPayload,
} from '@threadpilot/types';

@Injectable()
export class JobDispatcherService {
  private readonly logger = new Logger(JobDispatcherService.name);

  constructor(
    @InjectQueue(QUEUES.INGESTION) private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUES.STYLE) private readonly styleQueue: Queue,
    @InjectQueue(QUEUES.CONTENT) private readonly contentQueue: Queue,
    @InjectQueue(QUEUES.TOKEN_REFRESH) private readonly tokenRefreshQueue: Queue,
  ) {}

  async dispatchIngestion(payload: IngestionJobPayload) {
    return this.dispatch(
      this.ingestionQueue,
      'INGESTION',
      payload.requestId,
      payload.workspaceId,
      payload,
    );
  }

  async dispatchStyleExtraction(payload: StyleExtractionJobPayload) {
    return this.dispatch(
      this.styleQueue,
      'STYLE',
      payload.requestId,
      payload.workspaceId,
      payload,
    );
  }

  async dispatchContentGeneration(payload: ContentGenerationJobPayload) {
    return this.dispatch(
      this.contentQueue,
      'CONTENT',
      payload.requestId,
      payload.workspaceId,
      payload,
    );
  }

  async dispatchContentImprovement(payload: ContentImprovementJobPayload) {
    return this.dispatch(
      this.contentQueue,
      'IMPROVE',
      payload.requestId,
      payload.workspaceId,
      payload,
    );
  }

  async dispatchTokenRefresh(payload: TokenRefreshJobPayload) {
    return this.dispatch(
      this.tokenRefreshQueue,
      'TOKEN_REFRESH',
      payload.requestId,
      payload.workspaceId,
      payload,
    );
  }

  private async dispatch<T extends { requestId: string; workspaceId: string }>(
    queue: Queue,
    type: JobType,
    requestId: string,
    workspaceId: string,
    payload: T,
  ) {
    // Idempotency check: see if job record already exists
    const existing = await prisma.jobRecord.findUnique({
      where: { requestId },
    });

    if (existing) {
      this.logger.log(`Job with requestId ${requestId} already dispatched (status: ${existing.status}). Reusing.`);
      return existing;
    }

    // Create JobRecord with status PENDING
    const jobRecord = await prisma.jobRecord.create({
      data: {
        requestId,
        workspaceId,
        type,
        status: 'PENDING',
        progress: 0,
        progressMessage: 'Job queued',
      },
    });

    // Enqueue to Bull
    const bullJob = await queue.add(type, payload, {
      jobId: requestId,
      removeOnComplete: false,
      removeOnFail: false,
    });

    // Update with bullJobId
    return prisma.jobRecord.update({
      where: { id: jobRecord.id },
      data: { bullJobId: String(bullJob.id) },
    });
  }
}

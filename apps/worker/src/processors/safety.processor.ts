import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES, SafetyEvaluationJobPayload } from '@threadpilot/types';
import { SafetyGateService } from '../services/safety-gate.service.js';

@Processor(QUEUES.SAFETY_EVALUATION)
@Injectable()
export class SafetyProcessor extends WorkerHost {
  private readonly logger = new Logger(SafetyProcessor.name);

  constructor(private readonly safetyGateService: SafetyGateService) {
    super();
  }

  async process(job: Job<SafetyEvaluationJobPayload>): Promise<any> {
    const { workspaceId, socialAccountId, draftId, contentVersionId } = job.data;
    this.logger.log(`Evaluating pre-publish safety gate for draft ${draftId} version ${contentVersionId}`);

    const audit = await this.safetyGateService.initiateAudit(
      workspaceId,
      socialAccountId,
      draftId,
      contentVersionId,
    );

    const result = await this.safetyGateService.evaluateAudit(audit.id);

    return {
      success: true,
      auditId: audit.id,
      status: result.status,
      failedWalls: result.failedWalls,
    };
  }
}

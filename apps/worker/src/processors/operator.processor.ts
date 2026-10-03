import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES, AutonomousOperatorJobPayload } from '@threadpilot/types';
import { AutonomousOperatorService } from '../services/autonomous-operator.service.js';

@Processor(QUEUES.AUTONOMOUS_OPERATOR)
@Injectable()
export class OperatorProcessor extends WorkerHost {
  private readonly logger = new Logger(OperatorProcessor.name);

  constructor(private readonly autonomousOperatorService: AutonomousOperatorService) {
    super();
  }

  async process(job: Job<AutonomousOperatorJobPayload>): Promise<any> {
    const { workspaceId, socialAccountId } = job.data;
    this.logger.log(`Running autonomous operator planning cycle for account ${socialAccountId}`);

    const run = await this.autonomousOperatorService.runPlanningCycle(
      workspaceId,
      socialAccountId,
    );

    return {
      success: true,
      runId: run?.id,
      status: run?.status,
      candidatesScheduled: run?.candidatesScheduled,
    };
  }
}

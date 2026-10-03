import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES, ExperimentAnalysisJobPayload } from '@threadpilot/types';
import { ExperimentationService } from '../services/experimentation.service.js';

@Processor(QUEUES.EXPERIMENT_ANALYSIS)
@Injectable()
export class ExperimentProcessor extends WorkerHost {
  private readonly logger = new Logger(ExperimentProcessor.name);

  constructor(private readonly experimentationService: ExperimentationService) {
    super();
  }

  async process(job: Job<ExperimentAnalysisJobPayload>): Promise<any> {
    const { workspaceId, socialAccountId, experimentId } = job.data;
    this.logger.log(`Executing fixed analysis cutoff lock & statistical analysis for experiment ${experimentId}`);

    const experiment = await this.experimentationService.lockAndAnalyzeExperiment(
      workspaceId,
      socialAccountId,
      experimentId,
    );

    return {
      success: true,
      experimentId: experiment.id,
      status: experiment.status,
      winningVariantId: experiment.winningVariantId,
      welchPValue: experiment.welchPValue,
      observedRelativeLift: experiment.observedRelativeLift,
    };
  }
}

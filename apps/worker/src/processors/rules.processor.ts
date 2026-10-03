import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES, AutomationRuleJobPayload } from '@threadpilot/types';
import { RulesEngineService } from '../services/rules-engine.service.js';

@Processor(QUEUES.AUTOMATION_RULES)
@Injectable()
export class RulesProcessor extends WorkerHost {
  private readonly logger = new Logger(RulesProcessor.name);

  constructor(private readonly rulesEngineService: RulesEngineService) {
    super();
  }

  async process(job: Job<AutomationRuleJobPayload>): Promise<any> {
    const { workspaceId, socialAccountId, triggerType, triggerContext, executionKey, ruleId } = job.data;
    this.logger.log(
      `Processing automation rules for account ${socialAccountId}, trigger: ${triggerType}, executionKey: ${executionKey}`,
    );

    const results = await this.rulesEngineService.evaluateAndExecute(
      workspaceId,
      socialAccountId,
      triggerType,
      triggerContext,
      executionKey,
      ruleId,
    );

    return {
      success: true,
      evaluatedRulesCount: results.length,
      executedCount: results.filter((r) => r.status === 'EXECUTED').length,
      results,
    };
  }
}

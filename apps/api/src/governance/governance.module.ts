import { Module } from '@nestjs/common';
import { GovernanceService } from './governance.service.js';
import { RulesController } from './rules.controller.js';
import { SafetyController } from './safety.controller.js';
import { ExperimentsController } from './experiments.controller.js';
import { AdaptationController } from './adaptation.controller.js';
import { OperatorController } from './operator.controller.js';

@Module({
  controllers: [
    RulesController,
    SafetyController,
    ExperimentsController,
    AdaptationController,
    OperatorController,
  ],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}

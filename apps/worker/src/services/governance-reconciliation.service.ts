import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { prisma, PrismaClient } from '@threadpilot/database';
import {
  QUEUES,
  AutonomousOperatorJobPayload,
  ExperimentAnalysisJobPayload,
  AutomationRuleJobPayload,
} from '@threadpilot/types';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class GovernanceReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GovernanceReconciliationService.name);
  private isRunning = false;
  private isDestroyed = false;
  private timer?: NodeJS.Timeout;
  private readonly leaderToken = randomUUID();
  private static readonly LEASE_KEY = 'tp:gov-reconcile-leader';
  private static readonly SCAN_INTERVAL_MS = 60_000;
  private static readonly LEADER_LEASE_MS = 120_000;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(QUEUES.AUTONOMOUS_OPERATOR)
    private readonly operatorQueue: Queue<AutonomousOperatorJobPayload>,
    @InjectQueue(QUEUES.EXPERIMENT_ANALYSIS)
    private readonly experimentQueue: Queue<ExperimentAnalysisJobPayload>,
    @InjectQueue(QUEUES.AUTOMATION_RULES)
    private readonly rulesQueue: Queue<AutomationRuleJobPayload>,
    @Optional() private readonly db: PrismaClient = prisma,
  ) {}

  onModuleInit() {
    this.scheduleNext(15_000); // 15s initial offset on worker startup
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext(delayMs: number = GovernanceReconciliationService.SCAN_INTERVAL_MS) {
    if (this.isDestroyed) return;
    this.timer = setTimeout(async () => {
      try {
        await this.reconcile();
      } catch (err: any) {
        this.logger.error(`Governance reconciliation scan failed: ${err?.message || err}`);
      } finally {
        this.scheduleNext();
      }
    }, delayMs);
  }

  async reconcile(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Previous governance reconciliation scan still in progress. Skipping overlap.');
      return;
    }

    this.isRunning = true;
    const acquired = await this.redis.set(
      GovernanceReconciliationService.LEASE_KEY,
      this.leaderToken,
      'PX',
      GovernanceReconciliationService.LEADER_LEASE_MS,
      'NX',
    );

    if (!acquired) {
      this.isRunning = false;
      return;
    }

    try {
      await this.reconcileAutonomousOperator();
      await this.reconcileDueExperiments();
      await this.reconcileScheduledRules();
    } finally {
      this.isRunning = false;
      const releaseScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await this.redis
        .eval(releaseScript, 1, GovernanceReconciliationService.LEASE_KEY, this.leaderToken)
        .catch(() => {});
    }
  }

  private async reconcileAutonomousOperator(): Promise<void> {
    const activeConfigs = await this.db.autonomousOperatorConfig.findMany({
      where: {
        autonomyLevel: { not: 'MANUAL' },
      },
    });

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    for (const config of activeConfigs) {
      try {
        const activeLease = await this.db.autonomousOperatorLease.findFirst({
          where: {
            socialAccountId: config.socialAccountId,
            leaseUntil: { gt: new Date() },
          },
        });

        if (activeLease) {
          continue; // Active lease is currently executing
        }

        const recentRun = await this.db.autonomousOperatorRun.findFirst({
          where: {
            socialAccountId: config.socialAccountId,
            startedAt: { gt: fifteenMinutesAgo },
          },
          orderBy: { startedAt: 'desc' },
        });

        if (recentRun) {
          continue; // Recent run exists within 15 minutes
        }

        const bucketKey = Math.floor(Date.now() / (15 * 60 * 1000));
        const operatorJobId = `operator:${config.socialAccountId}:${bucketKey}`;

        const existingJob = await this.operatorQueue.getJob(operatorJobId);
        if (existingJob) {
          const state = await existingJob.getState();
          if (['waiting', 'delayed', 'active'].includes(state)) {
            continue;
          }
        }

        await this.operatorQueue.add(
          'planning-cycle',
          {
            requestId: randomUUID(),
            workspaceId: config.workspaceId,
            socialAccountId: config.socialAccountId,
            cycleId: randomUUID(),
          },
          {
            jobId: operatorJobId,
            removeOnComplete: 50,
            removeOnFail: 100,
          },
        );

        this.logger.log(`Enqueued autonomous operator cycle for account ${config.socialAccountId}`);
      } catch (err: any) {
        this.logger.warn(
          `Failed to evaluate operator dispatch for account ${config.socialAccountId}: ${err?.message || err}`,
        );
      }
    }
  }

  private async reconcileDueExperiments(): Promise<void> {
    const dueExperiments = await this.db.experiment.findMany({
      where: {
        status: { in: ['ACTIVE', 'COLLECTING_DATA'] },
        plannedAnalysisAt: { lte: new Date() },
      },
    });

    for (const exp of dueExperiments) {
      try {
        const expJobId = `exp_analysis:${exp.id}`;

        const existingJob = await this.experimentQueue.getJob(expJobId);
        if (existingJob) {
          const state = await existingJob.getState();
          if (['waiting', 'delayed', 'active'].includes(state)) {
            continue;
          }
        }

        await this.experimentQueue.add(
          'experiment-analysis',
          {
            requestId: randomUUID(),
            workspaceId: exp.workspaceId,
            socialAccountId: exp.socialAccountId,
            experimentId: exp.id,
          },
          {
            jobId: expJobId,
            removeOnComplete: 50,
            removeOnFail: 100,
          },
        );

        this.logger.log(`Enqueued due experiment analysis for experiment ${exp.id}`);
      } catch (err: any) {
        this.logger.warn(`Failed to enqueue experiment analysis for ${exp.id}: ${err?.message || err}`);
      }
    }
  }

  private async reconcileScheduledRules(): Promise<void> {
    const scheduledRules = await this.db.automationRule.findMany({
      where: {
        isActive: true,
        triggerType: 'SCHEDULE_TIME_REACHED',
      },
    });

    const hourlyBucket = Math.floor(Date.now() / (60 * 60 * 1000));

    for (const rule of scheduledRules) {
      try {
        const executionKey = `rule:sched:${rule.id}:${hourlyBucket}`;

        const existingJob = await this.rulesQueue.getJob(executionKey);
        if (existingJob) {
          const state = await existingJob.getState();
          if (['waiting', 'delayed', 'active'].includes(state)) {
            continue;
          }
        }

        await this.rulesQueue.add(
          'automation-rule',
          {
            requestId: randomUUID(),
            workspaceId: rule.workspaceId,
            socialAccountId: rule.socialAccountId,
            triggerType: 'SCHEDULE_TIME_REACHED',
            triggerContext: {
              scheduledTime: new Date().toISOString(),
            },
            ruleId: rule.id,
            executionKey,
          },
          {
            jobId: executionKey,
            removeOnComplete: 50,
            removeOnFail: 100,
          },
        );
      } catch (err: any) {
        this.logger.warn(`Failed to enqueue scheduled rule ${rule.id}: ${err?.message || err}`);
      }
    }
  }
}

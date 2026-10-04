import { Injectable, Logger } from '@nestjs/common';
import {
  prisma,
  PrismaClient,
  RuleTriggerType,
  RuleExecutionStatus,
} from '@threadpilot/database';
import {
  evaluateAST,
  RuleConditionAST,
  RuleAction,
  RuleActionSchema,
} from '@threadpilot/types';
import { createHash } from 'node:crypto';

export interface RuleEvaluationResult {
  ruleId: string;
  matched: boolean;
  status: RuleExecutionStatus;
  executionKey: string;
  actionsExecuted: number;
  error?: string | undefined;
}

@Injectable()
export class RulesEngineService {
  private readonly logger = new Logger(RulesEngineService.name);

  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Evaluates active rules for a trigger event and executes matched actions
   */
  async evaluateAndExecute(
    workspaceId: string,
    socialAccountId: string,
    triggerType: string,
    triggerContext: Record<string, unknown>,
    executionKey: string,
    ruleId?: string,
  ): Promise<RuleEvaluationResult[]> {
    return this.processTrigger({
      workspaceId,
      socialAccountId,
      triggerType: triggerType as RuleTriggerType,
      triggerContext,
      executionKey,
    });
  }

  /**
   * Evaluates active rules for a trigger event and executes matched actions
   * with action-level idempotency and atomic budget reservations.
   */
  async processTrigger(params: {
    workspaceId: string;
    socialAccountId: string;
    triggerType: RuleTriggerType;
    triggerContext: Record<string, unknown>;
    executionKey: string;
    accountTimezone?: string;
  }): Promise<RuleEvaluationResult[]> {
    const {
      workspaceId,
      socialAccountId,
      triggerType,
      triggerContext,
      executionKey,
      accountTimezone = 'UTC',
    } = params;

    const rules = await this.db.automationRule.findMany({
      where: {
        workspaceId,
        socialAccountId,
        triggerType,
        isActive: true,
      },
      orderBy: { priority: 'asc' }, // Lower priority number = executed first
    });

    const results: RuleEvaluationResult[] = [];
    const executionWindow = this.getExecutionWindowDate(new Date(), accountTimezone);

    for (const rule of rules) {
      const ast = rule.astConditions as unknown as RuleConditionAST;
      const matched = evaluateAST(ast, triggerContext);

      if (!matched) {
        results.push({
          ruleId: rule.id,
          matched: false,
          status: 'SKIPPED_CONDITION',
          executionKey,
          actionsExecuted: 0,
        });
        continue;
      }

      // Claim execution log and budget atomically
      const claimResult = await this.claimExecutionAndBudget({
        workspaceId,
        socialAccountId,
        ruleId: rule.id,
        executionWindow,
        executionKey,
        maxDailyExecutions: rule.maxDailyExecutions,
        evaluatedContext: triggerContext,
      });

      if (!claimResult.allowed) {
        results.push({
          ruleId: rule.id,
          matched: true,
          status: claimResult.status,
          executionKey,
          actionsExecuted: 0,
          error: claimResult.reason,
        });
        continue;
      }

      // Execute actions with action-level idempotency
      const actions = (rule.actions as unknown as RuleAction[]) || [];
      const executionOutcome = await this.executeRuleActions({
        workspaceId,
        socialAccountId,
        ruleId: rule.id,
        logId: claimResult.logId,
        executionWindow,
        executionKey,
        actions,
        leaseToken: claimResult.leaseToken,
        triggerContext,
        accountTimezone,
      });

      results.push({
        ruleId: rule.id,
        matched: true,
        status: executionOutcome.status,
        executionKey,
        actionsExecuted: executionOutcome.actionsExecuted,
        error: executionOutcome.error,
      });
    }

    return results;
  }

  /**
   * Atomically claims or recovers a rule execution log and reserves execution budget.
   */
  async claimExecutionAndBudget(params: {
    workspaceId: string;
    socialAccountId: string;
    ruleId: string;
    executionWindow: string;
    executionKey: string;
    maxDailyExecutions: number;
    evaluatedContext: Record<string, unknown>;
  }): Promise<{
    allowed: boolean;
    status: RuleExecutionStatus;
    logId: string;
    leaseToken: string;
    reason?: string;
  }> {
    const {
      workspaceId,
      socialAccountId,
      ruleId,
      executionWindow,
      executionKey,
      maxDailyExecutions,
      evaluatedContext,
    } = params;

    const leaseToken = createHash('sha256')
      .update(`${ruleId}:${executionKey}:${Date.now()}:${Math.random()}`)
      .digest('hex');

    const leaseMinutes = 5;
    const leaseUntil = new Date(Date.now() + leaseMinutes * 60 * 1000);

    return await this.db.$transaction(async (tx) => {
      // Step 1: Ensure daily budget record exists
      await tx.$executeRaw`
        INSERT INTO rule_execution_budgets (
          id, workspace_id, social_account_id, rule_id, execution_window, max_executions, claimed_executions, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${workspaceId}::uuid, ${socialAccountId}::uuid, ${ruleId}::uuid, ${executionWindow}, ${maxDailyExecutions}, 0, NOW(), NOW()
        ) ON CONFLICT (rule_id, execution_window) DO NOTHING;
      `;

      // Step 2: Attempt to claim or re-claim execution log
      const claimRows: Array<{ id: string; status: RuleExecutionStatus; is_new_claim: boolean }> =
        await tx.$queryRaw`
          INSERT INTO rule_execution_logs (
            id, workspace_id, social_account_id, rule_id, execution_window, execution_key,
            status, lease_token, lease_until, evaluated_context, created_at
          ) VALUES (
            gen_random_uuid(), ${workspaceId}::uuid, ${socialAccountId}::uuid, ${ruleId}::uuid, ${executionWindow}, ${executionKey},
            'CLAIMED', ${leaseToken}, ${leaseUntil}, ${JSON.stringify(evaluatedContext)}::jsonb, NOW()
          ) ON CONFLICT (rule_id, execution_window, execution_key) DO UPDATE
            SET lease_token = EXCLUDED.lease_token,
                lease_until = EXCLUDED.lease_until
            WHERE rule_execution_logs.status = 'CLAIMED'
              AND (rule_execution_logs.lease_until IS NULL OR rule_execution_logs.lease_until < NOW())
          RETURNING id, status, (xmax = 0) AS is_new_claim;
        `;

      if (claimRows.length === 0) {
        return {
          allowed: false,
          status: 'EXECUTED',
          logId: '',
          leaseToken: '',
          reason: 'Job already completed or leased by active worker',
        };
      }

      const claim = claimRows[0]!;

      // Step 3: If new claim, atomically reserve budget
      if (claim.is_new_claim) {
        const budgetRows: Array<{ claimed_executions: number }> = await tx.$queryRaw`
          UPDATE rule_execution_budgets
          SET claimed_executions = claimed_executions + 1, updated_at = NOW()
          WHERE rule_id = ${ruleId}::uuid
            AND execution_window = ${executionWindow}
            AND claimed_executions < max_executions
          RETURNING claimed_executions;
        `;

        if (budgetRows.length === 0) {
          // Budget exhausted - mark log as SKIPPED_BUDGET
          await tx.$executeRaw`
            UPDATE rule_execution_logs
            SET status = 'SKIPPED_BUDGET', lease_token = NULL, lease_until = NULL
            WHERE id = ${claim.id}::uuid;
          `;
          return {
            allowed: false,
            status: 'SKIPPED_BUDGET',
            logId: claim.id,
            leaseToken,
            reason: 'Daily execution budget exhausted',
          };
        }
      }

      return {
        allowed: true,
        status: 'CLAIMED',
        logId: claim.id,
        leaseToken,
      };
    });
  }

  /**
   * Executes individual rule actions with actionExecutionKey participating
   * co-transactionally in the exact same domain boundary as side effects.
   */
  async executeRuleActions(params: {
    workspaceId: string;
    socialAccountId: string;
    ruleId: string;
    logId: string;
    executionWindow: string;
    executionKey: string;
    actions: RuleAction[];
    leaseToken: string;
    triggerContext: Record<string, unknown>;
    accountTimezone: string;
  }): Promise<{ status: RuleExecutionStatus; actionsExecuted: number; error?: string }> {
    const {
      workspaceId,
      socialAccountId,
      ruleId,
      logId,
      executionWindow,
      executionKey,
      actions,
      leaseToken,
      triggerContext,
      accountTimezone,
    } = params;

    let executedCount = 0;

    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
      const action = actions[actionIndex]!;
      const actionExecutionKey = `${ruleId}:${executionWindow}:${executionKey}:${actionIndex}`;

      try {
        await this.db.$transaction(async (tx) => {
          // 1. Insert action claim row
          await tx.ruleActionExecution.create({
            data: {
              workspaceId,
              socialAccountId,
              logId,
              actionIndex,
              actionType: action.type,
              actionExecutionKey,
              status: 'EXECUTED',
            },
          });

          // 2. Co-transactional concrete side effects
          if (action.type === 'AUTO_SCHEDULE') {
            await this.executeAutoScheduleInTransaction(tx, {
              workspaceId,
              socialAccountId,
              action,
              actionExecutionKey,
              triggerContext,
              accountTimezone,
            });
          } else if (action.type === 'ADAPT_STYLE_WEIGHT') {
            await this.executeAdaptStyleWeightInTransaction(tx, {
              workspaceId,
              socialAccountId,
              action,
              actionExecutionKey,
            });
          } else if (action.type === 'DISMISS_CANDIDATE') {
            await this.executeDismissCandidateInTransaction(tx, {
              workspaceId,
              socialAccountId,
              action,
              triggerContext,
            });
          }
        });
        executedCount++;
      } catch (err: unknown) {
        const errorMsg = (err as Error)?.message || String(err);
        this.logger.warn(
          `Action execution skipped or failed for key ${actionExecutionKey}: ${errorMsg}`,
        );
        // If unique constraint violation on actionExecutionKey, it means already executed
        if (errorMsg.includes('unique') || errorMsg.includes('Unique')) {
          continue;
        }
        // Terminal action failure
        await this.db.ruleExecutionLog.update({
          where: { id: logId },
          data: {
            status: 'FAILED',
            errorMessage: errorMsg,
            leaseToken: null,
            leaseUntil: null,
          },
        });
        return { status: 'FAILED', actionsExecuted: executedCount, error: errorMsg };
      }
    }

    // Step 4: Final status update with lease token fence
    await this.db.ruleExecutionLog.updateMany({
      where: { id: logId, leaseToken },
      data: {
        status: 'EXECUTED',
        leaseToken: null,
        leaseUntil: null,
        executedAt: new Date(),
      },
    });

    return { status: 'EXECUTED', actionsExecuted: executedCount };
  }

  private async executeAutoScheduleInTransaction(
    tx: any,
    params: {
      workspaceId: string;
      socialAccountId: string;
      action: Extract<RuleAction, { type: 'AUTO_SCHEDULE' }>;
      actionExecutionKey: string;
      triggerContext: Record<string, unknown>;
      accountTimezone: string;
    },
  ) {
    const { workspaceId, socialAccountId, action, actionExecutionKey, triggerContext, accountTimezone } =
      params;

    const draftId = triggerContext['draftId'] as string | undefined;
    const contentVersionId = triggerContext['contentVersionId'] as string | undefined;
    if (!draftId || !contentVersionId) {
      return; // No target draft in trigger context
    }

    // Reserve weekly quota inside same transaction
    const weekWindow = this.getIsoWeekWindow(new Date(), accountTimezone);
    const quotaRows: Array<{ claimed_posts: number }> = await tx.$queryRaw`
      UPDATE scheduled_post_quotas
      SET claimed_posts = claimed_posts + 1, updated_at = NOW()
      WHERE social_account_id = ${socialAccountId}::uuid
        AND week_window = ${weekWindow}
        AND claimed_posts < max_weekly_posts
      RETURNING claimed_posts;
    `;

    if (quotaRows.length === 0) {
      throw new Error(`Weekly post quota exhausted for week ${weekWindow}`);
    }

    let contentSnapshot = triggerContext['contentSnapshot'] as any;
    let contentHash = triggerContext['contentHash'] as string;

    if (!contentSnapshot || !contentHash) {
      const version = await tx.contentVersion.findUnique({
        where: { id: contentVersionId },
      });
      if (version) {
        contentSnapshot = contentSnapshot || {
          text: version.text,
          mediaUrls: version.mediaUrls,
        };
        contentHash = contentHash || version.contentHash;
      } else {
        contentSnapshot = contentSnapshot || {};
        contentHash = contentHash || createHash('sha256').update(draftId).digest('hex');
      }
    }

    const scheduledAt = new Date(Date.now() + (action.params.offsetHours || 24) * 3600 * 1000);

    const post = await tx.scheduledPost.create({
      data: {
        workspaceId,
        socialAccountId,
        draftId,
        contentVersionId,
        contentSnapshot,
        contentHash,
        scheduledAt,
        timezone: accountTimezone,
        status: 'SCHEDULED',
        idempotencyKey: actionExecutionKey,
        requestFingerprint: `rule:${actionExecutionKey}`,
      },
    });

    await tx.scheduledPostDispatch.create({
      data: {
        scheduledPostId: post.id,
        status: 'PENDING',
      },
    });
  }

  private async executeAdaptStyleWeightInTransaction(
    tx: any,
    params: {
      workspaceId: string;
      socialAccountId: string;
      action: Extract<RuleAction, { type: 'ADAPT_STYLE_WEIGHT' }>;
      actionExecutionKey: string;
    },
  ) {
    const { workspaceId, socialAccountId, action, actionExecutionKey } = params;

    const profile = await tx.learnedPerformanceProfile.findUnique({
      where: { socialAccountId },
    });
    if (!profile) return;

    await tx.profileAdaptationProposal.create({
      data: {
        workspaceId,
        socialAccountId,
        profileId: profile.id,
        actionExecutionKey,
        sourceProfileVersion: profile.profileVersion,
        dimension: action.params.dimension,
        dimensionValue: action.params.dimensionValue,
        observedRawLift: action.params.weightDelta,
        winsorizedLift: Math.max(-0.5, Math.min(0.5, action.params.weightDelta)),
        priorWeight: 1.0,
        proposedWeight: 1.0 + action.params.weightDelta,
        sampleEvidenceSize: 1,
        evidenceGrade: 'ACTION_PROPOSED',
        status: 'PENDING_REVIEW',
      },
    });
  }

  private async executeDismissCandidateInTransaction(
    tx: any,
    params: {
      workspaceId: string;
      socialAccountId: string;
      action: Extract<RuleAction, { type: 'DISMISS_CANDIDATE' }>;
      triggerContext: Record<string, unknown>;
    },
  ) {
    const candidateId = params.triggerContext['candidateId'] as string | undefined;
    if (!candidateId) return;

    await tx.autonomousOperatorCandidate.updateMany({
      where: {
        id: candidateId,
        workspaceId: params.workspaceId,
        socialAccountId: params.socialAccountId,
      },
      data: {
        status: 'SKIPPED_BUDGET',
        rejectionReason: params.action.params.reason,
      },
    });
  }

  private getExecutionWindowDate(date: Date, timeZone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date); // YYYY-MM-DD
  }

  private getIsoWeekWindow(date: Date, timeZone: string): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const parts = formatter.formatToParts(date);
    const year = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
    const month = parseInt(parts.find((p) => p.type === 'month')!.value, 10) - 1;
    const day = parseInt(parts.find((p) => p.type === 'day')!.value, 10);

    const target = new Date(Date.UTC(year, month, day));
    const dayNr = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = target.getTime();
    target.setUTCMonth(0, 1);
    if (target.getUTCDay() !== 4) {
      target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
    }
    const weekNumber = 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
    const isoYear = new Date(firstThursday).getUTCFullYear();
    return `${isoYear}-W${weekNumber.toString().padStart(2, '0')}`;
  }
}

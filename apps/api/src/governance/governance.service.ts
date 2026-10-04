import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  prisma,
  AggregationDimension,
  ExperimentMetric,
  ExperimentEffectType,
  ObservationSlot,
  OptimizationDirection,
  AdaptationProposalStatus,
  RuleTriggerType,
} from '@threadpilot/database';
import { randomUUID } from 'crypto';
import {
  RuleASTSchema,
  RuleActionSchema,
  SafetyOverrideRequestSchema,
  CreateExperimentRequestSchema,
  UpdateOperatorConfigRequest,
} from '@threadpilot/types';

@Injectable()
export class GovernanceService {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. RULES ENGINE
  // ─────────────────────────────────────────────────────────────────────────────

  async createRule(
    workspaceId: string,
    socialAccountId: string,
    data: {
      name: string;
      description?: string;
      triggerType: RuleTriggerType;
      conditions: Record<string, unknown>;
      actions: unknown[];
      priority?: number;
      maxDailyExecutions?: number;
    },
  ): Promise<any> {
    // Validate AST conditions
    const parsedConditions = RuleASTSchema.parse(data.conditions);

    // Validate Actions against discriminated union
    const validatedActions = data.actions.map((act) => RuleActionSchema.parse(act));

    const rule = await prisma.automationRule.create({
      data: {
        workspaceId,
        socialAccountId,
        name: data.name,
        ...(data.description ? { description: data.description } : {}),
        triggerType: data.triggerType,
        astConditions: parsedConditions as any,
        actions: validatedActions as any,
        priority: data.priority ?? 100,
        maxDailyExecutions: data.maxDailyExecutions ?? 10,
        isActive: true,
      },
    });

    return rule;
  }

  async listRules(workspaceId: string, socialAccountId?: string): Promise<any[]> {
    return prisma.automationRule.findMany({
      where: {
        workspaceId,
        ...(socialAccountId ? { socialAccountId } : {}),
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async updateRule(
    workspaceId: string,
    ruleId: string,
    data: {
      name?: string;
      description?: string;
      conditions?: Record<string, unknown>;
      actions?: unknown[];
      priority?: number;
      maxDailyExecutions?: number;
      isActive?: boolean;
    },
  ): Promise<any> {
    const existing = await prisma.automationRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing || existing.workspaceId !== workspaceId) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.conditions !== undefined) {
      updateData.astConditions = RuleASTSchema.parse(data.conditions);
    }
    if (data.actions !== undefined) {
      updateData.actions = data.actions.map((act) => RuleActionSchema.parse(act));
    }
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.maxDailyExecutions !== undefined) updateData.maxDailyExecutions = data.maxDailyExecutions;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return prisma.automationRule.update({
      where: { id: ruleId },
      data: updateData,
    });
  }

  async deleteRule(workspaceId: string, ruleId: string): Promise<any> {
    const existing = await prisma.automationRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing || existing.workspaceId !== workspaceId) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    return prisma.automationRule.delete({
      where: { id: ruleId },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. PRE-PUBLISH SAFETY GATE
  // ─────────────────────────────────────────────────────────────────────────────

  async getSafetyAudit(workspaceId: string, auditId: string): Promise<any> {
    const audit = await prisma.prePublishSafetyAudit.findUnique({
      where: { id: auditId },
      include: {
        overrideLog: true,
        contentVersion: {
          select: {
            id: true,
            version: true,
            body: true,
            hook: true,
            cta: true,
          },
        },
      },
    });

    if (!audit || audit.workspaceId !== workspaceId) {
      throw new NotFoundException(`Safety audit ${auditId} not found`);
    }

    return audit;
  }

  async requestSafetyOverride(
    workspaceId: string,
    auditId: string,
    actorId: string,
    data: { reason: string; riskAcknowledged: boolean },
  ): Promise<any> {
    SafetyOverrideRequestSchema.parse({
      auditId,
      reason: data.reason,
      riskAcknowledged: data.riskAcknowledged,
    });

    // 1. Validate Actor Role Snapshot: Must be OWNER or ADMIN
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        uq_workspace_member: {
          workspaceId,
          userId: actorId,
        },
      },
    });

    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only Workspace OWNER or ADMIN can authorize safety overrides');
    }

    // 2. Load and validate audit
    const audit = await prisma.prePublishSafetyAudit.findUnique({
      where: { id: auditId },
    });

    if (!audit || audit.workspaceId !== workspaceId) {
      throw new NotFoundException(`Safety audit ${auditId} not found`);
    }

    if (audit.status === 'BLOCKED_POLICY_VIOLATION') {
      throw new BadRequestException('Hard policy violations (BLOCKED_POLICY_VIOLATION) cannot be overridden');
    }

    if (audit.status !== 'FLAGGED_APPROVAL_REQUIRED') {
      throw new BadRequestException(`Cannot override audit with status '${audit.status}'. Only FLAGGED_APPROVAL_REQUIRED can be overridden.`);
    }

    if (audit.expiresAt <= new Date()) {
      throw new BadRequestException('Audit has expired');
    }

    // 3. Create or update SafetyOverrideLog with single-use UUID token
    const oneTimeToken = randomUUID();

    const overrideLog = await prisma.safetyOverrideLog.upsert({
      where: { auditId },
      create: {
        workspaceId,
        socialAccountId: audit.socialAccountId,
        auditId,
        actorId,
        actorRoleSnapshot: membership.role,
        reason: data.reason.trim(),
        riskAcknowledged: true,
        oneTimeToken,
        status: 'OVERRIDDEN',
        expiresAt: audit.expiresAt,
      },
      update: {
        actorId,
        actorRoleSnapshot: membership.role,
        reason: data.reason.trim(),
        riskAcknowledged: true,
        oneTimeToken,
        status: 'OVERRIDDEN',
        consumedAt: null,
        consumedBy: null,
        expiresAt: audit.expiresAt,
      },
    });

    return overrideLog;
  }

  async listSafetyAudits(workspaceId: string, socialAccountId?: string, limit = 50): Promise<any[]> {
    return prisma.prePublishSafetyAudit.findMany({
      where: {
        workspaceId,
        ...(socialAccountId ? { socialAccountId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        overrideLog: true,
        draft: {
          select: {
            id: true,
            status: true,
          },
        },
        contentVersion: {
          select: {
            id: true,
            version: true,
            body: true,
            hook: true,
            cta: true,
          },
        },
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. EXPERIMENTATION ENGINE
  // ─────────────────────────────────────────────────────────────────────────────

  async createExperiment(
    workspaceId: string,
    socialAccountId: string,
    data: any,
  ): Promise<any> {
    // Validate against the canonical Zod schema (variants[] format)
    const parsed = CreateExperimentRequestSchema.parse(data);

    const controlVariant = parsed.variants.find((v) => v.isControl);
    const treatmentVariant = parsed.variants.find((v) => !v.isControl);

    if (!controlVariant || !treatmentVariant) {
      throw new BadRequestException('Experiment must have exactly one control and one treatment variant');
    }

    const randomizationSeed = randomUUID();

    const experiment = await prisma.$transaction(async (tx) => {
      const exp = await tx.experiment.create({
        data: {
          workspaceId,
          socialAccountId,
          name: parsed.name,
          hypothesis: parsed.hypothesis,
          dimension: parsed.dimension as AggregationDimension,
          primaryMetric: (parsed.primaryMetric ?? 'ENGAGEMENT_RATE_BY_VIEWS') as ExperimentMetric,
          effectType: (parsed.effectType ?? 'RELATIVE') as ExperimentEffectType,
          targetObservationSlot: (parsed.targetObservationSlot ?? 'T_24H') as ObservationSlot,
          direction: 'MAXIMIZE' as OptimizationDirection,
          minPracticalEffect: parsed.minPracticalEffect ?? 0.05,
          minSampleSizePerArm: parsed.minSampleSizePerArm ?? 10,
          durationDays: parsed.durationDays ?? 14,
          randomizationSeed,
          status: 'DRAFT',
        },
      });

      await tx.experimentVariant.create({
        data: {
          workspaceId,
          socialAccountId,
          experimentId: exp.id,
          variantKey: 'A',
          isControl: true,
          dimensionValue: controlVariant.dimensionValue,
        },
      });

      await tx.experimentVariant.create({
        data: {
          workspaceId,
          socialAccountId,
          experimentId: exp.id,
          variantKey: 'B',
          isControl: false,
          dimensionValue: treatmentVariant.dimensionValue,
        },
      });

      return exp;
    });

    return prisma.experiment.findUnique({
      where: { id: experiment.id },
      include: { variants: true },
    });
  }

  async activateExperiment(workspaceId: string, experimentId: string): Promise<any> {
    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { variants: true },
    });

    if (!experiment || experiment.workspaceId !== workspaceId) {
      throw new NotFoundException(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot activate experiment in status '${experiment.status}'`);
    }

    const activatedAt = new Date();
    const enrollmentEndAt = new Date(activatedAt.getTime() + experiment.durationDays * 86400 * 1000);
    const plannedAnalysisAt = new Date(enrollmentEndAt.getTime() + 30 * 3600 * 1000);

    return prisma.experiment.update({
      where: { id: experimentId },
      data: {
        status: 'ACTIVE',
        activatedAt,
        enrollmentEndAt,
        plannedAnalysisAt,
      },
      include: { variants: true },
    });
  }

  async getExperiment(workspaceId: string, experimentId: string): Promise<any> {
    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
      include: {
        variants: true,
        winningVariant: true,
        adaptationProposals: true,
      },
    });

    if (!experiment || experiment.workspaceId !== workspaceId) {
      throw new NotFoundException(`Experiment ${experimentId} not found`);
    }

    return experiment;
  }

  async listExperiments(workspaceId: string, socialAccountId?: string, limit = 50): Promise<any[]> {
    return prisma.experiment.findMany({
      where: {
        workspaceId,
        ...(socialAccountId ? { socialAccountId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        variants: true,
        winningVariant: true,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. PROFILE ADAPTATION PROPOSALS
  // ─────────────────────────────────────────────────────────────────────────────

  async listAdaptationProposals(
    workspaceId: string,
    socialAccountId?: string,
    status?: AdaptationProposalStatus,
  ): Promise<any[]> {
    return prisma.profileAdaptationProposal.findMany({
      where: {
        workspaceId,
        ...(socialAccountId ? { socialAccountId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        experiment: {
          select: {
            id: true,
            name: true,
            hypothesis: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async applyAdaptationProposal(workspaceId: string, proposalId: string, actorId: string): Promise<any> {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        uq_workspace_member: {
          workspaceId,
          userId: actorId,
        },
      },
    });

    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only Workspace OWNER or ADMIN can apply profile adaptation proposals');
    }

    const proposal = await prisma.profileAdaptationProposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal || proposal.workspaceId !== workspaceId) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }

    if (proposal.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(`Cannot apply proposal in status '${proposal.status}'`);
    }

    // CAS Update on LearnedPerformanceProfile
    const result = await prisma.$transaction(async (tx) => {
      let updateSql = '';

      switch (proposal.dimension) {
        case 'TOPIC':
          updateSql = `
            UPDATE learned_performance_profiles
            SET best_topic_weight = ${proposal.proposedWeight},
                best_topic = '${proposal.dimensionValue}',
                profile_version = profile_version + 1,
                updated_at = NOW()
            WHERE id = '${proposal.profileId}'::uuid
              AND profile_version = ${proposal.sourceProfileVersion}
          `;
          break;
        case 'FORMAT':
          updateSql = `
            UPDATE learned_performance_profiles
            SET best_format_weight = ${proposal.proposedWeight},
                best_format = '${proposal.dimensionValue}',
                profile_version = profile_version + 1,
                updated_at = NOW()
            WHERE id = '${proposal.profileId}'::uuid
              AND profile_version = ${proposal.sourceProfileVersion}
          `;
          break;
        case 'POST_LENGTH_BUCKET':
          updateSql = `
            UPDATE learned_performance_profiles
            SET best_length_bucket_weight = ${proposal.proposedWeight},
                best_length_bucket = '${proposal.dimensionValue}',
                profile_version = profile_version + 1,
                updated_at = NOW()
            WHERE id = '${proposal.profileId}'::uuid
              AND profile_version = ${proposal.sourceProfileVersion}
          `;
          break;
        default:
          updateSql = `
            UPDATE learned_performance_profiles
            SET profile_version = profile_version + 1,
                updated_at = NOW()
            WHERE id = '${proposal.profileId}'::uuid
              AND profile_version = ${proposal.sourceProfileVersion}
          `;
          break;
      }

      const rowsAffected = await tx.$executeRawUnsafe(updateSql);

      if (rowsAffected === 0) {
        throw new ConflictException(
          `Profile version mismatch: profile has been mutated concurrently (expected v${proposal.sourceProfileVersion})`,
        );
      }

      return tx.profileAdaptationProposal.update({
        where: { id: proposalId },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
        },
      });
    });

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. AUTONOMOUS OPERATOR
  // ─────────────────────────────────────────────────────────────────────────────

  async getOperatorStatus(workspaceId: string, socialAccountId?: string): Promise<any> {
    let targetAccountId = socialAccountId;
    if (!targetAccountId) {
      const firstAcc = await prisma.socialAccount.findFirst({
        where: { workspaceId },
        select: { id: true },
      });
      targetAccountId = firstAcc?.id;
    }

    if (!targetAccountId) {
      return {
        config: null,
        isLeaseActive: false,
        latestRuns: [],
        weeklyQuota: null,
      };
    }

    const config = await prisma.autonomousOperatorConfig.findUnique({
      where: {
        uq_operator_config_account_workspace: {
          socialAccountId: targetAccountId,
          workspaceId,
        },
      },
    });

    const lease = await prisma.autonomousOperatorLease.findUnique({
      where: {
        socialAccountId: targetAccountId,
      },
    });

    const latestRuns = await prisma.autonomousOperatorRun.findMany({
      where: {
        workspaceId,
        socialAccountId: targetAccountId,
      },
      orderBy: { startedAt: 'desc' },
      take: 5,
      include: {
        candidates: true,
      },
    });

    const weeklyQuota = await prisma.scheduledPostQuota.findFirst({
      where: {
        workspaceId,
        socialAccountId: targetAccountId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      config,
      isLeaseActive: !!(lease?.leaseUntil && lease.leaseUntil > new Date()),
      latestRuns,
      weeklyQuota,
      targetAccountId,
    };
  }

  async toggleOperator(
    workspaceId: string,
    socialAccountId: string,
    actorId: string,
    resume = false,
  ): Promise<any> {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        uq_workspace_member: {
          workspaceId,
          userId: actorId,
        },
      },
    });

    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { userId: true },
      });
      if (ws?.userId !== actorId) {
        throw new ForbiddenException('Only Workspace OWNER or ADMIN can toggle the autonomous operator');
      }
    }

    const nextLevel = resume ? 'SEMI_AUTONOMOUS' : 'PAUSED';

    // When pausing operator, immediately relinquish background worker leases
    // so in-flight automated cycles are halted from committing
    if (!resume) {
      await prisma.autonomousOperatorLease.updateMany({
        where: {
          socialAccountId,
          workspaceId,
        },
        data: {
          leaseToken: null,
          leaseUntil: null,
        },
      });
    }

    return prisma.autonomousOperatorConfig.upsert({
      where: {
        uq_operator_config_account_workspace: {
          socialAccountId,
          workspaceId,
        },
      },
      create: {
        workspaceId,
        socialAccountId,
        autonomyLevel: nextLevel,
      },
      update: {
        autonomyLevel: nextLevel,
      },
    });
  }

  async pauseOperator(workspaceId: string, socialAccountId: string, actorId: string): Promise<any> {
    return this.toggleOperator(workspaceId, socialAccountId, actorId, false);
  }

  async updateOperatorConfig(
    workspaceId: string,
    socialAccountId: string,
    actorId: string,
    updates: UpdateOperatorConfigRequest,
  ): Promise<any> {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        uq_workspace_member: {
          workspaceId,
          userId: actorId,
        },
      },
    });

    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { userId: true },
      });
      if (ws?.userId !== actorId) {
        throw new ForbiddenException('Only Workspace OWNER or ADMIN can configure the autonomous operator');
      }
    }

    // If autonomyLevel is set to PAUSED, immediately relinquish background worker leases
    if (updates.autonomyLevel === 'PAUSED') {
      await prisma.autonomousOperatorLease.updateMany({
        where: {
          socialAccountId,
          workspaceId,
        },
        data: {
          leaseToken: null,
          leaseUntil: null,
        },
      });
    }

    return prisma.autonomousOperatorConfig.upsert({
      where: {
        uq_operator_config_account_workspace: {
          socialAccountId,
          workspaceId,
        },
      },
      create: {
        workspaceId,
        socialAccountId,
        autonomyLevel: updates.autonomyLevel ?? 'SEMI_AUTONOMOUS',
        maxWeeklyPosts: updates.maxWeeklyPosts ?? 14,
        minHoursBetweenPosts: updates.minHoursBetweenPosts ?? 4,
        targetPostingHours: updates.targetPostingHours ?? [9, 12, 17, 20],
        planningHorizonDays: updates.planningHorizonDays ?? 7,
        enableExperiments: updates.enableExperiments ?? true,
      },
      update: {
        ...(updates.autonomyLevel !== undefined && { autonomyLevel: updates.autonomyLevel }),
        ...(updates.maxWeeklyPosts !== undefined && { maxWeeklyPosts: updates.maxWeeklyPosts }),
        ...(updates.minHoursBetweenPosts !== undefined && { minHoursBetweenPosts: updates.minHoursBetweenPosts }),
        ...(updates.targetPostingHours !== undefined && { targetPostingHours: updates.targetPostingHours }),
        ...(updates.planningHorizonDays !== undefined && { planningHorizonDays: updates.planningHorizonDays }),
        ...(updates.enableExperiments !== undefined && { enableExperiments: updates.enableExperiments }),
      },
    });
  }
}

import { Injectable, Logger, ConflictException, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { prisma, PrismaClient, AutonomousOperatorRun } from '@threadpilot/database';
import { randomUUID } from 'crypto';
import { getIsoWeekWindow, QUEUES, ContentGenerationJobPayload } from '@threadpilot/types';
import { SafetyGateService } from './safety-gate.service.js';

export class CandidateLeaseExpiredError extends Error {
  constructor(message = 'Autonomous operator candidate lease fencing assertion failed: lease expired or lost') {
    super(message);
    this.name = 'CandidateLeaseExpiredError';
  }
}

export class QuotaExceededError extends Error {
  constructor(message = 'Weekly scheduled post quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

@Injectable()
export class AutonomousOperatorService {
  private readonly logger = new Logger(AutonomousOperatorService.name);

  constructor(
    private readonly safetyGateService: SafetyGateService,
    @Optional()
    @InjectQueue(QUEUES.CONTENT)
    private readonly contentQueue?: Queue<ContentGenerationJobPayload>,
  ) {}

  /**
   * Attempt to claim a 10-minute distributed lease for this account's planning cycle
   */
  async claimAccountLease(
    workspaceId: string,
    socialAccountId: string,
  ): Promise<{ leaseToken: string; cycleId: string } | null> {
    const leaseToken = randomUUID();
    const cycleId = randomUUID();

    const claimed = await prisma.$executeRaw`
      INSERT INTO autonomous_operator_leases (
        social_account_id, workspace_id, lease_token, lease_until, cycle_id, heartbeat_at
      )
      VALUES (
        ${socialAccountId}::uuid,
        ${workspaceId}::uuid,
        ${leaseToken},
        NOW() + INTERVAL '10 minutes',
        ${cycleId}::uuid,
        NOW()
      )
      ON CONFLICT (social_account_id) DO UPDATE
      SET lease_token = EXCLUDED.lease_token,
          lease_until = EXCLUDED.lease_until,
          cycle_id = EXCLUDED.cycle_id,
          heartbeat_at = EXCLUDED.heartbeat_at
      WHERE autonomous_operator_leases.lease_until IS NULL
         OR autonomous_operator_leases.lease_until < NOW();
    `;

    if (claimed === 0) {
      this.logger.debug(`Account ${socialAccountId} is actively leased by another live operator`);
      return null;
    }

    return { leaseToken, cycleId };
  }

  /**
   * Heartbeat to extend active lease
   */
  async heartbeatAccountLease(socialAccountId: string, leaseToken: string): Promise<boolean> {
    const updated = await prisma.$executeRaw`
      UPDATE autonomous_operator_leases
      SET lease_until = NOW() + INTERVAL '10 minutes',
          heartbeat_at = NOW()
      WHERE social_account_id = ${socialAccountId}::uuid
        AND lease_token = ${leaseToken};
    `;
    return updated > 0;
  }

  /**
   * Release active lease upon cycle completion
   */
  async releaseAccountLease(socialAccountId: string, leaseToken: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE autonomous_operator_leases
      SET lease_token = NULL,
          lease_until = NULL
      WHERE social_account_id = ${socialAccountId}::uuid
        AND lease_token = ${leaseToken};
    `;
  }

  /**
   * Execute 15-minute autonomous planning cycle for a social account
   */
  async runPlanningCycle(workspaceId: string, socialAccountId: string): Promise<AutonomousOperatorRun | null> {
    const lease = await this.claimAccountLease(workspaceId, socialAccountId);
    if (!lease) {
      return null;
    }

    const { leaseToken, cycleId } = lease;

    // Create AutonomousOperatorRun record
    const run = await prisma.autonomousOperatorRun.create({
      data: {
        workspaceId,
        socialAccountId,
        cycleId,
        status: 'RUNNING',
        summary: {},
      },
    });

    try {
      // 1. Verify Kill Switches
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
      });

      let operatorConfig = await prisma.autonomousOperatorConfig.findUnique({
        where: {
          uq_operator_config_account_workspace: {
            socialAccountId,
            workspaceId,
          },
        },
      });

      if (!operatorConfig) {
        operatorConfig = await prisma.autonomousOperatorConfig.create({
          data: {
            workspaceId,
            socialAccountId,
            autonomyLevel: 'SEMI_AUTONOMOUS',
            maxWeeklyPosts: 14,
            minHoursBetweenPosts: 4,
            targetPostingHours: [9, 12, 17, 20],
            planningHorizonDays: 7,
            enableExperiments: true,
          },
        });
      }

      if (operatorConfig.autonomyLevel === 'PAUSED') {
        this.logger.warn(`Planning cycle halted by kill switch (operator paused)`);
        await prisma.autonomousOperatorRun.update({
          where: { id: run.id },
          data: {
            status: 'HALTED_KILL_SWITCH',
            completedAt: new Date(),
            summary: { reason: 'Kill switch active: autonomyLevel is PAUSED' },
          },
        });
        await this.releaseAccountLease(socialAccountId, leaseToken);
        return run;
      }

      // 2. Select Next Optimal Slot
      const timezone = 'UTC';
      const targetSlot = await this.findNextAvailableSlot(
        socialAccountId,
        timezone,
        operatorConfig.targetPostingHours,
        operatorConfig.minHoursBetweenPosts,
      );

      // 3. Find candidate draft (exclude historical backfills and drafts already published)
      const candidateDraft = await prisma.contentDraft.findFirst({
        where: {
          workspaceId,
          status: { in: ['READY', 'APPROVED', 'DRAFT'] },
          generatedBy: { not: 'BACKFILL' },
          publishedPosts: { none: {} },
          scheduledPosts: {
            none: {
              status: { in: ['SCHEDULED', 'CLAIMED', 'PUBLISHING', 'PUBLISHED'] },
            },
          },
        },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!candidateDraft || candidateDraft.versions.length === 0) {
        if (operatorConfig.autonomyLevel === 'FULL_AUTONOMOUS' && this.contentQueue) {
          const activeJob = await prisma.jobRecord.findFirst({
            where: {
              workspaceId,
              type: 'CONTENT',
              status: { in: ['PENDING', 'RUNNING'] },
            },
          });

          if (!activeJob) {
            const profile = await prisma.learnedPerformanceProfile.findUnique({
              where: { socialAccountId },
            });
            const prefs = await prisma.userPreferences.findUnique({
              where: { workspaceId },
            });

            const topic = profile?.bestTopic || prefs?.preferredTopics?.[0] || 'AI & Tech Insights';
            const format = profile?.bestFormat || prefs?.preferredFormats?.[0] || 'hook_body_cta';
            const requestId = randomUUID();

            await prisma.jobRecord.create({
              data: {
                workspaceId,
                requestId,
                type: 'CONTENT',
                status: 'PENDING',
                progress: 0,
                progressMessage: 'Autonomous operator initiated content generation',
              },
            });

            await this.contentQueue.add(
              'CONTENT',
              {
                requestId,
                workspaceId,
                topic,
                format,
                requestedBy: 'AutonomousOperator',
                actorId: 'AutonomousOperator',
              },
              {
                jobId: `gen:${requestId}`,
                removeOnComplete: 50,
                removeOnFail: 100,
              },
            );

            this.logger.log(
              `[FULL_AUTONOMOUS] No fresh drafts found. Dispatched AI content generation [${requestId}] for topic: "${topic}", format: "${format}"`,
            );

            await prisma.autonomousOperatorRun.update({
              where: { id: run.id },
              data: {
                status: 'COMPLETED',
                candidatesEvaluated: 0,
                candidatesScheduled: 0,
                completedAt: new Date(),
                summary: {
                  reason: 'No fresh drafts available. Dispatched autonomous AI content generation.',
                  dispatchedRequestId: requestId,
                  topic,
                  format,
                },
              },
            });

            await this.releaseAccountLease(socialAccountId, leaseToken);
            return run;
          }
        }

        this.logger.debug(`No available draft candidates found for account ${socialAccountId}`);
        await prisma.autonomousOperatorRun.update({
          where: { id: run.id },
          data: {
            status: 'COMPLETED',
            candidatesEvaluated: 0,
            candidatesScheduled: 0,
            completedAt: new Date(),
            summary: { reason: 'No draft candidates available' },
          },
        });
        await this.releaseAccountLease(socialAccountId, leaseToken);
        return run;
      }

      const activeVersion = candidateDraft.versions[0]!;

      // Create candidate row in SELECTED state
      const candidate = await prisma.autonomousOperatorCandidate.create({
        data: {
          workspaceId,
          socialAccountId,
          runId: run.id,
          draftId: candidateDraft.id,
          scheduledSlot: targetSlot,
          status: 'SELECTED',
        },
      });

      // 4. Pre-Publish Safety Gate clearance
      const audit = await this.safetyGateService.initiateAudit(
        workspaceId,
        socialAccountId,
        candidateDraft.id,
        activeVersion.id,
      );

      const evaluation = await this.safetyGateService.evaluateAudit(audit.id);

      if (evaluation.status !== 'PASSED') {
        this.logger.warn(`Candidate ${candidate.id} failed safety audit with status '${evaluation.status}'`);
        await prisma.autonomousOperatorCandidate.update({
          where: { id: candidate.id },
          data: {
            status: 'SAFETY_BLOCKED',
            rejectionReason: `Safety gate status: ${evaluation.status}`,
          },
        });

        await prisma.autonomousOperatorRun.update({
          where: { id: run.id },
          data: {
            status: 'COMPLETED',
            candidatesEvaluated: 1,
            candidatesScheduled: 0,
            safetyFlaggedCount: 1,
            completedAt: new Date(),
            summary: { reason: `Safety gate flagged candidate: ${evaluation.status}` },
          },
        });

        await this.releaseAccountLease(socialAccountId, leaseToken);
        return run;
      }

      // Check Autonomy Level: If MANUAL, the operator only drafts/evaluates candidates; human must schedule
      if (operatorConfig.autonomyLevel === 'MANUAL') {
        this.logger.log(`Account ${socialAccountId} is in MANUAL mode: Candidate ${candidate.id} drafted for human scheduling`);
        await prisma.autonomousOperatorRun.update({
          where: { id: run.id },
          data: {
            status: 'COMPLETED',
            candidatesEvaluated: 1,
            candidatesScheduled: 0,
            safetyFlaggedCount: 0,
            completedAt: new Date(),
            summary: {
              candidateId: candidate.id,
              draftId: candidateDraft.id,
              targetSlot: targetSlot.toISOString(),
              mode: 'MANUAL',
              note: 'Candidate evaluated and prepared for manual operator scheduling',
            },
          },
        });
        await this.releaseAccountLease(socialAccountId, leaseToken);
        return run;
      }

      // 5. Atomic Scheduling Transaction (P0-2 Fencing & Quota Resolution)
      const weekWindow = getIsoWeekWindow(targetSlot, timezone);
      const scheduledPostId = randomUUID();
      const idempotencyKey = `operator:${run.cycleId}:${candidate.id}`;
      const contentSnapshot = {
        body: activeVersion.body,
        hook: activeVersion.hook,
        cta: activeVersion.cta,
      };

      await prisma.$transaction(async (tx) => {
        // Step 5a: Ensure Quota record exists
        await tx.scheduledPostQuota.upsert({
          where: {
            uq_scheduled_post_quota: {
              socialAccountId,
              weekWindow,
            },
          },
          create: {
            workspaceId,
            socialAccountId,
            weekWindow,
            maxWeeklyPosts: operatorConfig.maxWeeklyPosts,
            claimedPosts: 0,
          },
          update: {},
        });

        // Step 5b: Reserve Quota
        const quotaReserved = await tx.$executeRaw`
          UPDATE scheduled_post_quotas
          SET claimed_posts = claimed_posts + 1,
              updated_at = NOW()
          WHERE social_account_id = ${socialAccountId}::uuid
            AND week_window = ${weekWindow}
            AND claimed_posts < max_weekly_posts;
        `;

        if (quotaReserved === 0) {
          throw new QuotaExceededError(`Weekly quota limit reached for account ${socialAccountId} in ${weekWindow}`);
        }

        // Step 5c: Assert Operator Lease is still active (fencing)
        const leaseActive = await tx.$queryRaw<Array<{ lease_token: string }>>`
          SELECT lease_token
          FROM autonomous_operator_leases
          WHERE social_account_id = ${socialAccountId}::uuid
            AND lease_token = ${leaseToken}
            AND lease_until > NOW();
        `;

        if (!leaseActive || leaseActive.length === 0) {
          throw new CandidateLeaseExpiredError('Operator lease expired or revoked during candidate evaluation');
        }

        // Step 5d: Insert Phase 3 ScheduledPost (Guarded by unique slot constraint)
        await tx.scheduledPost.create({
          data: {
            id: scheduledPostId,
            workspaceId,
            socialAccountId,
            draftId: candidateDraft.id,
            contentVersionId: activeVersion.id,
            contentSnapshot: contentSnapshot as any,
            contentHash: audit.contentHash,
            scheduledAt: targetSlot,
            timezone,
            status: 'SCHEDULED',
            idempotencyKey,
            requestFingerprint: `auto-op:${candidate.id}`,
          },
        });

        // Step 5e: Insert Phase 3 ScheduledPostDispatch
        await tx.scheduledPostDispatch.create({
          data: {
            scheduledPostId,
            status: 'PENDING',
          },
        });

        // Step 5f: Update Candidate with Mandatory Rowcount Assertion (Resolution of P0-2)
        const affectedCandidates = await tx.$executeRaw`
          UPDATE autonomous_operator_candidates
          SET status = 'SCHEDULED',
              scheduled_post_id = ${scheduledPostId}::uuid
          WHERE id = ${candidate.id}::uuid
            AND workspace_id = ${workspaceId}::uuid
            AND social_account_id = ${socialAccountId}::uuid
            AND status = 'SELECTED';
        `;

        if (affectedCandidates !== 1) {
          throw new CandidateLeaseExpiredError(
            `Candidate fencing assertion failed: expected 1 row updated, got ${affectedCandidates}`,
          );
        }
      });

      // 6. Complete Run Successfully
      await prisma.autonomousOperatorRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          candidatesEvaluated: 1,
          candidatesScheduled: 1,
          safetyFlaggedCount: 0,
          completedAt: new Date(),
          summary: {
            scheduledPostId,
            targetSlot: targetSlot.toISOString(),
            weekWindow,
          },
        },
      });

      return run;
    } catch (err: any) {
      this.logger.error(`Planning cycle failed: ${err.message}`, err.stack);
      await prisma.autonomousOperatorRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          summary: { error: err.message },
        },
      });
      throw err;
    } finally {
      await this.releaseAccountLease(socialAccountId, leaseToken);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: Find next available slot
  // ─────────────────────────────────────────────────────────────────────────────

  private async findNextAvailableSlot(
    socialAccountId: string,
    timezone: string,
    targetHours: number[],
    minHoursBetween: number,
  ): Promise<Date> {
    const now = new Date();
    // Look ahead over next 7 days
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      for (const hour of targetHours) {
        // Construct potential slot date in account timezone
        const candidateSlot = new Date(now.getTime() + dayOffset * 86400 * 1000);
        candidateSlot.setUTCHours(hour, 0, 0, 0);

        if (candidateSlot <= now) continue;

        // Check slot collision: database unique constraint @@unique([socialAccountId, scheduledAt])
        const existingSlot = await prisma.scheduledPost.findFirst({
          where: {
            socialAccountId,
            scheduledAt: candidateSlot,
          },
        });

        if (existingSlot) continue;

        // Check minHoursBetweenPosts
        const windowStart = new Date(candidateSlot.getTime() - minHoursBetween * 3600 * 1000);
        const windowEnd = new Date(candidateSlot.getTime() + minHoursBetween * 3600 * 1000);

        const conflict = await prisma.scheduledPost.findFirst({
          where: {
            socialAccountId,
            scheduledAt: { gte: windowStart, lte: windowEnd },
            status: { notIn: ['CANCELLED', 'EXPIRED'] },
          },
        });

        if (!conflict) {
          return candidateSlot;
        }
      }
    }

    // Fallback: 24 hours from now
    return new Date(now.getTime() + 24 * 3600 * 1000);
  }
}

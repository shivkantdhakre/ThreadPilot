import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  prisma,
  AdaptationProposalStatus,
  AggregationDimension,
  EvidenceGrade,
} from '@threadpilot/database';

@Injectable()
export class ProfileAdaptationService {
  private readonly logger = new Logger(ProfileAdaptationService.name);

  /**
   * List pending or filtered profile adaptation proposals
   */
  async listProposals(
    workspaceId: string,
    socialAccountId: string,
    status?: AdaptationProposalStatus,
  ) {
    return prisma.profileAdaptationProposal.findMany({
      where: {
        workspaceId,
        socialAccountId,
        ...(status ? { status } : {}),
      },
      include: {
        experiment: {
          select: {
            id: true,
            name: true,
            hypothesis: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Propose an adaptation from an observational Insight or custom evidence
   */
  async proposeAdaptation(params: {
    workspaceId: string;
    socialAccountId: string;
    dimension: AggregationDimension;
    dimensionValue: string;
    observedRawLift: number;
    sampleEvidenceSize: number;
    evidenceGrade: EvidenceGrade;
    isControlledExperiment?: boolean;
    experimentId?: string;
  }) {
    // Evidence gating: N >= 10 and grade DIRECTIONAL or HIGH_SIGNAL
    if (params.sampleEvidenceSize < 10) {
      throw new BadRequestException(
        `Insufficient sample size (${params.sampleEvidenceSize} < 10) for profile adaptation`,
      );
    }

    if (
      params.evidenceGrade !== 'HIGH_SIGNAL' &&
      params.evidenceGrade !== 'DIRECTIONAL' &&
      params.evidenceGrade !== 'ACTION_PROPOSED'
    ) {
      throw new BadRequestException(
        `Evidence grade must be HIGH_SIGNAL or DIRECTIONAL, got '${params.evidenceGrade}'`,
      );
    }

    const profile = await prisma.learnedPerformanceProfile.findUnique({
      where: { socialAccountId: params.socialAccountId },
    });

    if (!profile) {
      throw new NotFoundException(`LearnedPerformanceProfile not found for account ${params.socialAccountId}`);
    }

    // 1. Lift Winsorization: clamped to [-0.50, +0.50]
    const winsorizedLift = Math.max(-0.5, Math.min(0.5, params.observedRawLift));

    // 2. Prior weight from profile or default 1.0
    const priorWeight = this.getPriorDimensionWeight(profile, params.dimension);

    // 3. Weight adaptation formula:
    // w_new = w_old * (1 - lambda) + lambda * [w_old * (1 + eta * winsorizedLift)]
    // lambda = 0.20 (recency retention)
    // eta = 0.15 for controlled experiments, 0.05 for observational insights
    const lambda = 0.2;
    const eta = params.isControlledExperiment ? 0.15 : 0.05;
    const proposedWeight = priorWeight * (1 - lambda) + lambda * (priorWeight * (1 + eta * winsorizedLift));

    const proposal = await prisma.profileAdaptationProposal.create({
      data: {
        workspaceId: params.workspaceId,
        socialAccountId: params.socialAccountId,
        profileId: profile.id,
        ...(params.experimentId ? { experimentId: params.experimentId } : {}),
        sourceProfileVersion: profile.profileVersion,
        dimension: params.dimension,
        dimensionValue: params.dimensionValue,
        observedRawLift: params.observedRawLift,
        winsorizedLift,
        priorWeight,
        proposedWeight,
        sampleEvidenceSize: params.sampleEvidenceSize,
        evidenceGrade: params.evidenceGrade,
        status: 'PENDING_REVIEW',
      },
    });

    return proposal;
  }

  /**
   * Apply a proposal to the LearnedPerformanceProfile via Optimistic Concurrency Control (CAS)
   */
  async applyProposal(
    workspaceId: string,
    socialAccountId: string,
    proposalId: string,
    actorId?: string,
  ) {
    if (actorId) {
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
    }

    const proposal = await prisma.profileAdaptationProposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal || proposal.workspaceId !== workspaceId || proposal.socialAccountId !== socialAccountId) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }

    if (proposal.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(`Proposal is in status '${proposal.status}', cannot apply`);
    }

    // Atomic CAS Update on learned_performance_profiles
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
          `Profile version mismatch: expected version ${proposal.sourceProfileVersion}. The profile was modified concurrently.`,
        );
      }

      // Also update or insert LearnedDimensionWeight row
      await tx.learnedDimensionWeight.upsert({
        where: {
          uq_learned_dim_weight: {
            socialAccountId,
            dimension: proposal.dimension,
            dimensionValue: proposal.dimensionValue,
            observationSlot: 'T_24H',
          },
        },
        create: {
          workspaceId,
          socialAccountId,
          profileId: proposal.profileId,
          dimension: proposal.dimension,
          dimensionValue: proposal.dimensionValue,
          rawWeight: proposal.proposedWeight,
          decayedWeight: proposal.proposedWeight,
          totalSampleSize: proposal.sampleEvidenceSize,
          eligibleBucketCount: 1,
          evidenceBucketCount: 1,
          highestEvidenceGrade: proposal.evidenceGrade,
          observationSlot: 'T_24H',
          analyticsRevision: 1,
          computedAt: new Date(),
        },
        update: {
          rawWeight: proposal.proposedWeight,
          decayedWeight: proposal.proposedWeight,
          totalSampleSize: { increment: proposal.sampleEvidenceSize },
          highestEvidenceGrade: proposal.evidenceGrade,
          computedAt: new Date(),
        },
      });

      // Update proposal status
      const updatedProposal = await tx.profileAdaptationProposal.update({
        where: { id: proposalId },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
        },
      });

      return updatedProposal;
    });

    return result;
  }

  /**
   * Reject a profile adaptation proposal
   */
  async rejectProposal(
    workspaceId: string,
    socialAccountId: string,
    proposalId: string,
    reason: string,
    actorId?: string,
  ) {
    if (actorId) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          uq_workspace_member: {
            workspaceId,
            userId: actorId,
          },
        },
      });

      if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
        throw new ForbiddenException('Only Workspace OWNER or ADMIN can reject profile adaptation proposals');
      }
    }

    const proposal = await prisma.profileAdaptationProposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal || proposal.workspaceId !== workspaceId || proposal.socialAccountId !== socialAccountId) {
      throw new NotFoundException(`Proposal ${proposalId} not found`);
    }

    if (proposal.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(`Proposal is in status '${proposal.status}', cannot reject`);
    }

    return prisma.profileAdaptationProposal.update({
      where: { id: proposalId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason.trim(),
      },
    });
  }

  private getPriorDimensionWeight(profile: any, dimension: AggregationDimension): number {
    switch (dimension) {
      case 'TOPIC':
        return profile.bestTopicWeight ?? 1.0;
      case 'FORMAT':
        return profile.bestFormatWeight ?? 1.0;
      case 'POST_LENGTH_BUCKET':
        return profile.bestLengthBucketWeight ?? 1.0;
      default:
        return 1.0;
    }
  }
}

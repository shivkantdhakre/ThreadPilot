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
      await this.ensureAuthorizedRole(workspaceId, actorId, ['OWNER', 'ADMIN']);
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
      const updateData: any = {
        profileVersion: { increment: 1 },
      };

      if (proposal.dimension === 'TOPIC') {
        updateData.bestTopicWeight = proposal.proposedWeight;
        updateData.bestTopic = proposal.dimensionValue;
      } else if (proposal.dimension === 'FORMAT') {
        updateData.bestFormatWeight = proposal.proposedWeight;
        updateData.bestFormat = proposal.dimensionValue;
      } else if (proposal.dimension === 'POST_LENGTH_BUCKET') {
        updateData.bestLengthBucketWeight = proposal.proposedWeight;
        updateData.bestLengthBucket = proposal.dimensionValue;
      }

      const updateResult = await tx.learnedPerformanceProfile.updateMany({
        where: {
          id: proposal.profileId,
          profileVersion: proposal.sourceProfileVersion,
        },
        data: updateData,
      });

      if (updateResult.count === 0) {
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
      await this.ensureAuthorizedRole(workspaceId, actorId, ['OWNER', 'ADMIN']);
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

  private async ensureAuthorizedRole(
    workspaceId: string,
    userId: string,
    allowedRoles: string[],
  ) {
    let member = await prisma.workspaceMember.findUnique({
      where: {
        uq_workspace_member: {
          workspaceId,
          userId,
        },
      },
    });

    if (!member) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { userId: true },
      });
      if (workspace && workspace.userId === userId) {
        member = await prisma.workspaceMember.upsert({
          where: {
            uq_workspace_member: {
              workspaceId,
              userId,
            },
          },
          create: {
            workspaceId,
            userId,
            role: 'OWNER',
          },
          update: {
            role: 'OWNER',
          },
        });
      }
    }

    if (!member || !allowedRoles.includes(member.role)) {
      throw new ForbiddenException(
        `User does not have required permissions (${allowedRoles.join(', ')}) in workspace ${workspaceId}`,
      );
    }

    return member;
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

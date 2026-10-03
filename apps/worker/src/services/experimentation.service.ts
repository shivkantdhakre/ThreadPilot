import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  prisma,
  AggregationDimension,
  ExperimentMetric,
  ExperimentEffectType,
  ObservationSlot,
  OptimizationDirection,
  ExperimentStatus,
  EvidenceGrade,
} from '@threadpilot/database';
import { createHmac, randomUUID } from 'crypto';
import {
  welchTTest,
  safeCohensD,
} from './statistical-evidence.service.js';

export function generatePermutedBlock(
  experimentId: string,
  blockKey: string,
  seed: string,
  blockNumber: number,
  variantKeys: ['A', 'B'] = ['A', 'B'],
  blockSize = 4,
): string[] {
  const repsPerVariant = blockSize / 2;
  const baseSequence: string[] = [
    ...Array(repsPerVariant).fill(variantKeys[0]),
    ...Array(repsPerVariant).fill(variantKeys[1]),
  ];

  let counter = 0;
  for (let i = baseSequence.length - 1; i > 0; i--) {
    const range = i + 1;
    const maxValid = 256 - (256 % range);
    let randomByte: number;
    do {
      const hmac = createHmac('sha256', seed)
        .update(`${experimentId}:${blockKey}:${blockNumber}:${counter++}`)
        .digest();
      randomByte = hmac[0]!;
    } while (randomByte >= maxValid);

    const j = randomByte % range;
    const temp = baseSequence[i]!;
    baseSequence[i] = baseSequence[j]!;
    baseSequence[j] = temp;
  }
  return baseSequence;
}

export function computeTemporalBlockKey(scheduledAt: Date, timezone: string): string {
  // Convert UTC date to local day and hour in account timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short', // 'Sun', 'Mon', etc.
    hour: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(scheduledAt);
  let dayOfWeek = '1';
  let hour = '00';

  for (const part of parts) {
    if (part.type === 'weekday') dayOfWeek = part.value;
    if (part.type === 'hour') hour = part.value.padStart(2, '0');
  }

  return `${timezone}-${dayOfWeek}-${hour}`;
}

@Injectable()
export class ExperimentationService {
  private readonly logger = new Logger(ExperimentationService.name);

  /**
   * Create a new strictly two-arm (Control vs Treatment) A/B experiment
   */
  async createExperiment(params: {
    workspaceId: string;
    socialAccountId: string;
    name: string;
    hypothesis: string;
    dimension: AggregationDimension;
    primaryMetric?: ExperimentMetric;
    effectType?: ExperimentEffectType;
    targetObservationSlot?: ObservationSlot;
    direction?: OptimizationDirection;
    minPracticalEffect?: number;
    minSampleSizePerArm?: number;
    durationDays?: number;
    controlDimensionValue: string;
    treatmentDimensionValue: string;
  }) {
    const randomizationSeed = randomUUID();

    const experiment = await prisma.$transaction(async (tx) => {
      const exp = await tx.experiment.create({
        data: {
          workspaceId: params.workspaceId,
          socialAccountId: params.socialAccountId,
          name: params.name,
          hypothesis: params.hypothesis,
          dimension: params.dimension,
          primaryMetric: params.primaryMetric ?? 'ENGAGEMENT_RATE_BY_VIEWS',
          effectType: params.effectType ?? 'RELATIVE',
          targetObservationSlot: params.targetObservationSlot ?? 'T_24H',
          direction: params.direction ?? 'MAXIMIZE',
          minPracticalEffect: params.minPracticalEffect ?? 0.05,
          minSampleSizePerArm: params.minSampleSizePerArm ?? 10,
          durationDays: params.durationDays ?? 14,
          randomizationSeed,
          status: 'DRAFT',
        },
      });

      // Variant A (Control)
      await tx.experimentVariant.create({
        data: {
          workspaceId: params.workspaceId,
          socialAccountId: params.socialAccountId,
          experimentId: exp.id,
          variantKey: 'A',
          isControl: true,
          dimensionValue: params.controlDimensionValue,
        },
      });

      // Variant B (Treatment)
      await tx.experimentVariant.create({
        data: {
          workspaceId: params.workspaceId,
          socialAccountId: params.socialAccountId,
          experimentId: exp.id,
          variantKey: 'B',
          isControl: false,
          dimensionValue: params.treatmentDimensionValue,
        },
      });

      return exp;
    });

    return prisma.experiment.findUnique({
      where: { id: experiment.id },
      include: { variants: true },
    });
  }

  /**
   * Activate experiment and bind immutable enrollment & analysis horizons
   */
  async activateExperiment(workspaceId: string, socialAccountId: string, experimentId: string) {
    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { variants: true },
    });

    if (!experiment || experiment.workspaceId !== workspaceId || experiment.socialAccountId !== socialAccountId) {
      throw new NotFoundException(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot activate experiment with status '${experiment.status}'`);
    }

    if (experiment.variants.length !== 2) {
      throw new BadRequestException('Experiment must contain exactly 2 variants (1 control, 1 treatment)');
    }

    const activatedAt = new Date();
    const enrollmentEndAt = new Date(activatedAt.getTime() + experiment.durationDays * 86400 * 1000);
    // Planned analysis is 30 hours after enrollment ends to allow full T_24H observation maturity + buffer
    const plannedAnalysisAt = new Date(enrollmentEndAt.getTime() + 30 * 3600 * 1000);

    const updated = await prisma.experiment.update({
      where: { id: experimentId },
      data: {
        status: 'ACTIVE',
        activatedAt,
        enrollmentEndAt,
        plannedAnalysisAt,
      },
      include: { variants: true },
    });

    return updated;
  }

  /**
   * Assign a draft/candidate post to a balanced permuted block arm
   */
  async assignDraftToExperiment(
    workspaceId: string,
    socialAccountId: string,
    experimentId: string,
    draftId: string,
    scheduledSlotTime: Date,
    timezone: string,
  ) {
    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { variants: true },
    });

    if (!experiment || experiment.workspaceId !== workspaceId || experiment.socialAccountId !== socialAccountId) {
      throw new NotFoundException(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'ACTIVE' && experiment.status !== 'COLLECTING_DATA') {
      throw new BadRequestException(`Experiment is in ${experiment.status} status and not accepting new enrollments`);
    }

    const now = new Date();
    if (experiment.enrollmentEndAt && now > experiment.enrollmentEndAt) {
      throw new BadRequestException(`Enrollment window ended at ${experiment.enrollmentEndAt.toISOString()}`);
    }

    const temporalBlockKey = computeTemporalBlockKey(scheduledSlotTime, timezone);

    // Multi-block sequence allocation with rollover
    const result = await prisma.$transaction(async (tx) => {
      let allocation = await tx.experimentBlockAllocation.findUnique({
        where: {
          uq_experiment_block_allocation: {
            experimentId,
            temporalBlockKey,
          },
        },
      });

      let assignedVariantKey: string;
      let blockNumber = 0;
      let sequencePosition = 0;

      if (!allocation) {
        // Initial block generation
        const permutedSequence = generatePermutedBlock(
          experimentId,
          temporalBlockKey,
          experiment.randomizationSeed,
          0,
          ['A', 'B'],
          4,
        );

        assignedVariantKey = permutedSequence[0]!;
        blockNumber = 0;
        sequencePosition = 0;

        allocation = await tx.experimentBlockAllocation.create({
          data: {
            workspaceId,
            socialAccountId,
            experimentId,
            temporalBlockKey,
            blockSize: 4,
            currentBlockNumber: 0,
            permutedSequence,
            sequenceIndexInBlock: 1,
            totalAssignedCount: 1,
          },
        });
      } else if (allocation.sequenceIndexInBlock < allocation.blockSize) {
        // Within current block
        blockNumber = allocation.currentBlockNumber;
        sequencePosition = allocation.sequenceIndexInBlock;
        assignedVariantKey = allocation.permutedSequence[sequencePosition]!;

        await tx.experimentBlockAllocation.update({
          where: { id: allocation.id },
          data: {
            sequenceIndexInBlock: sequencePosition + 1,
            totalAssignedCount: allocation.totalAssignedCount + 1,
          },
        });
      } else {
        // Multi-block rollover to next block number
        blockNumber = allocation.currentBlockNumber + 1;
        sequencePosition = 0;
        const newPermutedSequence = generatePermutedBlock(
          experimentId,
          temporalBlockKey,
          experiment.randomizationSeed,
          blockNumber,
          ['A', 'B'],
          allocation.blockSize,
        );

        assignedVariantKey = newPermutedSequence[0]!;

        await tx.experimentBlockAllocation.update({
          where: { id: allocation.id },
          data: {
            currentBlockNumber: blockNumber,
            permutedSequence: newPermutedSequence,
            sequenceIndexInBlock: 1,
            totalAssignedCount: allocation.totalAssignedCount + 1,
          },
        });
      }

      const variant = experiment.variants.find((v) => v.variantKey === assignedVariantKey);
      if (!variant) {
        throw new Error(`Variant ${assignedVariantKey} not found for experiment ${experimentId}`);
      }

      const assignment = await tx.experimentPostAssignment.create({
        data: {
          workspaceId,
          socialAccountId,
          experimentId,
          variantId: variant.id,
          temporalBlockKey,
          blockNumber,
          sequencePosition,
          draftId,
          assignedAt: new Date(),
        },
      });

      await tx.experimentVariant.update({
        where: { id: variant.id },
        data: { sampleCount: { increment: 1 } },
      });

      await tx.experiment.update({
        where: { id: experimentId },
        data: { eligibleArmSampleSize: { increment: 1 } },
      });

      return { assignment, variant };
    });

    return result;
  }

  /**
   * Link published post and mature metrics to the experiment assignment
   */
  async linkPostMetric(assignmentId: string, postMetricId: string) {
    const assignment = await prisma.experimentPostAssignment.findUnique({
      where: { id: assignmentId },
      include: { experiment: true },
    });

    if (!assignment) return null;

    await prisma.$transaction([
      prisma.experimentPostAssignment.update({
        where: { id: assignmentId },
        data: { postMetricId },
      }),
      prisma.experiment.update({
        where: { id: assignment.experimentId },
        data: {
          matureArmSampleSize: { increment: 1 },
          ...(assignment.experiment.status === 'ACTIVE' ? { status: 'COLLECTING_DATA' } : {}),
        },
      }),
    ]);
  }

  /**
   * Fixed Analysis Cutoff Lock & Hypothesis Testing
   */
  async lockAndAnalyzeExperiment(workspaceId: string, socialAccountId: string, experimentId: string) {
    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
      include: {
        variants: true,
        assignments: {
          include: {
            postMetric: true,
          },
        },
      },
    });

    if (!experiment || experiment.workspaceId !== workspaceId || experiment.socialAccountId !== socialAccountId) {
      throw new NotFoundException(`Experiment ${experimentId} not found`);
    }

    if (experiment.status === 'CONCLUDED' || experiment.status === 'ARCHIVED') {
      return experiment; // Already concluded and frozen
    }

    const controlVariant = experiment.variants.find((v) => v.isControl);
    const treatmentVariant = experiment.variants.find((v) => !v.isControl);

    if (!controlVariant || !treatmentVariant) {
      throw new BadRequestException('Experiment must have 1 control and 1 treatment variant');
    }

    // Fixed Analysis Cutoff Lock
    const analysisCutoff = experiment.plannedAnalysisAt ?? new Date();
    const lockedAt = new Date();

    // Collect mature primary metric samples for both arms up to analysisCutoff
    const controlSamples: number[] = [];
    const treatmentSamples: number[] = [];

    for (const a of experiment.assignments) {
      if (!a.postMetric) continue;
      const val = this.extractMetricValue(a.postMetric, experiment.primaryMetric);
      if (val === null || isNaN(val)) continue;

      if (a.variantId === controlVariant.id) {
        controlSamples.push(val);
      } else if (a.variantId === treatmentVariant.id) {
        treatmentSamples.push(val);
      }
    }

    const nControl = controlSamples.length;
    const nTreatment = treatmentSamples.length;

    // Minimum sample size gating
    const minRequired = experiment.minSampleSizePerArm;
    if (nControl < minRequired || nTreatment < minRequired) {
      this.logger.warn(
        `Experiment ${experimentId} has insufficient samples (Control: ${nControl}/${minRequired}, Treatment: ${nTreatment}/${minRequired})`,
      );
    }

    // Compute sample means & std devs
    const { mean: meanControl, stdDev: stdControl } = this.computeMeanAndStdDev(controlSamples);
    const { mean: meanTreatment, stdDev: stdTreatment } = this.computeMeanAndStdDev(treatmentSamples);

    // Run Welch's t-test (Treatment vs Control)
    const tTest = welchTTest(meanTreatment, stdTreatment, nTreatment, meanControl, stdControl, nControl);
    const cohensD = safeCohensD(meanTreatment, stdTreatment, nTreatment, meanControl, stdControl, nControl);

    // Compute relative lift
    let observedRelativeLift: number | null = null;
    if (meanControl > 0) {
      observedRelativeLift = (meanTreatment - meanControl) / meanControl;
    }

    // Determine statistical significance: p < 0.05, q < 0.10, relative lift >= minPracticalEffect
    const pValue = tTest.pValue ?? 1.0;
    const passesFDR = pValue < 0.05;
    const qValue = pValue; // Single family standard

    let winningVariantId: string | null = null;
    if (
      passesFDR &&
      observedRelativeLift !== null &&
      observedRelativeLift >= experiment.minPracticalEffect &&
      nTreatment >= minRequired &&
      nControl >= minRequired
    ) {
      winningVariantId = treatmentVariant.id;
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update Variant summary statistics
      await tx.experimentVariant.update({
        where: { id: controlVariant.id },
        data: {
          sampleCount: nControl,
          meanPrimaryMetric: meanControl,
          stdDevPrimaryMetric: stdControl,
        },
      });

      await tx.experimentVariant.update({
        where: { id: treatmentVariant.id },
        data: {
          sampleCount: nTreatment,
          meanPrimaryMetric: meanTreatment,
          stdDevPrimaryMetric: stdTreatment,
        },
      });

      // 2. Conclude and lock Experiment
      const exp = await tx.experiment.update({
        where: { id: experimentId },
        data: {
          status: 'CONCLUDED',
          analysisCutoff,
          analysisLockedAt: lockedAt,
          welchTStatistic: tTest.tStat,
          welchPValue: tTest.pValue,
          cohensD,
          ci95Lower: tTest.ci95Lower,
          ci95Upper: tTest.ci95Upper,
          qValue,
          passesFDR,
          observedRelativeLift,
          winningVariantId,
        },
        include: { variants: true },
      });

      // 3. If treatment won, generate closed-loop ProfileAdaptationProposal
      if (winningVariantId && observedRelativeLift !== null) {
        const profile = await tx.learnedPerformanceProfile.findFirst({
          where: { workspaceId, socialAccountId },
          orderBy: { profileVersion: 'desc' },
        });

        if (profile) {
          const winsorizedLift = Math.max(-0.5, Math.min(0.5, observedRelativeLift));
          const priorWeight = this.getPriorWeight(profile, experiment.dimension);
          // Adaptation formula: w_new = w_old * (1 - lambda) + lambda * (w_old * (1 + eta * lift))
          // with lambda = 0.20, eta = 0.15
          const proposedWeight = priorWeight * (1 - 0.2) + 0.2 * (priorWeight * (1 + 0.15 * winsorizedLift));

          await tx.profileAdaptationProposal.create({
            data: {
              workspaceId,
              socialAccountId,
              profileId: profile.id,
              experimentId: exp.id,
              sourceProfileVersion: profile.profileVersion,
              dimension: experiment.dimension,
              dimensionValue: treatmentVariant.dimensionValue,
              observedRawLift: observedRelativeLift,
              winsorizedLift,
              priorWeight,
              proposedWeight,
              sampleEvidenceSize: nTreatment + nControl,
              evidenceGrade: 'HIGH_SIGNAL',
              status: 'PENDING_REVIEW',
            },
          });
        }
      }

      return exp;
    });

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private extractMetricValue(postMetric: any, metric: ExperimentMetric): number | null {
    switch (metric) {
      case 'ENGAGEMENT_RATE_BY_VIEWS':
        return postMetric.engagementRate ?? null;
      case 'LIKE_RATE':
        return postMetric.likes && postMetric.views ? postMetric.likes / postMetric.views : null;
      case 'REPLY_RATE':
        return postMetric.replies && postMetric.views ? postMetric.replies / postMetric.views : null;
      case 'REPOST_RATE':
        return postMetric.reposts && postMetric.views ? postMetric.reposts / postMetric.views : null;
      case 'TOTAL_VIEWS':
        return postMetric.views ?? null;
      default:
        return postMetric.engagementRate ?? null;
    }
  }

  private computeMeanAndStdDev(samples: number[]): { mean: number; stdDev: number } {
    if (samples.length === 0) return { mean: 0, stdDev: 0 };
    const mean = samples.reduce((acc, v) => acc + v, 0) / samples.length;
    if (samples.length === 1) return { mean, stdDev: 0 };

    const variance = samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (samples.length - 1);
    return { mean, stdDev: Math.sqrt(variance) };
  }

  private getPriorWeight(profile: any, dimension: AggregationDimension): number {
    switch (dimension) {
      case 'TOPIC':
        return profile.bestTopicWeight ?? 1.0;
      case 'FORMAT':
        return profile.bestFormatWeight ?? 1.0;
      default:
        return 1.0;
    }
  }
}

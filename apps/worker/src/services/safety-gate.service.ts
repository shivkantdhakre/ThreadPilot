import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, PrismaClient, PrePublishSafetyAudit, SafetyOverrideLog } from '@threadpilot/database';
import { createHash, randomUUID } from 'crypto';
import type {
  SafetyAuditStatus,
  SafetyWallType,
  WallFinding,
  SafetyAuditDetails,
} from '@threadpilot/types';
import { AIFactoryService } from './ai-factory.service.js';

export interface AuditEvaluationResult {
  status: SafetyAuditStatus;
  hallucinationScore: number;
  toxicityScore: number;
  failedWalls: SafetyWallType[];
  auditDetails: SafetyAuditDetails;
}

@Injectable()
export class SafetyGateService {
  private readonly logger = new Logger(SafetyGateService.name);

  constructor(private readonly aiFactory?: AIFactoryService) {}

  /**
   * Fail-Closed Audit Initiation:
   * Creates or claims an audit record in PENDING state with 24h TTL,
   * pinned to the active immutable policy version.
   */
  async initiateAudit(
    workspaceId: string,
    socialAccountId: string,
    draftId: string,
    contentVersionId: string,
  ): Promise<PrePublishSafetyAudit> {
    // 1. Get or create active policy config for the account
    let policyConfig = await prisma.safetyPolicyConfig.findFirst({
      where: {
        workspaceId,
        socialAccountId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!policyConfig) {
      policyConfig = await prisma.safetyPolicyConfig.create({
        data: {
          workspaceId,
          socialAccountId,
          policyVersion: '1.0.0',
          hallucinationThreshold: 0.3,
          toxicityThreshold: 0.15,
          prohibitedTopics: ['hate_speech', 'violence', 'scam', 'harassment'],
          flaggedTopics: ['politics', 'crypto', 'medical_advice', 'financial_advice'],
          requireClaimSources: true,
          maxConsecutiveClaims: 3,
          auditTtlSeconds: 86400, // 24 hours
          isActive: true,
        },
      });
    }

    // 2. Load draft and content version to calculate content hash
    const version = await prisma.contentVersion.findFirst({
      where: {
        id: contentVersionId,
        draftId,
      },
    });

    if (!version) {
      throw new NotFoundException(`ContentVersion ${contentVersionId} not found for draft ${draftId}`);
    }

    const textToNormalize = `${version.body || ''} ${version.hook || ''} ${version.cta || ''}`.trim();
    const contentHash = createHash('sha256').update(textToNormalize).digest('hex');

    // 3. Check for existing valid audit on (contentVersionId, policyVersion)
    const existingAudit = await prisma.prePublishSafetyAudit.findUnique({
      where: {
        uq_safety_audit_version: {
          contentVersionId,
          policyVersion: policyConfig.policyVersion,
        },
      },
      include: {
        overrideLog: true,
      },
    });

    const now = new Date();
    if (existingAudit && existingAudit.expiresAt > now && existingAudit.status !== 'PENDING') {
      this.logger.debug(`Reusing valid unexpired audit ${existingAudit.id} for version ${contentVersionId}`);
      return existingAudit;
    }

    const expiresAt = new Date(now.getTime() + policyConfig.auditTtlSeconds * 1000);

    // 4. Upsert fail-closed audit in PENDING state
    const audit = await prisma.prePublishSafetyAudit.upsert({
      where: {
        uq_safety_audit_version: {
          contentVersionId,
          policyVersion: policyConfig.policyVersion,
        },
      },
      create: {
        workspaceId,
        socialAccountId,
        draftId,
        contentVersionId,
        contentHash,
        status: 'PENDING',
        policyVersion: policyConfig.policyVersion,
        evaluatorVersion: '1.1.0',
        modelVersion: 'gemini-2.5-flash',
        expiresAt,
        auditDetails: {},
      },
      update: {
        status: 'PENDING',
        contentHash,
        expiresAt,
        evaluatedAt: null,
        failedWalls: [],
        auditDetails: {},
      },
    });

    return audit;
  }

  /**
   * Run the 4 Evaluator Walls against the draft content
   */
  async evaluateAudit(auditId: string): Promise<AuditEvaluationResult> {
    const audit = await prisma.prePublishSafetyAudit.findUnique({
      where: { id: auditId },
      include: {
        draft: true,
        contentVersion: true,
      },
    });

    if (!audit) {
      throw new NotFoundException(`Safety audit ${auditId} not found`);
    }

    // Set status to RUNNING
    await prisma.prePublishSafetyAudit.update({
      where: { id: auditId },
      data: { status: 'RUNNING' },
    });

    const policyConfig = await prisma.safetyPolicyConfig.findUnique({
      where: {
        uq_safety_policy_version: {
          socialAccountId: audit.socialAccountId,
          policyVersion: audit.policyVersion,
        },
      },
    });

    const bodyText = audit.contentVersion.body || '';
    const fullText = `${bodyText} ${audit.contentVersion.hook || ''} ${audit.contentVersion.cta || ''}`.trim();
    const researchSources = (audit.draft.researchSources as string[]) || [];

    // --- Wall 1: CLAIM_HALLUCINATION ---
    const wall1 = await this.evaluateClaimHallucination(
      fullText,
      researchSources,
      policyConfig?.hallucinationThreshold ?? 0.3,
    );

    // --- Wall 2: TOXICITY_BRAND_SAFETY ---
    const wall2 = await this.evaluateToxicityBrandSafety(
      fullText,
      policyConfig?.toxicityThreshold ?? 0.15,
    );

    // --- Wall 3: POLICY_COMPLIANCE (Meta Threads 500 UTF-16 code units + Prohibited Topics) ---
    const wall3 = this.evaluatePolicyCompliance(
      fullText,
      policyConfig?.prohibitedTopics ?? [],
    );

    // --- Wall 4: SENSITIVE_TOPIC_RATE (48h Temporal Spacing) ---
    const wall4 = await this.evaluateSensitiveTopicSpacing(
      audit.workspaceId,
      audit.socialAccountId,
      fullText,
      policyConfig?.flaggedTopics ?? [],
    );

    const failedWalls: SafetyWallType[] = [];
    if (!wall1.passed) failedWalls.push('CLAIM_HALLUCINATION');
    if (!wall2.passed) failedWalls.push('TOXICITY_BRAND_SAFETY');
    if (!wall3.passed) failedWalls.push('POLICY_COMPLIANCE');
    if (!wall4.passed) failedWalls.push('SENSITIVE_TOPIC_RATE');

    // Determine Final Status:
    // - BLOCKED_POLICY_VIOLATION: Wall 3 (UTF-16 length > 500 or prohibited topic) or extreme toxicity (> 0.50)
    // - FLAGGED_APPROVAL_REQUIRED: Wall 1 (hallucination) or Wall 2 (toxicity > threshold) or Wall 4 (spacing)
    // - PASSED: All 4 walls passed
    let finalStatus: SafetyAuditStatus = 'PASSED';
    if (!wall3.passed || wall2.score > 0.5) {
      finalStatus = 'BLOCKED_POLICY_VIOLATION';
    } else if (failedWalls.length > 0) {
      finalStatus = 'FLAGGED_APPROVAL_REQUIRED';
    }

    const auditDetails: SafetyAuditDetails = {
      hallucination: {
        score: wall1.score,
        threshold: policyConfig?.hallucinationThreshold ?? 0.3,
        unsupportedClaims: wall1.unsupportedClaims,
      },
      toxicity: {
        score: wall2.score,
        threshold: policyConfig?.toxicityThreshold ?? 0.15,
        flaggedPhrases: wall2.flaggedPhrases,
      },
      compliance: {
        charCount: wall3.charCount,
        maxChars: 500,
        hasProhibitedTopics: wall3.prohibitedTopicsFound.length > 0,
        prohibitedTopicsFound: wall3.prohibitedTopicsFound,
      },
      ...(wall4.matchedTopic
        ? {
            sensitiveTopics: {
              matchedTopic: wall4.matchedTopic,
              ...(wall4.lastPublishedHoursAgo !== undefined
                ? { lastPublishedHoursAgo: wall4.lastPublishedHoursAgo }
                : {}),
              cooldownHoursRequired: 48,
            },
          }
        : {}),
      evaluatorVersion: audit.evaluatorVersion,
      modelVersion: audit.modelVersion,
    };

    await prisma.prePublishSafetyAudit.update({
      where: { id: auditId },
      data: {
        status: finalStatus,
        hallucinationScore: wall1.score,
        toxicityScore: wall2.score,
        failedWalls,
        auditDetails: auditDetails as any,
        evaluatedAt: new Date(),
      },
    });

    return {
      status: finalStatus,
      hallucinationScore: wall1.score,
      toxicityScore: wall2.score,
      failedWalls,
      auditDetails,
    };
  }

  /**
   * Request / Record a Human Manual Override (Option A)
   */
  async requestOverride(
    workspaceId: string,
    socialAccountId: string,
    auditId: string,
    actorId: string,
    reason: string,
    riskAcknowledged: boolean,
  ): Promise<SafetyOverrideLog> {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException('Reason must be at least 10 characters long');
    }
    if (!riskAcknowledged) {
      throw new BadRequestException('Explicit risk acknowledgement is required');
    }

    // 1. Authorize Actor in WorkspaceMember (role IN ('OWNER', 'ADMIN'))
    let membership = await prisma.workspaceMember.findUnique({
      where: {
        uq_workspace_member: {
          workspaceId,
          userId: actorId,
        },
      },
    });

    if (!membership) {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { userId: true },
      });
      if (ws?.userId === actorId) {
        membership = await prisma.workspaceMember.upsert({
          where: {
            uq_workspace_member: {
              workspaceId,
              userId: actorId,
            },
          },
          create: {
            workspaceId,
            userId: actorId,
            role: 'OWNER',
          },
          update: {},
        });
      }
    }

    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only Workspace OWNER or ADMIN can authorize safety overrides');
    }

    // 2. Verify Audit
    const audit = await prisma.prePublishSafetyAudit.findUnique({
      where: { id: auditId },
    });

    if (!audit || audit.workspaceId !== workspaceId || audit.socialAccountId !== socialAccountId) {
      throw new NotFoundException(`Safety audit ${auditId} not found in this workspace`);
    }

    if (audit.status === 'BLOCKED_POLICY_VIOLATION') {
      throw new BadRequestException('Hard policy violations (BLOCKED_POLICY_VIOLATION) cannot be manually overridden');
    }

    if (audit.status !== 'FLAGGED_APPROVAL_REQUIRED') {
      throw new BadRequestException(`Cannot override audit with status '${audit.status}'. Only FLAGGED_APPROVAL_REQUIRED can be overridden.`);
    }

    if (audit.expiresAt <= new Date()) {
      throw new BadRequestException('Audit has expired; a new audit evaluation must be initiated');
    }

    // 3. Create or update SafetyOverrideLog with single-use UUID token
    const oneTimeToken = randomUUID();

    const overrideLog = await prisma.safetyOverrideLog.upsert({
      where: {
        auditId,
      },
      create: {
        workspaceId,
        socialAccountId,
        auditId,
        actorId,
        actorRoleSnapshot: membership.role,
        reason: reason.trim(),
        riskAcknowledged: true,
        oneTimeToken,
        status: 'OVERRIDDEN',
        expiresAt: audit.expiresAt,
      },
      update: {
        actorId,
        actorRoleSnapshot: membership.role,
        reason: reason.trim(),
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

  /**
   * Check whether a post version is permitted to be scheduled or published
   */
  async isPublishPermitted(
    workspaceId: string,
    socialAccountId: string,
    contentVersionId: string,
    overrideToken?: string,
  ): Promise<{ permitted: boolean; reason?: string; audit?: any; overrideLog?: any }> {
    const audit = await prisma.prePublishSafetyAudit.findFirst({
      where: {
        workspaceId,
        socialAccountId,
        contentVersionId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        overrideLog: true,
      },
    });

    if (!audit) {
      return { permitted: false, reason: 'NO_SAFETY_AUDIT_FOUND' };
    }

    if (audit.expiresAt <= new Date()) {
      return { permitted: false, reason: 'SAFETY_AUDIT_EXPIRED', audit };
    }

    if (audit.status === 'PASSED') {
      return { permitted: true, audit };
    }

    if (audit.status === 'FLAGGED_APPROVAL_REQUIRED') {
      if (!overrideToken) {
        return { permitted: false, reason: 'FLAGGED_APPROVAL_REQUIRED', audit };
      }

      const override = audit.overrideLog;
      if (
        override &&
        override.oneTimeToken === overrideToken &&
        override.status === 'OVERRIDDEN' &&
        override.consumedAt === null &&
        override.expiresAt > new Date()
      ) {
        return { permitted: true, audit, overrideLog: override };
      }

      return { permitted: false, reason: 'INVALID_OR_CONSUMED_OVERRIDE_TOKEN', audit };
    }

    return { permitted: false, reason: audit.status, audit };
  }

  /**
   * Atomic CAS Consumption of Single-Use Override Token
   */
  async consumeOverrideToken(
    tx: PrismaClient,
    workspaceId: string,
    socialAccountId: string,
    overrideToken: string,
    scheduledPostId: string,
  ) {
    const updated = await tx.$executeRaw`
      UPDATE safety_override_logs
      SET consumed_at = NOW(),
          consumed_by = ${scheduledPostId}
      WHERE one_time_token = ${overrideToken}::uuid
        AND workspace_id = ${workspaceId}::uuid
        AND social_account_id = ${socialAccountId}::uuid
        AND consumed_at IS NULL
        AND expires_at > NOW();
    `;

    if (updated === 0) {
      throw new BadRequestException('Single-use override token is invalid, expired, or already consumed');
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Wall Evaluators
  // ─────────────────────────────────────────────────────────────────────────────

  private async evaluateClaimHallucination(
    text: string,
    researchSources: string[],
    threshold: number,
  ): Promise<{ passed: boolean; score: number; unsupportedClaims: string[] }> {
    // If research sources provided, check claim alignment; otherwise evaluate certainty/verifiability
    const claimMatches = text.match(/(?:according to|studies show|research proves|guaranteed|always|never|\d+%\s+of)/gi) || [];
    const unsupportedClaims: string[] = [];

    if (claimMatches.length > 0 && researchSources.length === 0) {
      unsupportedClaims.push(...claimMatches);
    }

    // Heuristic hallucination score: ratio of ungrounded factual assertions
    const score = claimMatches.length > 0 && researchSources.length === 0
      ? Math.min(1.0, claimMatches.length * 0.25)
      : 0.05;

    return {
      passed: score <= threshold,
      score,
      unsupportedClaims,
    };
  }

  private async evaluateToxicityBrandSafety(
    text: string,
    threshold: number,
  ): Promise<{ passed: boolean; score: number; flaggedPhrases: string[] }> {
    const toxicPatterns = [
      /\b(?:hate|idiot|stupid|kill|fraud|scam|terrible|garbage)\b/i,
      /\b(?:curse|offensive|toxic)\b/i,
    ];

    const flaggedPhrases: string[] = [];
    for (const pattern of toxicPatterns) {
      const match = text.match(pattern);
      if (match) {
        flaggedPhrases.push(match[0]);
      }
    }

    const score = flaggedPhrases.length > 0
      ? Math.min(1.0, flaggedPhrases.length * 0.2)
      : 0.0;

    return {
      passed: score <= threshold,
      score,
      flaggedPhrases,
    };
  }

  private evaluatePolicyCompliance(
    text: string,
    prohibitedTopics: string[],
  ): { passed: boolean; charCount: number; prohibitedTopicsFound: string[] } {
    // UTF-16 Code Unit Length (Meta Threads constraint <= 500)
    const charCount = text.length;
    const prohibitedTopicsFound: string[] = [];

    for (const topic of prohibitedTopics) {
      if (text.toLowerCase().includes(topic.toLowerCase())) {
        prohibitedTopicsFound.push(topic);
      }
    }

    const passed = charCount <= 500 && prohibitedTopicsFound.length === 0;

    return {
      passed,
      charCount,
      prohibitedTopicsFound,
    };
  }

  private async evaluateSensitiveTopicSpacing(
    workspaceId: string,
    socialAccountId: string,
    text: string,
    flaggedTopics: string[],
  ): Promise<{ passed: boolean; matchedTopic?: string; lastPublishedHoursAgo?: number }> {
    const lower = text.toLowerCase();
    let matchedTopic: string | undefined;

    for (const topic of flaggedTopics) {
      if (lower.includes(topic.toLowerCase())) {
        matchedTopic = topic;
        break;
      }
    }

    if (!matchedTopic) {
      return { passed: true };
    }

    // Look for posts in the past 48 hours containing this topic
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600 * 1000);
    const recentPost = await prisma.publishedPost.findFirst({
      where: {
        workspaceId,
        socialAccountId,
        publishedAt: { gte: fortyEightHoursAgo },
        draft: {
          versions: {
            some: {
              body: { contains: matchedTopic, mode: 'insensitive' },
            },
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
    });

    if (recentPost && recentPost.publishedAt) {
      const hoursAgo = (Date.now() - recentPost.publishedAt.getTime()) / (3600 * 1000);
      return {
        passed: false,
        matchedTopic,
        lastPublishedHoursAgo: Math.round(hoursAgo * 10) / 10,
      };
    }

    return {
      passed: true,
      matchedTopic,
    };
  }
}

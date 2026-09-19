import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@threadpilot/database';
import { JobDispatcherService } from '../jobs/job-dispatcher.service';
import {
  UpdateProfileDto,
  UserPreferencesDto,
  UserProfileDto,
  StyleExampleDto,
  StyleProfileSnapshotDto,
  StyleFeatures,
} from '@threadpilot/types';
import { randomUUID } from 'crypto';

@Injectable()
export class ProfileService {
  constructor(private readonly jobDispatcher: JobDispatcherService) {}

  async getProfile(workspaceId: string): Promise<UserProfileDto> {
    const profile = await prisma.userProfile.findUnique({
      where: { workspaceId },
    });

    if (!profile) {
      throw new NotFoundException('User profile not found for this workspace');
    }

    const styleFeatures: StyleFeatures | null =
      profile.avgPostLengthChars !== null
        ? {
            avgPostLengthChars: profile.avgPostLengthChars ?? 0,
            avgSentenceLengthWords: profile.avgSentenceLengthWords ?? 0,
            questionFrequency: profile.questionFrequency ?? 0,
            emojiFrequency: profile.emojiFrequency ?? 0,
            firstPersonFrequency: profile.firstPersonFrequency ?? 0,
            technicalVocabScore: profile.technicalVocabScore ?? 0,
            listUsageFrequency: profile.listUsageFrequency ?? 0,
            contraryHookFrequency: profile.contraryHookFrequency ?? 0,
          }
        : null;

    return {
      id: profile.id,
      workspaceId: profile.workspaceId,
      bio: profile.bio,
      profession: profile.profession,
      expertise: profile.expertise,
      positioning: profile.positioning,
      styleFeatures,
      profileVersion: profile.profileVersion,
      styleExtractedAt: profile.styleExtractedAt?.toISOString() ?? null,
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  async updateProfile(workspaceId: string, dto: UpdateProfileDto): Promise<UserProfileDto> {
    await prisma.userProfile.update({
      where: { workspaceId },
      data: {
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.profession !== undefined ? { profession: dto.profession } : {}),
        ...(dto.expertise !== undefined ? { expertise: dto.expertise } : {}),
        ...(dto.positioning !== undefined ? { positioning: dto.positioning } : {}),
      },
    });

    return this.getProfile(workspaceId);
  }

  async getPreferences(workspaceId: string) {
    const prefs = await prisma.userPreferences.findUnique({
      where: { workspaceId },
    });

    if (!prefs) {
      throw new NotFoundException('User preferences not found for this workspace');
    }

    return prefs;
  }

  async updatePreferences(workspaceId: string, dto: Partial<UserPreferencesDto>) {
    const updated = await prisma.userPreferences.update({
      where: { workspaceId },
      data: {
        ...(dto.preferredTopics !== undefined ? { preferredTopics: dto.preferredTopics } : {}),
        ...(dto.excludedTopics !== undefined ? { excludedTopics: dto.excludedTopics } : {}),
        ...(dto.preferredFormats !== undefined ? { preferredFormats: dto.preferredFormats } : {}),
        ...(dto.postingFrequency !== undefined ? { postingFrequency: dto.postingFrequency } : {}),
        ...(dto.preferredTimezone !== undefined ? { preferredTimezone: dto.preferredTimezone } : {}),
        ...(dto.autonomyPublishing !== undefined ? { autonomyPublishing: dto.autonomyPublishing } : {}),
        ...(dto.autonomyReplies !== undefined ? { autonomyReplies: dto.autonomyReplies } : {}),
        ...(dto.autonomyResearch !== undefined ? { autonomyResearch: dto.autonomyResearch } : {}),
        ...(dto.autonomyContentGen !== undefined ? { autonomyContentGen: dto.autonomyContentGen } : {}),
        ...(dto.automationPaused !== undefined ? { automationPaused: dto.automationPaused } : {}),
        ...(dto.publishingPaused !== undefined ? { publishingPaused: dto.publishingPaused } : {}),
        ...(dto.repliesPaused !== undefined ? { repliesPaused: dto.repliesPaused } : {}),
      },
    });

    return updated;
  }

  async extractStyle(workspaceId: string, socialAccountId?: string, sampleSize?: number) {
    // Find active connected social account if not provided
    let accountId = socialAccountId;
    if (!accountId) {
      const activeAccount = await prisma.socialAccount.findFirst({
        where: { workspaceId, isConnected: true },
      });
      if (!activeAccount) {
        throw new BadRequestException('No active connected Threads account found to extract style from');
      }
      accountId = activeAccount.id;
    }

    const requestId = randomUUID();
    await this.jobDispatcher.dispatchStyleExtraction({
      requestId,
      workspaceId,
      socialAccountId: accountId,
      sampleSize: sampleSize ?? 100,
    });

    return { requestId };
  }

  async getStyleExamples(workspaceId: string): Promise<StyleExampleDto[]> {
    const examples = await prisma.styleExample.findMany({
      where: { workspaceId },
      orderBy: { id: 'desc' },
      take: 50,
    });

    return examples.map((e) => ({
      id: e.id,
      text: e.text,
      topic: e.topic,
      format: e.format,
      styleFeatures: e.styleFeatures as unknown as StyleFeatures,
      quality: e.quality,
      userRating: e.userRating,
    }));
  }

  async rateStyleExample(workspaceId: string, exampleId: string, rating: number): Promise<StyleExampleDto> {
    if (![-1, 0, 1].includes(rating)) {
      throw new BadRequestException('Rating must be -1 (reject), 0 (neutral), or 1 (positive)');
    }

    const example = await prisma.styleExample.findFirst({
      where: { id: exampleId, workspaceId },
    });

    if (!example) {
      throw new NotFoundException('Style example not found');
    }

    const updated = await prisma.styleExample.update({
      where: { id: exampleId },
      data: { userRating: rating },
    });

    return {
      id: updated.id,
      text: updated.text,
      topic: updated.topic,
      format: updated.format,
      styleFeatures: updated.styleFeatures as unknown as StyleFeatures,
      quality: updated.quality,
      userRating: updated.userRating,
    };
  }

  async getSnapshots(workspaceId: string): Promise<StyleProfileSnapshotDto[]> {
    const snapshots = await prisma.styleProfileSnapshot.findMany({
      where: { workspaceId },
      orderBy: { version: 'desc' },
      take: 20,
    });

    return snapshots.map((s) => ({
      id: s.id,
      version: s.version,
      features: s.features as unknown as StyleFeatures,
      source: s.source,
      createdAt: s.createdAt.toISOString(),
    }));
  }
}

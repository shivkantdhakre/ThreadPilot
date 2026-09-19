import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@threadpilot/database';
import { JobDispatcherService } from '../jobs/job-dispatcher.service';
import { randomUUID } from 'crypto';

@Injectable()
export class ContentService {
  constructor(private readonly jobDispatcher: JobDispatcherService) {}

  async listDrafts(
    workspaceId: string,
    options?: { status?: string; page?: number; limit?: number },
  ) {
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : 20;
    const skip = (page - 1) * limit;

    const where = {
      workspaceId,
      ...(options?.status ? { status: options.status } : {}),
    };

    const [total, drafts] = await Promise.all([
      prisma.contentDraft.count({ where }),
      prisma.contentDraft.findMany({
        where,
        include: {
          versions: {
            orderBy: { version: 'desc' },
          },
          idea: true,
          scheduledPost: true,
          publishedPost: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: drafts.map((d) => {
        const latestVersion = d.versions[0] ?? null;
        return {
          id: d.id,
          workspaceId: d.workspaceId,
          ideaId: d.ideaId,
          topic: d.idea?.topic ?? null,
          format: d.idea?.format ?? null,
          status: d.status,
          generatedBy: d.generatedBy,
          promptVersion: d.promptVersion,
          profileVersion: d.profileVersion,
          editedByUser: d.editedByUser,
          currentVersion: latestVersion
            ? {
                id: latestVersion.id,
                draftId: latestVersion.draftId,
                version: latestVersion.version,
                body: latestVersion.body,
                hook: latestVersion.hook,
                cta: latestVersion.cta,
                editedBy: latestVersion.editedBy,
                diffSummary: latestVersion.diffSummary,
                createdAt: latestVersion.createdAt.toISOString(),
              }
            : null,
          versionsCount: d.versions.length,
          scheduledPost: d.scheduledPost,
          publishedPost: d.publishedPost,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        };
      }),
      meta: {
        total,
        page,
        limit,
        hasMore: skip + drafts.length < total,
      },
    };
  }

  async getDraft(workspaceId: string, id: string) {
    const draft = await prisma.contentDraft.findFirst({
      where: { id, workspaceId },
      include: {
        versions: {
          orderBy: { version: 'asc' },
        },
        idea: true,
        scheduledPost: true,
        publishedPost: true,
      },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${id} not found in workspace`);
    }

    return draft;
  }

  async createDraft(
    workspaceId: string,
    userId: string,
    data: {
      body: string;
      hook?: string;
      cta?: string;
      ideaId?: string;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const draft = await tx.contentDraft.create({
        data: {
          workspaceId,
          ideaId: data.ideaId ?? null,
          status: 'DRAFT',
          editedByUser: true,
          generatedBy: 'manual',
          versions: {
            create: [
              {
                version: 1,
                body: data.body,
                hook: data.hook ?? null,
                cta: data.cta ?? null,
                editedBy: userId,
                diffSummary: 'Initial manual draft',
              },
            ],
          },
        },
        include: {
          versions: true,
        },
      });

      return {
        ...draft,
        currentVersion: draft.versions[0] ?? null,
      };
    });
  }

  async updateDraft(
    workspaceId: string,
    id: string,
    data: {
      status?: string;
    },
  ) {
    const draft = await prisma.contentDraft.findFirst({
      where: { id, workspaceId },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${id} not found`);
    }

    return prisma.contentDraft.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status } : {}),
      },
    });
  }

  async createVersion(
    workspaceId: string,
    draftId: string,
    userId: string,
    data: {
      body: string;
      hook?: string;
      cta?: string;
      diffSummary?: string;
    },
  ) {
    const draft = await prisma.contentDraft.findFirst({
      where: { id: draftId, workspaceId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${draftId} not found`);
    }

    const nextVersionNum = (draft.versions[0]?.version ?? 1) + 1;

    return prisma.$transaction(async (tx) => {
      const version = await tx.contentVersion.create({
        data: {
          draftId,
          version: nextVersionNum,
          body: data.body,
          hook: data.hook ?? null,
          cta: data.cta ?? null,
          editedBy: userId,
          diffSummary: data.diffSummary ?? `Manual edit v${nextVersionNum}`,
        },
      });

      await tx.contentDraft.update({
        where: { id: draftId },
        data: {
          editedByUser: true,
        },
      });

      return version;
    });
  }

  async listVersions(workspaceId: string, draftId: string) {
    const draft = await prisma.contentDraft.findFirst({
      where: { id: draftId, workspaceId },
      select: { id: true },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${draftId} not found`);
    }

    const versions = await prisma.contentVersion.findMany({
      where: { draftId },
      orderBy: { version: 'asc' },
    });

    return { versions };
  }

  async deleteDraft(workspaceId: string, id: string) {
    const draft = await prisma.contentDraft.findFirst({
      where: { id, workspaceId },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${id} not found`);
    }

    await prisma.contentDraft.delete({
      where: { id },
    });

    return { success: true };
  }

  async generate(
    workspaceId: string,
    userId: string,
    payload: {
      ideaId?: string;
      topic?: string;
      format?: string;
      tone?: string;
      additionalContext?: string;
    },
  ) {
    const requestId = randomUUID();

    await this.jobDispatcher.dispatchContentGeneration({
      requestId,
      workspaceId,
      requestedBy: userId,
      ...(payload.ideaId ? { ideaId: payload.ideaId } : {}),
      ...(payload.topic ? { topic: payload.topic } : {}),
      ...(payload.format ? { format: payload.format } : {}),
      ...(payload.tone ? { tone: payload.tone } : {}),
      ...(payload.additionalContext ? { additionalContext: payload.additionalContext } : {}),
    });

    return { requestId };
  }

  async improve(
    workspaceId: string,
    payload: {
      draftId: string;
      versionId: string;
      instruction: string;
    },
  ) {
    const draft = await prisma.contentDraft.findFirst({
      where: { id: payload.draftId, workspaceId },
      include: {
        versions: true,
      },
    });

    if (!draft) {
      throw new NotFoundException(`Draft ${payload.draftId} not found`);
    }

    const version = draft.versions.find((v) => v.id === payload.versionId);
    if (!version) {
      throw new NotFoundException(`Version ${payload.versionId} not found for draft`);
    }

    const requestId = randomUUID();

    await this.jobDispatcher.dispatchContentImprovement({
      requestId,
      workspaceId,
      draftId: payload.draftId,
      versionId: payload.versionId,
      instruction: payload.instruction,
    });

    return { requestId };
  }
}

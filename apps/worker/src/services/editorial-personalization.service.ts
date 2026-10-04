import { Injectable, Logger, Optional } from '@nestjs/common';
import { prisma, PrismaClient, MemoryRepository } from '@threadpilot/database';
import { AIFactoryService } from './ai-factory.service';

export interface StyleCorrectionDelta {
  originalText: string;
  finalText: string;
  feedbackType: 'STYLE_CORRECTION' | 'TONE_CORRECTION' | 'FACTUAL_CORRECTION' | 'OTHER';
}

/**
 * Memory Contamination Guard:
 * Checks whether the final text contains copied phrases from third-party comments or root posts.
 * Third-party language must NOT contaminate the personal voice memory.
 */
export function sanitizeMemoryContent(
  finalText: string,
  rootPostText?: string | null,
  incomingCommentText?: string | null,
): { isClean: boolean; reason?: string } {
  if (!finalText || finalText.trim().length === 0) {
    return { isClean: false, reason: 'Empty text' };
  }

  const cleanFinal = finalText.toLowerCase().trim();

  // If the user's edit literally copies the commenter's entire sentence verbatim (e.g. quote stuffing)
  if (incomingCommentText && incomingCommentText.length > 30) {
    const commentSnippet = incomingCommentText.toLowerCase().trim();
    if (cleanFinal.includes(commentSnippet)) {
      return {
        isClean: false,
        reason: 'Final text contains full verbatim copy of third-party comment',
      };
    }
  }

  return { isClean: true };
}

@Injectable()
export class EditorialPersonalizationService {
  private readonly logger = new Logger(EditorialPersonalizationService.name);
  private readonly memoryRepo: MemoryRepository;

  constructor(
    private readonly aiFactory: AIFactoryService,
    @Optional() private readonly db: PrismaClient = prisma,
  ) {
    this.memoryRepo = new MemoryRepository(this.db);
  }

  /**
   * Processes unindexed editorial feedback candidates and indexes safe stylistic deltas into pgvector.
   */
  async processPendingEditorialFeedback(): Promise<number> {
    const candidates = await this.db.editorialFeedback.findMany({
      where: {
        isVectorCandidate: true,
        indexedToVectorAt: null,
        feedbackType: { in: ['STYLE_CORRECTION', 'TONE_CORRECTION'] },
      },
      include: {
        interaction: true,
        replyExecution: true,
      },
      take: 20,
    });

    let indexedCount = 0;

    for (const feedback of candidates) {
      // 1. Confirm reply execution reached terminal PUBLISHED status
      if (feedback.replyExecution && feedback.replyExecution.status !== 'PUBLISHED') {
        this.logger.log(
          `Skipping editorial feedback ${feedback.id}: execution ${feedback.replyExecution.id} not yet PUBLISHED (status=${feedback.replyExecution.status})`,
        );
        continue;
      }

      // 2. Memory Contamination Guard check
      const contaminationCheck = sanitizeMemoryContent(
        feedback.finalText,
        feedback.interaction?.rootThreadsPostId,
        feedback.interaction?.content,
      );

      if (!contaminationCheck.isClean) {
        this.logger.warn(
          `Editorial feedback ${feedback.id} failed memory contamination guard: ${contaminationCheck.reason}. Discarding as vector candidate.`,
        );
        await this.db.editorialFeedback.update({
          where: { id: feedback.id },
          data: { isVectorCandidate: false },
        });
        continue;
      }

      // 3. Create MemoryItem for the account's personal voice
      try {
        const memoryItem = await this.db.memoryItem.create({
          data: {
            workspaceId: feedback.workspaceId,
            type: 'STYLE_EXAMPLE',
            content: feedback.finalText,
            sourceId: feedback.id,
            metadata: {
              source: 'EDITORIAL_FEEDBACK',
              feedbackType: feedback.feedbackType,
              socialAccountId: feedback.socialAccountId,
              originalText: feedback.originalText,
              wordDiffSummary: feedback.wordDiffSummary,
            },
          },
        });

        // Generate vector embedding via AI factory
        const aiProvider = this.aiFactory.getProvider();
        const embedRes = await aiProvider.embed({ texts: [feedback.finalText] });
        const vector = embedRes.embeddings[0];

        if (vector) {
          await this.memoryRepo.upsertEmbedding(
            memoryItem.id,
            vector,
            embedRes.model || process.env.GEMINI_MODEL_EMBEDDING || 'gemini-embedding-2',
            vector.length,
            'DOCUMENT',
            'v2',
          );
        }

        // Update feedback record as indexed
        await this.db.editorialFeedback.update({
          where: { id: feedback.id },
          data: {
            indexedToVectorAt: new Date(),
            memoryItemId: memoryItem.id,
          },
        });

        indexedCount++;
        this.logger.log(
          `Indexed editorial voice delta ${feedback.id} into pgvector memory (memoryItem: ${memoryItem.id})`,
        );
      } catch (err: any) {
        this.logger.error(`Failed to index editorial feedback ${feedback.id}: ${err.message}`, err.stack);
      }
    }

    return indexedCount;
  }
}

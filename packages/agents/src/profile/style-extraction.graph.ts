import { StateGraph, START, END } from '@langchain/langgraph';
import { z } from 'zod';
import type { PrismaClient } from '@threadpilot/database';
import { MemoryRepository } from '@threadpilot/database';
import type { AIProvider } from '@threadpilot/ai';
import { createLogger } from '@threadpilot/observability';
import {
  buildStyleAnalyzeSystemPrompt,
  buildStyleAnalyzeUserPrompt,
  PROMPT_VERSION_STYLE,
} from '@threadpilot/prompts';
import {
  StyleExtractionAnnotation,
  StyleExtractionState,
  StyleFeaturesSchema,
  StyleExampleCandidateSchema,
} from '../state';

const logger = createLogger({ service: 'StyleExtractionGraph' });

const StyleAnalysisOutputSchema = z.object({
  styleFeatures: StyleFeaturesSchema,
  examples: z.array(StyleExampleCandidateSchema).min(1).max(20),
});

type StyleAnalysisOutput = z.infer<typeof StyleAnalysisOutputSchema>;

export interface StyleExtractionGraphDependencies {
  db: PrismaClient;
  aiProvider: AIProvider;
  memoryRepo: MemoryRepository;
}

export function createStyleExtractionGraph(deps: {
  db: PrismaClient;
  aiProvider: AIProvider;
  memoryRepo: MemoryRepository;
}) {
  const { db, aiProvider, memoryRepo } = deps;

  async function loadSamplePosts(state: StyleExtractionState): Promise<Partial<StyleExtractionState>> {
    logger.info({ workspaceId: state.workspaceId, socialAccountId: state.socialAccountId }, 'Loading sample posts for style extraction');

    const posts = await db.threadPost.findMany({
      where: { socialAccountId: state.socialAccountId },
      orderBy: { postedAt: 'desc' },
      take: 100,
      select: { id: true, text: true },
    });

    if (posts.length === 0) {
      logger.warn({ socialAccountId: state.socialAccountId }, 'No ThreadPost records found for style extraction');
      return {
        samplePosts: [],
        error: 'No posts found to extract style from',
        status: 'failure',
      };
    }

    return {
      samplePosts: posts.map((p) => ({ text: p.text, threadPostId: p.id })),
      status: 'running',
    };
  }

  async function extractMeasuredFeatures(state: StyleExtractionState): Promise<Partial<StyleExtractionState>> {
    if (state.error || state.samplePosts.length === 0) {
      return {};
    }

    logger.info({ postCount: state.samplePosts.length }, 'Extracting stylometric features via AI');

    try {
      const response = await aiProvider.complete<StyleAnalysisOutput>({
        systemPrompt: buildStyleAnalyzeSystemPrompt(),
        userPrompt: buildStyleAnalyzeUserPrompt({ posts: state.samplePosts }),
        outputSchema: StyleAnalysisOutputSchema,
      });

      return {
        measuredFeatures: response.result.styleFeatures,
        exampleCandidates: response.result.examples,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Failed to extract style features from AI provider');
      return {
        error: `AI style extraction failed: ${errorMsg}`,
        status: 'failure',
      };
    }
  }

  async function generateEmbeddings(state: StyleExtractionState): Promise<Partial<StyleExtractionState>> {
    if (state.error || !state.exampleCandidates || state.exampleCandidates.length === 0) {
      return {};
    }

    logger.info({ exampleCount: state.exampleCandidates.length }, 'Generating embeddings for style examples');

    try {
      const texts = state.exampleCandidates.map((ex) => ex.text);
      const embedResponse = await aiProvider.embed({ texts });

      return {
        embeddings: embedResponse.embeddings,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Failed to generate embeddings for style examples');
      return {
        error: `Embedding generation failed: ${errorMsg}`,
        status: 'failure',
      };
    }
  }

  async function persistProfile(state: StyleExtractionState): Promise<Partial<StyleExtractionState>> {
    if (state.error || !state.measuredFeatures || !state.exampleCandidates || !state.embeddings) {
      return { status: 'failure' };
    }

    logger.info({ workspaceId: state.workspaceId }, 'Persisting updated style profile snapshot & examples');

    try {
      const { profileVersion: updatedVersion, embeddingsToUpsert } = await db.$transaction(
        async (tx) => {
          const features = state.measuredFeatures!;

          const profile = await tx.userProfile.upsert({
            where: { workspaceId: state.workspaceId },
            create: {
              workspaceId: state.workspaceId,
              profileVersion: 1,
              avgPostLengthChars: features.avgPostLengthChars,
              avgSentenceLengthWords: features.avgSentenceLengthWords,
              questionFrequency: features.questionFrequency,
              emojiFrequency: features.emojiFrequency,
              firstPersonFrequency: features.firstPersonFrequency,
              technicalVocabScore: features.technicalVocabScore,
              listUsageFrequency: features.listUsageFrequency,
              contraryHookFrequency: features.contraryHookFrequency,
              styleExtractedAt: new Date(),
            },
            update: {
              profileVersion: { increment: 1 },
              avgPostLengthChars: features.avgPostLengthChars,
              avgSentenceLengthWords: features.avgSentenceLengthWords,
              questionFrequency: features.questionFrequency,
              emojiFrequency: features.emojiFrequency,
              firstPersonFrequency: features.firstPersonFrequency,
              technicalVocabScore: features.technicalVocabScore,
              listUsageFrequency: features.listUsageFrequency,
              contraryHookFrequency: features.contraryHookFrequency,
              styleExtractedAt: new Date(),
            },
          });

          await tx.styleProfileSnapshot.create({
            data: {
              workspaceId: state.workspaceId,
              version: profile.profileVersion,
              features: features as unknown as object,
              source: 'style_extraction',
            },
          });

          const toUpsert: { memoryItemId: string; embedding: number[] }[] = [];

          // Upsert style examples linked to MemoryItems
          for (let i = 0; i < state.exampleCandidates.length; i++) {
            const candidate = state.exampleCandidates[i];
            const embedding = state.embeddings?.[i];

            if (!candidate) continue;

            const memoryItem = await tx.memoryItem.create({
              data: {
                workspaceId: state.workspaceId,
                type: 'STYLE_EXAMPLE',
                content: candidate.text,
                metadata: {
                  topic: candidate.topic,
                  format: candidate.format,
                  reason: candidate.reason,
                  promptVersion: PROMPT_VERSION_STYLE,
                },
              },
            });

            if (embedding && embedding.length > 0) {
              toUpsert.push({ memoryItemId: memoryItem.id, embedding });
            }

            await tx.styleExample.create({
              data: {
                workspaceId: state.workspaceId,
                memoryItemId: memoryItem.id,
                text: candidate.text,
                topic: candidate.topic,
                format: candidate.format,
                styleFeatures: { reason: candidate.reason },
              },
            });
          }

          return { profileVersion: profile.profileVersion, embeddingsToUpsert: toUpsert };
        },
        {
          maxWait: 10000,
          timeout: 30000,
        },
      );

      // Upsert embeddings after transaction commits to prevent deadlocks and transaction timeouts
      for (const item of embeddingsToUpsert) {
        try {
          await memoryRepo.upsertEmbedding(item.memoryItemId, item.embedding, aiProvider.modelName);
        } catch (embErr) {
          logger.warn({ err: embErr, memoryItemId: item.memoryItemId }, 'Failed to persist embedding for style example');
        }
      }

      return {
        profileVersion: updatedVersion,
        status: 'success',
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Failed to persist style profile transaction');
      return {
        error: `Database persistence failed: ${errorMsg}`,
        status: 'failure',
      };
    }
  }

  function shouldContinueAfterLoad(state: StyleExtractionState) {
    if (state.error || state.samplePosts.length === 0) return 'end';
    return 'extract';
  }

  function shouldContinueAfterExtract(state: StyleExtractionState) {
    if (state.error || !state.measuredFeatures) return 'end';
    return 'embed';
  }

  function shouldContinueAfterEmbed(state: StyleExtractionState) {
    if (state.error || !state.embeddings) return 'end';
    return 'persist';
  }

  const workflow = new StateGraph(StyleExtractionAnnotation)
    .addNode('loadSamplePosts', loadSamplePosts)
    .addNode('extractMeasuredFeatures', extractMeasuredFeatures)
    .addNode('generateEmbeddings', generateEmbeddings)
    .addNode('persistProfile', persistProfile)
    .addEdge(START, 'loadSamplePosts')
    .addConditionalEdges('loadSamplePosts', shouldContinueAfterLoad, {
      extract: 'extractMeasuredFeatures',
      end: END,
    })
    .addConditionalEdges('extractMeasuredFeatures', shouldContinueAfterExtract, {
      embed: 'generateEmbeddings',
      end: END,
    })
    .addConditionalEdges('generateEmbeddings', shouldContinueAfterEmbed, {
      persist: 'persistProfile',
      end: END,
    })
    .addEdge('persistProfile', END);

  return workflow.compile();
}

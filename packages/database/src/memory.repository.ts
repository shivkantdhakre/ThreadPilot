import { PrismaClient } from '@prisma/client';

export const CURRENT_EMBEDDING_PIPELINE_VERSION = 'v2';

export interface EmbeddingMetadataProvenance {
  embeddingModel: string;
  embeddingDimensions: number;
  taskType?: 'DOCUMENT' | 'QUERY' | 'SIMILARITY';
  embeddingPipelineVersion: string;
}

/**
 * MemoryRepository
 *
 * All pgvector operations go through this class using $queryRaw.
 * Application code never writes vector SQL directly.
 * This isolates the vector concern so the rest of the codebase
 * doesn't need to know about pgvector internals.
 */
export class MemoryRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Store or update a vector embedding for a MemoryItem.
   * Uses PostgreSQL's UPDATE rather than Prisma — vector column is not a Prisma field.
   * Records full provenance: embeddingModel, embeddingDimensions, taskType, and pipelineVersion.
   */
  async upsertEmbedding(
    memoryItemId: string,
    embedding: number[],
    embeddingModel: string,
    embeddingDimensions = embedding.length,
    taskType?: 'DOCUMENT' | 'QUERY' | 'SIMILARITY',
    embeddingPipelineVersion = CURRENT_EMBEDDING_PIPELINE_VERSION,
  ): Promise<void> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    const provenance: EmbeddingMetadataProvenance = {
      embeddingModel,
      embeddingDimensions,
      ...(taskType ? { taskType } : {}),
      embeddingPipelineVersion,
    };
    const metadataUpdate = JSON.stringify(provenance);
    await this.db.$executeRaw`
      UPDATE memory_items
      SET embedding = ${vectorLiteral}::vector,
          embedding_model = ${embeddingModel},
          metadata = metadata || ${metadataUpdate}::jsonb
      WHERE id = ${memoryItemId}::uuid
    `;
  }

  /**
   * Find semantically similar MemoryItems using cosine similarity.
   * Returns items ordered by similarity descending.
   * Supports optional pipelineVersion filtering to prevent mixing vectors created
   * with different embedding preparation pipelines without an explicit migration check.
   */
  async findSimilar(
    workspaceId: string,
    queryEmbedding: number[],
    options: {
      type?: string;
      limit?: number;
      minSimilarity?: number;
      pipelineVersion?: string;
    } = {},
  ): Promise<Array<{ memoryItemId: string; content: string; similarity: number }>> {
    const { type, limit = 10, minSimilarity = 0.7, pipelineVersion } = options;
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    type RawResult = { memory_item_id: string; content: string; similarity: number };

    const results = await this.db.$queryRaw<RawResult[]>`
      SELECT
        id as memory_item_id,
        content,
        1 - (embedding <=> ${vectorLiteral}::vector) as similarity
      FROM memory_items
      WHERE workspace_id = ${workspaceId}::uuid
        AND embedding IS NOT NULL
        ${type ? this.db.$queryRaw`AND type = ${type}` : this.db.$queryRaw``}
        ${pipelineVersion ? this.db.$queryRaw`AND (metadata->>'embeddingPipelineVersion') = ${pipelineVersion}` : this.db.$queryRaw``}
        AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      memoryItemId: r.memory_item_id,
      content: r.content,
      similarity: Number(r.similarity),
    }));
  }

  /**
   * Find semantically similar style examples.
   * Optionally filter by topic for more targeted retrieval.
   * Excludes examples with userRating = -1 (explicitly rejected by user).
   */
  async findSimilarStyleExamples(
    workspaceId: string,
    queryEmbedding: number[],
    topic?: string,
    limit = 5,
    pipelineVersion?: string,
  ): Promise<Array<{ id: string; text: string; topic: string | null; similarity: number }>> {
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    type RawResult = {
      style_example_id: string;
      text: string;
      topic: string | null;
      similarity: number;
    };

    const results = await this.db.$queryRaw<RawResult[]>`
      SELECT
        se.id as style_example_id,
        se.text,
        se.topic,
        1 - (mi.embedding <=> ${vectorLiteral}::vector) as similarity
      FROM style_examples se
      JOIN memory_items mi ON mi.id = se.memory_item_id
      WHERE se.workspace_id = ${workspaceId}::uuid
        AND mi.embedding IS NOT NULL
        AND (se.user_rating IS NULL OR se.user_rating >= 0)
        ${topic ? this.db.$queryRaw`AND se.topic = ${topic}` : this.db.$queryRaw``}
        ${pipelineVersion ? this.db.$queryRaw`AND (mi.metadata->>'embeddingPipelineVersion') = ${pipelineVersion}` : this.db.$queryRaw``}
      ORDER BY mi.embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      id: r.style_example_id,
      text: r.text,
      topic: r.topic,
      similarity: Number(r.similarity),
    }));
  }

  /**
   * Find MemoryItems that require re-embedding (missing embedding or older pipeline version).
   * Ensures existing vectors can be re-generated safely without vector space corruption.
   */
  async findItemsNeedingReEmbedding(
    workspaceId: string,
    targetPipelineVersion = CURRENT_EMBEDDING_PIPELINE_VERSION,
    limit = 100,
  ): Promise<Array<{ id: string; content: string; type: string }>> {
    type RawItem = { id: string; content: string; type: string };
    const items = await this.db.$queryRaw<RawItem[]>`
      SELECT id, content, type
      FROM memory_items
      WHERE workspace_id = ${workspaceId}::uuid
        AND (
          embedding IS NULL
          OR (metadata->>'embeddingPipelineVersion') IS NULL
          OR (metadata->>'embeddingPipelineVersion') != ${targetPipelineVersion}
        )
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    return items;
  }
}

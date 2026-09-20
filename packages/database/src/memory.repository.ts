import { PrismaClient, Prisma } from '@prisma/client';

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
   * Store or update a vector embedding for a MemoryItem in the multi-representation memory_embeddings table.
   * Enables storing multiple task-specific representations (e.g. DOCUMENT for retrieval and SIMILARITY for duplicate check)
   * for the same memory item with full provenance.
   * Also updates memory_items metadata and primary embedding for backward compatibility.
   */
  async upsertEmbedding(
    memoryItemId: string,
    embedding: number[],
    embeddingModel: string,
    embeddingDimensions = embedding.length,
    taskType: 'DOCUMENT' | 'QUERY' | 'SIMILARITY' = 'DOCUMENT',
    embeddingPipelineVersion = CURRENT_EMBEDDING_PIPELINE_VERSION,
  ): Promise<void> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    const provenance: EmbeddingMetadataProvenance = {
      embeddingModel,
      embeddingDimensions,
      taskType,
      embeddingPipelineVersion,
    };
    const metadataUpdate = JSON.stringify(provenance);

    // 1. Insert/Update into memory_embeddings table
    await this.db.$executeRaw`
      INSERT INTO memory_embeddings (
        id,
        memory_item_id,
        workspace_id,
        model,
        dimensions,
        task_type,
        pipeline_version,
        embedding,
        created_at
      )
      SELECT
        uuid_generate_v4(),
        mi.id,
        mi.workspace_id,
        ${embeddingModel},
        ${embeddingDimensions},
        ${taskType},
        ${embeddingPipelineVersion},
        ${vectorLiteral}::vector,
        NOW()
      FROM memory_items mi
      WHERE mi.id = ${memoryItemId}::uuid
      ON CONFLICT (memory_item_id, model, task_type, pipeline_version)
      DO UPDATE SET
        embedding = EXCLUDED.embedding,
        dimensions = EXCLUDED.dimensions,
        created_at = NOW()
    `;

    // 2. Also keep memory_items updated for backward compatibility (primary DOCUMENT embedding)
    if (taskType === 'DOCUMENT') {
      await this.db.$executeRaw`
        UPDATE memory_items
        SET embedding = ${vectorLiteral}::vector,
            embedding_model = ${embeddingModel},
            metadata = metadata || ${metadataUpdate}::jsonb
        WHERE id = ${memoryItemId}::uuid
      `;
    } else {
      await this.db.$executeRaw`
        UPDATE memory_items
        SET metadata = metadata || ${metadataUpdate}::jsonb
        WHERE id = ${memoryItemId}::uuid
      `;
    }
  }

  /**
   * Find semantically similar MemoryItems using cosine similarity over memory_embeddings.
   * Returns items ordered by similarity descending.
   * Supports pipelineVersion filtering to prevent mixing vectors created
   * with different embedding preparation pipelines without an explicit migration check.
   * Supports taskType filtering to ensure symmetric coordinate comparison:
   *   - taskType: 'DOCUMENT' for asymmetric retrieval queries
   *   - taskType: 'SIMILARITY' for symmetric duplicate detection
   */
  async findSimilar(
    workspaceId: string,
    queryEmbedding: number[],
    options: {
      type?: string;
      limit?: number;
      minSimilarity?: number;
      pipelineVersion?: string;
      taskType?: 'DOCUMENT' | 'QUERY' | 'SIMILARITY';
    } = {},
  ): Promise<Array<{ memoryItemId: string; content: string; similarity: number }>> {
    const { type, limit = 10, minSimilarity = 0.7, pipelineVersion, taskType } = options;
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    type RawResult = { memory_item_id: string; content: string; similarity: number };

    const results = await this.db.$queryRaw<RawResult[]>`
      SELECT
        mi.id as memory_item_id,
        mi.content,
        1 - (me.embedding <=> ${vectorLiteral}::vector) as similarity
      FROM memory_embeddings me
      JOIN memory_items mi ON mi.id = me.memory_item_id
      WHERE me.workspace_id = ${workspaceId}::uuid
        ${type ? Prisma.sql`AND mi.type = ${type}` : Prisma.empty}
        ${taskType ? Prisma.sql`AND me.task_type = ${taskType}` : Prisma.empty}
        ${pipelineVersion ? Prisma.sql`AND me.pipeline_version = ${pipelineVersion}` : Prisma.empty}
        AND 1 - (me.embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
      ORDER BY me.embedding <=> ${vectorLiteral}::vector
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
   * Explicitly filters taskType: 'DOCUMENT' to ensure asymmetric retrieval vectors are compared.
   * Optionally filter by topic for more targeted retrieval.
   * Excludes examples with userRating = -1 (explicitly rejected by user).
   */
  async findSimilarStyleExamples(
    workspaceId: string,
    queryEmbedding: number[],
    topic?: string,
    limit = 5,
    pipelineVersion?: string,
    taskType: 'DOCUMENT' | 'QUERY' | 'SIMILARITY' = 'DOCUMENT',
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
        1 - (me.embedding <=> ${vectorLiteral}::vector) as similarity
      FROM style_examples se
      JOIN memory_embeddings me ON me.memory_item_id = se.memory_item_id
      WHERE se.workspace_id = ${workspaceId}::uuid
        AND (se.user_rating IS NULL OR se.user_rating >= 0)
        AND me.task_type = ${taskType}
        ${topic ? Prisma.sql`AND se.topic = ${topic}` : Prisma.empty}
        ${pipelineVersion ? Prisma.sql`AND me.pipeline_version = ${pipelineVersion}` : Prisma.empty}
      ORDER BY me.embedding <=> ${vectorLiteral}::vector
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
      SELECT mi.id, mi.content, mi.type
      FROM memory_items mi
      LEFT JOIN memory_embeddings me
        ON me.memory_item_id = mi.id
       AND me.pipeline_version = ${targetPipelineVersion}
      WHERE mi.workspace_id = ${workspaceId}::uuid
        AND me.id IS NULL
      ORDER BY mi.created_at ASC
      LIMIT ${limit}
    `;
    return items;
  }
}

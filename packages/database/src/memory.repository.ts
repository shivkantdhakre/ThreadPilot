import { PrismaClient, Prisma } from '@prisma/client';

export const CURRENT_EMBEDDING_PIPELINE_VERSION = 'v2';

export interface EmbeddingMetadataProvenance {
  embeddingModel: string;
  embeddingDimensions: number;
  taskType?: 'DOCUMENT' | 'QUERY' | 'SIMILARITY';
  embeddingPipelineVersion: string;
}

export interface FindSimilarOptions {
  model: string; // Required: enforces strict coordinate-space isolation
  type?: string;
  limit?: number;
  minSimilarity?: number;
  pipelineVersion?: string;
  taskType?: 'DOCUMENT' | 'QUERY' | 'SIMILARITY';
  dimensions?: number;
}

export interface ReEmbeddingItem {
  id: string;
  content: string;
  type: string;
  missingTaskTypes: Array<'DOCUMENT' | 'SIMILARITY'>;
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
   * Requires model filtering to guarantee coordinate space isolation.
   * Supports pipelineVersion filtering to prevent mixing vectors created
   * with different embedding preparation pipelines without an explicit migration check.
   * Supports taskType filtering to ensure symmetric coordinate comparison:
   *   - taskType: 'DOCUMENT' for asymmetric retrieval queries
   *   - taskType: 'SIMILARITY' for symmetric duplicate detection
   */
  async findSimilar(
    workspaceId: string,
    queryEmbedding: number[],
    options: FindSimilarOptions,
  ): Promise<Array<{ memoryItemId: string; content: string; similarity: number }>> {
    const { model, type, limit = 10, minSimilarity = 0.7, pipelineVersion, taskType, dimensions } = options;
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
        AND me.model = ${model}
        ${type ? Prisma.sql`AND mi.type = ${type}` : Prisma.empty}
        ${taskType ? Prisma.sql`AND me.task_type = ${taskType}` : Prisma.empty}
        ${pipelineVersion ? Prisma.sql`AND me.pipeline_version = ${pipelineVersion}` : Prisma.empty}
        ${dimensions ? Prisma.sql`AND me.dimensions = ${dimensions}` : Prisma.empty}
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
   * Explicitly filters model and taskType: 'DOCUMENT' to ensure asymmetric retrieval vectors are compared.
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
    model = 'gemini-embedding-2',
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
        AND me.model = ${model}
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
   * Find MemoryItems that require re-embedding (missing required embeddings or older pipeline version).
   * For POST items: requires BOTH DOCUMENT and SIMILARITY representations for target pipeline version and model.
   * For other items (e.g. STYLE_EXAMPLE): requires DOCUMENT representation.
   */
  async findItemsNeedingReEmbedding(
    workspaceId: string,
    options: {
      targetPipelineVersion?: string;
      model?: string;
      limit?: number;
    } = {},
  ): Promise<ReEmbeddingItem[]> {
    const {
      targetPipelineVersion = CURRENT_EMBEDDING_PIPELINE_VERSION,
      model = 'gemini-embedding-2',
      limit = 100,
    } = options;

    type RawItem = {
      id: string;
      content: string;
      type: string;
      existing_task_types: string[] | null;
    };

    const items = await this.db.$queryRaw<RawItem[]>`
      SELECT
        mi.id,
        mi.content,
        mi.type,
        ARRAY_AGG(DISTINCT me.task_type) FILTER (WHERE me.task_type IS NOT NULL) as existing_task_types
      FROM memory_items mi
      LEFT JOIN memory_embeddings me
        ON me.memory_item_id = mi.id
       AND me.pipeline_version = ${targetPipelineVersion}
       AND me.model = ${model}
      WHERE mi.workspace_id = ${workspaceId}::uuid
      GROUP BY mi.id, mi.content, mi.type, mi.created_at
      HAVING (
        (mi.type = 'POST' AND (
          NOT ('DOCUMENT' = ANY(ARRAY_AGG(me.task_type))) OR
          NOT ('SIMILARITY' = ANY(ARRAY_AGG(me.task_type))) OR
          ARRAY_AGG(me.task_type) IS NULL
        ))
        OR
        (mi.type != 'POST' AND (
          NOT ('DOCUMENT' = ANY(ARRAY_AGG(me.task_type))) OR
          ARRAY_AGG(me.task_type) IS NULL
        ))
      )
      ORDER BY mi.created_at ASC
      LIMIT ${limit}
    `;

    return items.map((item) => {
      const existing = new Set(item.existing_task_types ?? []);
      const missingTaskTypes: Array<'DOCUMENT' | 'SIMILARITY'> = [];
      if (!existing.has('DOCUMENT')) {
        missingTaskTypes.push('DOCUMENT');
      }
      if (item.type === 'POST' && !existing.has('SIMILARITY')) {
        missingTaskTypes.push('SIMILARITY');
      }
      return {
        id: item.id,
        content: item.content,
        type: item.type,
        missingTaskTypes,
      };
    });
  }
}

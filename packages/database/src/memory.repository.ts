import { PrismaClient } from '@prisma/client';

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
   */
  async upsertEmbedding(
    memoryItemId: string,
    embedding: number[],
    embeddingModel: string,
  ): Promise<void> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    await this.db.$executeRaw`
      UPDATE memory_items
      SET embedding = ${vectorLiteral}::vector,
          embedding_model = ${embeddingModel}
      WHERE id = ${memoryItemId}::uuid
    `;
  }

  /**
   * Find semantically similar MemoryItems using cosine similarity.
   * Returns items ordered by similarity descending.
   */
  async findSimilar(
    workspaceId: string,
    queryEmbedding: number[],
    options: {
      type?: string;
      limit?: number;
      minSimilarity?: number;
    } = {},
  ): Promise<Array<{ memoryItemId: string; content: string; similarity: number }>> {
    const { type, limit = 10, minSimilarity = 0.7 } = options;
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
}

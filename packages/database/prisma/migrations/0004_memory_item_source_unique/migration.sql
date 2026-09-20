-- Migration: 0004_memory_item_source_unique
-- Enforces database-level uniqueness on (workspace_id, source_id) for MemoryItems
-- to prevent duplicate memory creation under concurrent ingestion.
-- Removes redundant legacy embedding_model column from memory_items (now in memory_embeddings).

-- Preflight deduplication: remove any duplicate (workspace_id, source_id) keeping the most recent
DELETE FROM memory_items mi1
WHERE mi1.source_id IS NOT NULL
  AND mi1.id IN (
    SELECT mi_dup.id
    FROM memory_items mi_dup
    JOIN (
      SELECT workspace_id, source_id, MAX(created_at) as max_created_at
      FROM memory_items
      WHERE source_id IS NOT NULL
      GROUP BY workspace_id, source_id
      HAVING COUNT(*) > 1
    ) dupes ON mi_dup.workspace_id = dupes.workspace_id
           AND mi_dup.source_id = dupes.source_id
           AND mi_dup.created_at < dupes.max_created_at
  );

CREATE UNIQUE INDEX IF NOT EXISTS memory_items_workspace_id_source_id_key
  ON memory_items (workspace_id, source_id);

ALTER TABLE memory_items
  DROP COLUMN IF EXISTS embedding_model;

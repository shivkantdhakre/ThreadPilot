-- Migration: 0003_memory_embeddings
-- Adds multi-representation vector storage table for MemoryItems.
-- Enables holding both DOCUMENT (asymmetric retrieval) and SIMILARITY (symmetric duplicate check)
-- vectors for the same memory item without collisions.

CREATE TABLE IF NOT EXISTS memory_embeddings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_item_id uuid NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  model text NOT NULL,
  dimensions integer NOT NULL,
  task_type text NOT NULL,
  pipeline_version text NOT NULL,
  embedding vector(768) NOT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_memory_embedding UNIQUE (memory_item_id, model, task_type, pipeline_version)
);

-- IVFFlat index for cosine similarity search on memory_embeddings
CREATE INDEX IF NOT EXISTS memory_embeddings_vector_idx
  ON memory_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Composite index for fast tenant and task-type lookup
CREATE INDEX IF NOT EXISTS memory_embeddings_lookup_idx
  ON memory_embeddings (workspace_id, task_type, pipeline_version);

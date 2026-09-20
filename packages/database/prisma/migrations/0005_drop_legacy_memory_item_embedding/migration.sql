-- Migration: 0005_drop_legacy_memory_item_embedding
-- Removes legacy vector column 'embedding' from memory_items.
-- Authoritative vector storage for all representations (DOCUMENT, SIMILARITY)
-- lives strictly in the memory_embeddings table.

ALTER TABLE "memory_items"
  DROP COLUMN IF EXISTS "embedding";

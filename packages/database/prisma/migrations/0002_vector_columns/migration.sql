-- Migration: 0002_vector_columns
-- Adds pgvector extension and vector columns to tables.
-- Runs AFTER 0001_init which creates the base tables.
--
-- IMPORTANT: Run this migration after `prisma migrate deploy` in the Compose migrate service.
-- The migrate service script should run both: prisma migrate deploy && psql < 0002...sql
-- OR: add this as a Prisma custom migration (see Prisma docs on customizing migrations).

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to memory_items
ALTER TABLE memory_items
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- IVFFlat index for cosine similarity search on memory_items
-- lists=100 appropriate for up to ~1M rows
CREATE INDEX IF NOT EXISTS memory_items_embedding_idx
  ON memory_items USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

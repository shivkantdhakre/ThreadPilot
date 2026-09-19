-- infrastructure/docker/postgres/init.sql
-- Runs on first container start (docker-entrypoint-initdb.d).
-- Enables uuid-ossp for uuid_generate_v4() used in Prisma schema.
-- pgvector is enabled via migration 0002_vector_columns (after Prisma creates tables).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

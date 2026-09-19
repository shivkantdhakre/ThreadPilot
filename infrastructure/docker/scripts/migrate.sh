#!/bin/sh
set -e

echo "Running Prisma migrations..."
cd /app
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma

echo "Running vector column migration..."
# Apply the pgvector column SQL using psql
# DATABASE_URL is set by the Compose environment block
psql "$DATABASE_URL" -f packages/database/prisma/migrations/0002_vector_columns/migration.sql

echo "Migrations complete."

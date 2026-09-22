#!/bin/sh
set -e

echo "Running Prisma migrations..."
cd /app
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma

echo "Migrations successfully applied."

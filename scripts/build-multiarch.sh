#!/usr/bin/env bash
set -euo pipefail

echo "=== MULTI-ARCH DOCKER BUILD VERIFICATION ==="

# Ensure builder instance exists
docker buildx create --use --name tp-builder 2>/dev/null || docker buildx use tp-builder

echo "[1/6] Building and loading API for linux/amd64..."
docker buildx build --platform linux/amd64 --load \
  -f infrastructure/docker/Dockerfile.api \
  -t threadpilot-api:amd64 .

echo "[2/6] Building and loading API for linux/arm64..."
docker buildx build --platform linux/arm64 --load \
  -f infrastructure/docker/Dockerfile.api \
  -t threadpilot-api:arm64 .

echo "[3/6] Building and loading Worker for linux/amd64..."
docker buildx build --platform linux/amd64 --load \
  -f infrastructure/docker/Dockerfile.worker \
  -t threadpilot-worker:amd64 .

echo "[4/6] Building and loading Worker for linux/arm64..."
docker buildx build --platform linux/arm64 --load \
  -f infrastructure/docker/Dockerfile.worker \
  -t threadpilot-worker:arm64 .

echo "[5/6] Building and loading Migrate for linux/amd64..."
docker buildx build --platform linux/amd64 --load \
  -f infrastructure/docker/Dockerfile.migrate \
  -t threadpilot-migrate:amd64 .

echo "[6/6] Building and loading Migrate for linux/arm64..."
docker buildx build --platform linux/arm64 --load \
  -f infrastructure/docker/Dockerfile.migrate \
  -t threadpilot-migrate:arm64 .

echo "=== MULTI-ARCH BUILD VERIFICATION COMPLETE: ALL 6 IMAGES LOADED ==="

#!/usr/bin/env bash
set -euo pipefail

# ── ThreadPilot Neon Restore & Disaster Recovery Script ──────────────────────
# Restores an encrypted age backup into a target PostgreSQL database instance.
# Usage:
#   bash scripts/restore-neon.sh <path-to-backup.sql.gz.age> <target-db-url> <path-to-age-key.txt>

if [[ $# -ne 3 ]]; then
  echo "ERROR: Expected exactly 3 arguments, got $#."
  if [[ $# -gt 3 ]]; then
    echo "HINT: Avoid unconstrained wildcards (e.g. backups/*.age) that expand to multiple files. Specify an explicit single archive path."
  fi
  echo "Usage: $0 <path-to-backup.sql.gz.age> <target-database-url> <path-to-age-identity.txt>"
  echo "Example:"
  echo "  $0 backups/threadpilot_2026-09-22.sql.gz.age postgresql://postgres:postgres@localhost:5432/sandbox_restore ~/.age/threadpilot-key.txt"
  exit 1
fi

ENCRYPTED_BACKUP="$1"
TARGET_DB_URL="$2"
AGE_IDENTITY="$3"

if [[ ! -f "$ENCRYPTED_BACKUP" ]]; then
  echo "ERROR: Encrypted backup file not found: $ENCRYPTED_BACKUP"
  exit 1
fi

if [[ ! -f "$AGE_IDENTITY" ]]; then
  echo "ERROR: Age private identity file not found: $AGE_IDENTITY"
  exit 1
fi

echo "=== ThreadPilot Neon Database Restore Operation ==="
echo "Encrypted file: $ENCRYPTED_BACKUP"
echo "Target DB:      ${TARGET_DB_URL%%@*}@..."
echo "Decryption key: $AGE_IDENTITY"

echo "[1/3] Decrypting and restoring database stream via age | gunzip | psql..."
age --decrypt -i "$AGE_IDENTITY" "$ENCRYPTED_BACKUP" | gunzip | psql "$TARGET_DB_URL"

echo "[2/3] Verifying table integrity in target database..."
RESTORED_TABLES=$(psql "$TARGET_DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
RESTORED_POSTS=$(psql "$TARGET_DB_URL" -t -c "SELECT COUNT(*) FROM scheduled_posts;")

echo "[3/3] Verification complete."
echo "  Public tables found: $(echo "$RESTORED_TABLES" | tr -d ' ')"
echo "  Scheduled posts:     $(echo "$RESTORED_POSTS" | tr -d ' ')"

echo "=== RESTORE OPERATION SUCCEEDED ==="

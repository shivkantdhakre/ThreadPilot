#!/usr/bin/env bash
set -euo pipefail

# ── ThreadPilot Daily Encrypted Neon Backup Script ───────────────────────────
# Requires: postgresql-client-16 (pg_dump), age, gzip, oci-cli
# Zero secret leakage: VM only possesses AGE_RECIPIENT_PUBKEY (public key).
# Private decryption identity is stored strictly in offsite vault.

LOG_FILE="/var/log/threadpilot/backup.log"
mkdir -p "$(dirname "$LOG_FILE")" /tmp/backups

log() {
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*" | tee -a "$LOG_FILE"
}

trap 'log "ERROR: Backup pipeline failed at line $LINENO. Local files preserved for inspection in /tmp/backups."' ERR

log "=== Starting ThreadPilot Neon DB Backup ==="

if [[ -z "${DATABASE_URL_UNPOOLED:-}" ]]; then
  log "FATAL: DATABASE_URL_UNPOOLED is not set. Direct unpooled connection is required for pg_dump."
  exit 1
fi

if [[ -z "${AGE_RECIPIENT_PUBKEY:-}" ]]; then
  log "FATAL: AGE_RECIPIENT_PUBKEY is not set. An age public key (age1...) is required."
  exit 1
fi

if [[ -z "${OCI_NAMESPACE:-}" || -z "${OCI_BACKUP_BUCKET:-}" ]]; then
  log "FATAL: OCI_NAMESPACE or OCI_BACKUP_BUCKET is not set."
  exit 1
fi

TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/backups/threadpilot_${TIMESTAMP}.sql.gz"
ENCRYPTED_FILE="/tmp/backups/threadpilot_${TIMESTAMP}.sql.gz.age"

log "[1/4] Running pg_dump via direct unpooled Neon connection..."
pg_dump "$DATABASE_URL_UNPOOLED" --no-owner --no-acl --clean --if-exists | gzip > "$BACKUP_FILE"

FILE_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null || wc -c < "$BACKUP_FILE")
log "pg_dump complete. Compressed size: ${FILE_SIZE} bytes."

log "[2/4] Encrypting with age recipient public key (zero secrets on VM disk)..."
age -r "$AGE_RECIPIENT_PUBKEY" -o "$ENCRYPTED_FILE" "$BACKUP_FILE"

log "[3/4] Uploading encrypted payload to OCI Object Storage bucket: ${OCI_BACKUP_BUCKET}..."
oci os object put \
  --namespace "$OCI_NAMESPACE" \
  --bucket-name "$OCI_BACKUP_BUCKET" \
  --file "$ENCRYPTED_FILE" \
  --name "backups/threadpilot_${TIMESTAMP}.sql.gz.age" \
  --no-overwrite false

log "[4/4] Pruning local disk artifacts..."
rm -f "$BACKUP_FILE" "$ENCRYPTED_FILE"

log "=== Backup completed successfully: backups/threadpilot_${TIMESTAMP}.sql.gz.age ==="

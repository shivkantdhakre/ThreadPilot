-- Phase 1: Create unconditionally required auxiliary tables and add columns as NULLABLE first
CREATE TABLE IF NOT EXISTS "scheduled_posts_migration_quarantine" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "scheduled_post_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "draft_id" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "container_id" TEXT,
  "publish_requested_at" TIMESTAMPTZ,
  "quarantined_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "reason" TEXT NOT NULL,
  CONSTRAINT "scheduled_posts_migration_quarantine_pkey" PRIMARY KEY ("id")
);

-- Explicitly drop legacy unique constraints and indexes so that PostgreSQL/Prisma removes them regardless of whether created as a constraint or unique index
ALTER TABLE "scheduled_posts"
  DROP CONSTRAINT IF EXISTS "scheduled_posts_draft_id_key",
  DROP CONSTRAINT IF EXISTS "scheduled_posts_idempotency_key_key";

DROP INDEX IF EXISTS "scheduled_posts_draft_id_key";
DROP INDEX IF EXISTS "scheduled_posts_idempotency_key_key";

ALTER TABLE "scheduled_posts"
  ADD COLUMN IF NOT EXISTS "social_account_id" UUID,
  ADD COLUMN IF NOT EXISTS "content_version_id" UUID,
  ADD COLUMN IF NOT EXISTS "content_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "content_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "request_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "claimed_by" TEXT,
  ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lease_until" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "attempt_id" UUID,
  ADD COLUMN IF NOT EXISTS "last_quota_checked_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "container_id" TEXT,
  ADD COLUMN IF NOT EXISTS "container_create_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "publish_requested_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "publish_attempt_id" UUID,
  ADD COLUMN IF NOT EXISTS "ambiguity_detected_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "published_observed_at" TIMESTAMPTZ;

ALTER TABLE "published_posts"
  ALTER COLUMN "published_at" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "published_observed_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Consistent nullable timestamp semantics for ThreadPost
ALTER TABLE "thread_posts"
  ALTER COLUMN "posted_at" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "posted_observed_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Phase 2: Comprehensive Preflight Checks & Integrity Validation (Fail-Closed Assertions)
DO $$
BEGIN
  -- 1. Validate all 5 new non-null columns
  IF EXISTS (
    SELECT 1 FROM "scheduled_posts"
    WHERE "social_account_id" IS NULL
       OR "content_version_id" IS NULL
       OR "content_snapshot" IS NULL
       OR "content_hash" IS NULL
       OR "request_fingerprint" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate: scheduled_posts contains legacy rows with NULL values in social_account_id, content_version_id, content_snapshot, content_hash, or request_fingerprint. Please run pre-migration data-backfill procedure first.';
  END IF;

  -- 2. Validate foreign key references
  IF EXISTS (
    SELECT 1 FROM "scheduled_posts" sp
    WHERE NOT EXISTS (SELECT 1 FROM "content_versions" cv WHERE cv.id = sp.content_version_id)
  ) THEN
    RAISE EXCEPTION 'Cannot migrate: scheduled_posts contains content_version_id values that do not exist in content_versions.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "scheduled_posts" sp
    WHERE NOT EXISTS (SELECT 1 FROM "social_accounts" sa WHERE sa.id = sp.social_account_id)
  ) THEN
    RAISE EXCEPTION 'Cannot migrate: scheduled_posts contains social_account_id values that do not exist in social_accounts.';
  END IF;

  -- 3. Fail-closed assertion for unresolved duplicate active drafts involving RECOVERY_REQUIRED
  IF EXISTS (
    SELECT 1 FROM "scheduled_posts" sp
    WHERE sp.status = 'RECOVERY_REQUIRED'
      AND EXISTS (
        SELECT 1 FROM "scheduled_posts" other
        WHERE other.draft_id = sp.draft_id
          AND other.id <> sp.id
          AND other.status NOT IN ('CANCELLED', 'EXPIRED', 'FAILED_PERMANENT', 'AUTH_REQUIRED', 'PUBLISHED')
      )
  ) THEN
    RAISE EXCEPTION 'Cannot migrate: scheduled_posts contains legacy RECOVERY_REQUIRED schedules with competing active rows. Please run packages/database/scripts/pre-migration-quarantine.ts and resolve conflicting rows before running migration.';
  END IF;

  -- 4. Preflight check for duplicate active drafts per social account before creating partial unique index
  IF EXISTS (
    SELECT "draft_id", "social_account_id", COUNT(*) FROM "scheduled_posts"
    WHERE "status" NOT IN ('CANCELLED', 'EXPIRED', 'FAILED_PERMANENT', 'AUTH_REQUIRED', 'PUBLISHED')
    GROUP BY "draft_id", "social_account_id" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot migrate: scheduled_posts contains duplicate active schedules for the same draft_id and social_account_id. Run pre-migration data-backfill procedure first.';
  END IF;
END $$;

-- Phase 3: Enforce NOT NULL constraints, Foreign Keys, and Status CHECK Constraint
ALTER TABLE "scheduled_posts"
  ALTER COLUMN "social_account_id" SET NOT NULL,
  ALTER COLUMN "content_version_id" SET NOT NULL,
  ALTER COLUMN "content_snapshot" SET NOT NULL,
  ALTER COLUMN "content_hash" SET NOT NULL,
  ALTER COLUMN "request_fingerprint" SET NOT NULL,
  ADD CONSTRAINT "check_scheduled_posts_status" CHECK ("status" IN (
    'SCHEDULED',
    'CLAIMED',
    'CREATING_CONTAINER',
    'CONTAINER_CREATED',
    'PUBLISHING',
    'PUBLISHED',
    'QUOTA_BLOCKED',
    'FAILED_RETRYABLE',
    'FAILED_PERMANENT',
    'AUTH_REQUIRED',
    'RECOVERY_REQUIRED',
    'CANCELLED',
    'EXPIRED'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_posts_social_account_id_fkey'
  ) THEN
    ALTER TABLE "scheduled_posts"
      ADD CONSTRAINT "scheduled_posts_social_account_id_fkey"
      FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_posts_content_version_id_fkey'
  ) THEN
    ALTER TABLE "scheduled_posts"
      ADD CONSTRAINT "scheduled_posts_content_version_id_fkey"
      FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT;
  END IF;
END $$;

-- Unique constraint on (workspace_id, idempotency_key)
CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_posts_workspace_id_idempotency_key_key"
  ON "scheduled_posts" ("workspace_id", "idempotency_key");

-- Partial Unique Index: Only one active schedule per draft per social account
CREATE UNIQUE INDEX IF NOT EXISTS "idx_scheduled_posts_active_draft"
  ON "scheduled_posts" ("draft_id", "social_account_id")
  WHERE "status" NOT IN ('CANCELLED', 'EXPIRED', 'FAILED_PERMANENT', 'AUTH_REQUIRED', 'PUBLISHED');

-- Multi-Account Scoped Uniqueness for PublishedPost
-- Explicitly drop legacy unique constraints and indexes to prevent retaining global uniqueness
ALTER TABLE "published_posts" DROP CONSTRAINT IF EXISTS "published_posts_draft_id_key";
ALTER TABLE "published_posts" DROP CONSTRAINT IF EXISTS "published_posts_published_version_id_key";
DROP INDEX IF EXISTS "published_posts_draft_id_key";
DROP INDEX IF EXISTS "published_posts_published_version_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "published_posts_draft_id_social_account_id_key"
  ON "published_posts" ("draft_id", "social_account_id");
CREATE UNIQUE INDEX IF NOT EXISTS "published_posts_published_version_id_social_account_id_key"
  ON "published_posts" ("published_version_id", "social_account_id");

-- CreateTable scheduled_post_dispatches with explicit named status CHECK constraint
CREATE TABLE IF NOT EXISTS "scheduled_post_dispatches" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "scheduled_post_id" UUID NOT NULL UNIQUE REFERENCES "scheduled_posts"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "dispatched_at" TIMESTAMPTZ,
  "bull_job_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "scheduled_post_dispatches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "check_scheduled_post_dispatches_status" CHECK ("status" IN ('PENDING', 'DISPATCHED', 'FAILED'))
);

-- CreateTable event_outbox with lease token & explicit named status CHECK constraint
CREATE TABLE IF NOT EXISTS "event_outbox" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "lease_until" TIMESTAMPTZ,
  "lease_token" UUID,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "processed_at" TIMESTAMPTZ,
  CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "check_event_outbox_status" CHECK ("status" IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'))
);

-- Notification Idempotency Key
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_idempotency_key_key"
  ON "notifications" ("idempotency_key");

-- Partial indexes for high-throughput queries
CREATE INDEX IF NOT EXISTS "idx_scheduled_posts_due"
  ON "scheduled_posts" ("scheduled_at")
  WHERE "status" = 'SCHEDULED';

CREATE INDEX IF NOT EXISTS "idx_scheduled_posts_stale_lease"
  ON "scheduled_posts" ("lease_until")
  WHERE "status" IN ('CLAIMED', 'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING');

CREATE INDEX IF NOT EXISTS "idx_scheduled_posts_retry_due"
  ON "scheduled_posts" ("next_retry_at")
  WHERE "status" IN ('QUOTA_BLOCKED', 'FAILED_RETRYABLE');

CREATE INDEX IF NOT EXISTS "idx_dispatches_pending"
  ON "scheduled_post_dispatches" ("created_at")
  WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS "idx_event_outbox_pending"
  ON "event_outbox" ("status", "created_at");

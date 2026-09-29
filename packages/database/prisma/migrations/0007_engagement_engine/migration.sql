-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 0007_engagement_engine
-- Scope: Phase 3 Engagement Engine & Conversational Intelligence
-- Tables: engagement_sync_states, interactions, interaction_classifications,
--         policy_decisions, reply_drafts, reply_draft_versions,
--         reply_executions, editorial_feedbacks, idempotency_records
-- Includes: CHECK constraints & Partial Unique Indexes (CAS / Lease Fencing)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InteractionStatus') THEN
    CREATE TYPE "InteractionStatus" AS ENUM (
      'NEW', 'CLASSIFYING', 'CLASSIFIED', 'DRAFTING', 'DRAFTED',
      'OUTPUT_SAFETY_EVALUATING', 'REVIEW_REQUIRED', 'APPROVED',
      'PUBLISHING', 'REPLIED', 'DISMISSED', 'NOT_REQUIRED',
      'BLOCKED', 'RECOVERY_REQUIRED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReplyExecutionStatus') THEN
    CREATE TYPE "ReplyExecutionStatus" AS ENUM (
      'CREATED', 'QUEUED', 'CLAIMED', 'QUOTA_BLOCKED',
      'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING',
      'PUBLISHED', 'RETRYABLE_FAILURE', 'AUTH_REQUIRED',
      'RECOVERY_REQUIRED', 'FAILED_PERMANENT', 'CANCELLED_BY_POLICY'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecoveryResolution') THEN
    CREATE TYPE "RecoveryResolution" AS ENUM (
      'NONE', 'PENDING', 'MATCHED', 'NOT_LANDED',
      'OPERATOR_REQUIRED', 'CONFIRMED_NOT_PUBLISHED', 'CONFIRMED_PUBLISHED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AutonomyMode') THEN
    CREATE TYPE "AutonomyMode" AS ENUM ('OFF', 'SHADOW', 'REVIEW_ONLY', 'RULES_BASED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyStage') THEN
    CREATE TYPE "PolicyStage" AS ENUM ('PRE_GENERATION', 'POST_GENERATION_SAFETY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PolicyDecisionType') THEN
    CREATE TYPE "PolicyDecisionType" AS ENUM ('AUTO_REPLY', 'REVIEW_REQUIRED', 'BLOCKED', 'NOT_APPLICABLE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InteractionIntent') THEN
    CREATE TYPE "InteractionIntent" AS ENUM (
      'QUESTION', 'AGREEMENT', 'DISAGREEMENT', 'COMPLIMENT',
      'REQUEST', 'TROLLING', 'SPAM', 'UNCLEAR'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeedbackType') THEN
    CREATE TYPE "FeedbackType" AS ENUM (
      'STYLE_CORRECTION', 'FACTUAL_CORRECTION', 'TONE_CORRECTION',
      'LENGTH_CORRECTION', 'CONTENT_CORRECTION', 'SAFETY_CORRECTION',
      'PERSONAL_PREFERENCE'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SyncTier') THEN
    CREATE TYPE "SyncTier" AS ENUM ('HOT', 'WARM', 'COLD');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SyncStatus') THEN
    CREATE TYPE "SyncStatus" AS ENUM ('IDLE', 'SYNCING', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AmbiguityType') THEN
    CREATE TYPE "AmbiguityType" AS ENUM ('CONTAINER_CREATE', 'PUBLISH', 'UNKNOWN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ResponseDecision') THEN
    CREATE TYPE "ResponseDecision" AS ENUM ('PENDING', 'REQUIRED', 'NOT_REQUIRED', 'USER_DISMISSED', 'POLICY_BLOCKED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Sentiment') THEN
    CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HideStatus') THEN
    CREATE TYPE "HideStatus" AS ENUM ('NOT_HUSHED', 'HUSHED', 'DELETED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InteractionType') THEN
    CREATE TYPE "InteractionType" AS ENUM ('REPLY', 'QUOTE', 'MENTION');
  END IF;
END $$;

-- 2. Create Tables
CREATE TABLE IF NOT EXISTS "engagement_sync_states" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "thread_post_id" UUID,
    "root_threads_post_id" TEXT NOT NULL,
    "pagination_cursor" TEXT,
    "last_seen_interaction_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "sync_tier" "SyncTier" NOT NULL DEFAULT 'HOT',
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'IDLE',
    "lease_token" UUID,
    "lease_until" TIMESTAMP(3),
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engagement_sync_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "interactions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "thread_post_id" UUID,
    "root_threads_post_id" TEXT NOT NULL,
    "parent_external_id" TEXT,
    "parent_interaction_id" UUID,
    "external_interaction_id" TEXT NOT NULL,
    "author_external_id" TEXT,
    "author_username_snapshot" TEXT NOT NULL,
    "author_display_name_snapshot" TEXT,
    "author_profile_pic_snapshot" TEXT,
    "content" TEXT NOT NULL,
    "canonical_content_hash" TEXT NOT NULL,
    "interaction_type" "InteractionType" NOT NULL DEFAULT 'REPLY',
    "is_reply_owned_by_me" BOOLEAN NOT NULL DEFAULT false,
    "reply_audience" TEXT,
    "hide_status" "HideStatus" NOT NULL DEFAULT 'NOT_HUSHED',
    "posted_at" TIMESTAMP(3) NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "permalink" TEXT,
    "status" "InteractionStatus" NOT NULL DEFAULT 'NEW',
    "response_decision" "ResponseDecision" NOT NULL DEFAULT 'PENDING',
    "priority_score" INTEGER NOT NULL DEFAULT 5,
    "dismissed_reason" TEXT,
    "active_execution_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "interaction_classifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "interaction_id" UUID NOT NULL,
    "classification_version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "intent" "InteractionIntent" NOT NULL,
    "intent_confidence" DOUBLE PRECISION NOT NULL,
    "sentiment" "Sentiment" NOT NULL,
    "priority_score" INTEGER NOT NULL,
    "toxicity_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "harassment_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "controversy_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_prompt_injection" BOOLEAN NOT NULL DEFAULT false,
    "safety_flags" TEXT[],
    "classifier_model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "decision_summary" TEXT NOT NULL,
    "classified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interaction_classifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "policy_decisions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "interaction_id" UUID NOT NULL,
    "stage" "PolicyStage" NOT NULL,
    "policy_version" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "decision" "PolicyDecisionType" NOT NULL,
    "reason_codes" TEXT[],
    "account_autonomy_mode" "AutonomyMode" NOT NULL,
    "would_auto_reply_in_live" BOOLEAN NOT NULL DEFAULT false,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reply_drafts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "interaction_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "current_version_id" UUID,
    "approved_version_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reply_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reply_draft_versions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "reply_draft_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "canonical_hash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "generation_model" TEXT,
    "prompt_version" TEXT,
    "policy_version" TEXT,
    "voice_profile_version" INTEGER,
    "retrieved_exemplar_ids" TEXT[],
    "diff_summary" TEXT,
    "regeneration_prompt" TEXT,
    "parent_version_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reply_draft_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reply_executions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "interaction_id" UUID NOT NULL,
    "reply_draft_id" UUID NOT NULL,
    "reply_draft_version_id" UUID NOT NULL,
    "status" "ReplyExecutionStatus" NOT NULL DEFAULT 'CREATED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "publish_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "attempt_id" UUID,
    "claimed_by" TEXT,
    "claimed_at" TIMESTAMP(3),
    "lease_until" TIMESTAMP(3),
    "request_fingerprint" TEXT NOT NULL,
    "policy_version" TEXT,
    "classification_version" INTEGER,
    "container_create_attempted_at" TIMESTAMP(3),
    "container_request_started_at" TIMESTAMP(3),
    "container_id" TEXT,
    "container_created_at" TIMESTAMP(3),
    "publish_requested_at" TIMESTAMP(3),
    "published_thread_post_id" TEXT,
    "published_at" TIMESTAMP(3),
    "has_external_ambiguity" BOOLEAN NOT NULL DEFAULT false,
    "ambiguity_type" "AmbiguityType",
    "ambiguity_detected_at" TIMESTAMP(3),
    "recovery_deadline_at" TIMESTAMP(3),
    "recovery_resolution" "RecoveryResolution" NOT NULL DEFAULT 'NONE',
    "last_error_code" TEXT,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMP(3),
    "quota_blocked_at" TIMESTAMP(3),
    "quota_retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reply_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "editorial_feedbacks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "voice_profile_id" UUID,
    "interaction_id" UUID NOT NULL,
    "reply_execution_id" UUID,
    "feedback_type" "FeedbackType" NOT NULL,
    "original_text" TEXT NOT NULL,
    "final_text" TEXT NOT NULL,
    "word_diff_summary" TEXT NOT NULL,
    "user_rating" INTEGER,
    "is_vector_candidate" BOOLEAN NOT NULL DEFAULT false,
    "indexed_to_vector_at" TIMESTAMP(3),
    "memory_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "editorial_feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "idempotency_records" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "status_code" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- 3. Create Standard Indexes & Uniques
CREATE INDEX IF NOT EXISTS "engagement_sync_states_sync_tier_sync_status_last_synced_at_idx" ON "engagement_sync_states"("sync_tier", "sync_status", "last_synced_at");
CREATE UNIQUE INDEX IF NOT EXISTS "engagement_sync_states_social_account_id_root_threads_post__key" ON "engagement_sync_states"("social_account_id", "root_threads_post_id");

CREATE INDEX IF NOT EXISTS "interactions_workspace_id_status_priority_score_created_at_idx" ON "interactions"("workspace_id", "status", "priority_score" DESC, "created_at" DESC);
CREATE INDEX IF NOT EXISTS "interactions_social_account_id_root_threads_post_id_posted__idx" ON "interactions"("social_account_id", "root_threads_post_id", "posted_at");
CREATE INDEX IF NOT EXISTS "interactions_parent_interaction_id_idx" ON "interactions"("parent_interaction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "interactions_social_account_id_external_interaction_id_key" ON "interactions"("social_account_id", "external_interaction_id");

CREATE INDEX IF NOT EXISTS "interaction_classifications_interaction_id_is_current_idx" ON "interaction_classifications"("interaction_id", "is_current");
CREATE INDEX IF NOT EXISTS "policy_decisions_interaction_id_stage_is_current_idx" ON "policy_decisions"("interaction_id", "stage", "is_current");

CREATE UNIQUE INDEX IF NOT EXISTS "reply_drafts_interaction_id_key" ON "reply_drafts"("interaction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "reply_drafts_current_version_id_key" ON "reply_drafts"("current_version_id");
CREATE UNIQUE INDEX IF NOT EXISTS "reply_drafts_approved_version_id_key" ON "reply_drafts"("approved_version_id");
CREATE INDEX IF NOT EXISTS "reply_drafts_workspace_id_status_idx" ON "reply_drafts"("workspace_id", "status");

CREATE INDEX IF NOT EXISTS "reply_draft_versions_reply_draft_id_created_at_idx" ON "reply_draft_versions"("reply_draft_id", "created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "reply_draft_versions_reply_draft_id_version_number_key" ON "reply_draft_versions"("reply_draft_id", "version_number");

CREATE INDEX IF NOT EXISTS "reply_executions_workspace_id_status_next_retry_at_idx" ON "reply_executions"("workspace_id", "status", "next_retry_at");
CREATE INDEX IF NOT EXISTS "reply_executions_social_account_id_status_lease_until_idx" ON "reply_executions"("social_account_id", "status", "lease_until");
CREATE INDEX IF NOT EXISTS "reply_executions_interaction_id_status_idx" ON "reply_executions"("interaction_id", "status");

CREATE INDEX IF NOT EXISTS "editorial_feedbacks_workspace_id_voice_profile_id_feedback__idx" ON "editorial_feedbacks"("workspace_id", "voice_profile_id", "feedback_type", "is_vector_candidate");

CREATE INDEX IF NOT EXISTS "idempotency_records_workspace_id_key_created_at_idx" ON "idempotency_records"("workspace_id", "key", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_workspace_id_key_method_endpoint_key" ON "idempotency_records"("workspace_id", "key", "method", "endpoint");

-- 4. Foreign Key Constraints
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagement_sync_states_workspace_id_fkey') THEN
    ALTER TABLE "engagement_sync_states" ADD CONSTRAINT "engagement_sync_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagement_sync_states_social_account_id_fkey') THEN
    ALTER TABLE "engagement_sync_states" ADD CONSTRAINT "engagement_sync_states_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engagement_sync_states_thread_post_id_fkey') THEN
    ALTER TABLE "engagement_sync_states" ADD CONSTRAINT "engagement_sync_states_thread_post_id_fkey" FOREIGN KEY ("thread_post_id") REFERENCES "thread_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interactions_workspace_id_fkey') THEN
    ALTER TABLE "interactions" ADD CONSTRAINT "interactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interactions_social_account_id_fkey') THEN
    ALTER TABLE "interactions" ADD CONSTRAINT "interactions_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interactions_thread_post_id_fkey') THEN
    ALTER TABLE "interactions" ADD CONSTRAINT "interactions_thread_post_id_fkey" FOREIGN KEY ("thread_post_id") REFERENCES "thread_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interactions_parent_interaction_id_fkey') THEN
    ALTER TABLE "interactions" ADD CONSTRAINT "interactions_parent_interaction_id_fkey" FOREIGN KEY ("parent_interaction_id") REFERENCES "interactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interaction_classifications_interaction_id_fkey') THEN
    ALTER TABLE "interaction_classifications" ADD CONSTRAINT "interaction_classifications_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_decisions_interaction_id_fkey') THEN
    ALTER TABLE "policy_decisions" ADD CONSTRAINT "policy_decisions_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reply_drafts_workspace_id_fkey') THEN
    ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reply_drafts_interaction_id_fkey') THEN
    ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reply_drafts_current_version_id_fkey') THEN
    ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "reply_draft_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reply_drafts_approved_version_id_fkey') THEN
    ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_approved_version_id_fkey" FOREIGN KEY ("approved_version_id") REFERENCES "reply_draft_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reply_draft_versions_reply_draft_id_fkey') THEN
    ALTER TABLE "reply_draft_versions" ADD CONSTRAINT "reply_draft_versions_reply_draft_id_fkey" FOREIGN KEY ("reply_draft_id") REFERENCES "reply_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reply_executions_workspace_id_fkey') THEN
    ALTER TABLE "reply_executions" ADD CONSTRAINT "reply_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reply_executions_social_account_id_fkey') THEN
    ALTER TABLE "reply_executions" ADD CONSTRAINT "reply_executions_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reply_executions_interaction_id_fkey') THEN
    ALTER TABLE "reply_executions" ADD CONSTRAINT "reply_executions_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reply_executions_reply_draft_id_fkey') THEN
    ALTER TABLE "reply_executions" ADD CONSTRAINT "reply_executions_reply_draft_id_fkey" FOREIGN KEY ("reply_draft_id") REFERENCES "reply_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reply_executions_reply_draft_version_id_fkey') THEN
    ALTER TABLE "reply_executions" ADD CONSTRAINT "reply_executions_reply_draft_version_id_fkey" FOREIGN KEY ("reply_draft_version_id") REFERENCES "reply_draft_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'editorial_feedbacks_workspace_id_fkey') THEN
    ALTER TABLE "editorial_feedbacks" ADD CONSTRAINT "editorial_feedbacks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'editorial_feedbacks_social_account_id_fkey') THEN
    ALTER TABLE "editorial_feedbacks" ADD CONSTRAINT "editorial_feedbacks_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'editorial_feedbacks_interaction_id_fkey') THEN
    ALTER TABLE "editorial_feedbacks" ADD CONSTRAINT "editorial_feedbacks_interaction_id_fkey" FOREIGN KEY ("interaction_id") REFERENCES "interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'editorial_feedbacks_reply_execution_id_fkey') THEN
    ALTER TABLE "editorial_feedbacks" ADD CONSTRAINT "editorial_feedbacks_reply_execution_id_fkey" FOREIGN KEY ("reply_execution_id") REFERENCES "reply_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idempotency_records_workspace_id_fkey') THEN
    ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Business CHECK Constraints (Section 3.3)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_reply_body_non_empty') THEN
    ALTER TABLE "reply_draft_versions" ADD CONSTRAINT "chk_reply_body_non_empty" CHECK (length(trim("body")) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_interaction_priority') THEN
    ALTER TABLE "interactions" ADD CONSTRAINT "chk_interaction_priority" CHECK ("priority_score" BETWEEN 1 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_intent_confidence') THEN
    ALTER TABLE "interaction_classifications" ADD CONSTRAINT "chk_intent_confidence" CHECK ("intent_confidence" BETWEEN 0.0 AND 1.0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_class_priority') THEN
    ALTER TABLE "interaction_classifications" ADD CONSTRAINT "chk_class_priority" CHECK ("priority_score" BETWEEN 1 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_toxicity_score') THEN
    ALTER TABLE "interaction_classifications" ADD CONSTRAINT "chk_toxicity_score" CHECK ("toxicity_score" BETWEEN 0.0 AND 1.0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_harassment_score') THEN
    ALTER TABLE "interaction_classifications" ADD CONSTRAINT "chk_harassment_score" CHECK ("harassment_score" BETWEEN 0.0 AND 1.0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_controversy_score') THEN
    ALTER TABLE "interaction_classifications" ADD CONSTRAINT "chk_controversy_score" CHECK ("controversy_score" BETWEEN 0.0 AND 1.0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_rating') THEN
    ALTER TABLE "editorial_feedbacks" ADD CONSTRAINT "chk_user_rating" CHECK ("user_rating" IS NULL OR "user_rating" IN (-1, 1));
  END IF;
END $$;

-- 6. Partial Unique Indexes (Section 3.3)
-- At most ONE active execution per interaction (includes CREATED)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_active_reply_execution" 
ON "reply_executions" ("interaction_id") 
WHERE "status" IN ('CREATED', 'QUEUED', 'CLAIMED', 'QUOTA_BLOCKED', 'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING', 'RECOVERY_REQUIRED');

-- At most ONE active sync worker per root post
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_active_sync_lease"
ON "engagement_sync_states" ("social_account_id", "root_threads_post_id")
WHERE "sync_status" = 'SYNCING';

-- Guarantee exactly one current classification and one current policy decision per stage
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_current_classification"
ON "interaction_classifications" ("interaction_id")
WHERE "is_current" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_current_policy"
ON "policy_decisions" ("interaction_id", "stage")
WHERE "is_current" = true;

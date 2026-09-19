-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "replaced_by_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'threads',
    "external_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT,
    "profile_url" TEXT,
    "is_connected" BOOLEAN NOT NULL DEFAULT true,
    "connected_at" TIMESTAMP(3) NOT NULL,
    "disconnected_at" TIMESTAMP(3),

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "social_account_id" UUID NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT,
    "scopes" TEXT[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "last_refreshed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_posts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "social_account_id" UUID NOT NULL,
    "threads_post_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'TEXT',
    "posted_at" TIMESTAMP(3) NOT NULL,
    "is_ours" BOOLEAN NOT NULL DEFAULT true,
    "sourceType" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "external_post_id" UUID,
    "published_post_id" UUID,

    CONSTRAINT "thread_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_posts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "social_account_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "normalized_at" TIMESTAMP(3),
    "thread_post_id" UUID,

    CONSTRAINT "external_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "bio" TEXT,
    "profession" TEXT,
    "expertise" TEXT[],
    "positioning" TEXT,
    "avg_post_length_chars" DOUBLE PRECISION,
    "avg_sentence_length_words" DOUBLE PRECISION,
    "question_frequency" DOUBLE PRECISION,
    "emoji_frequency" DOUBLE PRECISION,
    "first_person_frequency" DOUBLE PRECISION,
    "technical_vocab_score" DOUBLE PRECISION,
    "list_usage_frequency" DOUBLE PRECISION,
    "contrary_hook_frequency" DOUBLE PRECISION,
    "profile_version" INTEGER NOT NULL DEFAULT 1,
    "style_extracted_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_profile_snapshots" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_profile_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "preferredTopics" TEXT[],
    "excludedTopics" TEXT[],
    "preferredFormats" TEXT[],
    "posting_frequency" INTEGER,
    "preferred_timezone" TEXT NOT NULL DEFAULT 'UTC',
    "autonomy_publishing" TEXT NOT NULL DEFAULT 'MANUAL',
    "autonomy_replies" TEXT NOT NULL DEFAULT 'MANUAL',
    "autonomy_research" TEXT NOT NULL DEFAULT 'MANUAL',
    "autonomy_content_gen" TEXT NOT NULL DEFAULT 'MANUAL',
    "automation_paused" BOOLEAN NOT NULL DEFAULT false,
    "publishing_paused" BOOLEAN NOT NULL DEFAULT false,
    "replies_paused" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_examples" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "memory_item_id" UUID NOT NULL,
    "source_post_id" UUID,
    "text" TEXT NOT NULL,
    "topic" TEXT,
    "format" TEXT,
    "style_features" JSONB NOT NULL,
    "quality" DOUBLE PRECISION,
    "user_rating" INTEGER,

    CONSTRAINT "style_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "source_id" TEXT,
    "embedding_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_ideas" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "sources" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_drafts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "idea_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "generated_by" TEXT,
    "prompt_version" TEXT,
    "profile_version" INTEGER,
    "research_sources" TEXT[],
    "retrieved_memory_ids" TEXT[],
    "retrieval_snapshot_hash" TEXT,
    "edited_by_user" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_versions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "draft_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "hook" TEXT,
    "cta" TEXT,
    "edited_by" TEXT NOT NULL,
    "diff_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_posts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "idempotency_key" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error_msg" TEXT,
    "bull_job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_posts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "published_version_id" UUID NOT NULL,
    "threads_post_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "published_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_records" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "bull_job_id" TEXT,
    "request_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progress_message" TEXT,
    "result_entity_type" TEXT,
    "result_entity_id" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_rate_limits" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "social_account_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "limit_value" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "remaining" INTEGER NOT NULL,
    "reset_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "job_record_id" UUID,
    "workflow_id" TEXT NOT NULL,
    "workflow_version" TEXT NOT NULL,
    "parent_run_id" UUID,
    "status" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "profile_version" INTEGER,
    "input_hash" TEXT NOT NULL,
    "output_hash" TEXT,
    "total_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "run_id" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "result" TEXT NOT NULL,
    "user_approval" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "agent_action_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "estimated_cost_usd" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "agent" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "input" JSONB,
    "output" JSONB,
    "result" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "social_accounts_workspace_id_idx" ON "social_accounts"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_workspace_id_platform_external_id_key" ON "social_accounts"("workspace_id", "platform", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_social_account_id_key" ON "oauth_tokens"("social_account_id");

-- CreateIndex
CREATE INDEX "thread_posts_social_account_id_posted_at_idx" ON "thread_posts"("social_account_id", "posted_at");

-- CreateIndex
CREATE UNIQUE INDEX "thread_posts_social_account_id_threads_post_id_key" ON "thread_posts"("social_account_id", "threads_post_id");

-- CreateIndex
CREATE INDEX "external_posts_social_account_id_fetched_at_idx" ON "external_posts"("social_account_id", "fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "external_posts_social_account_id_external_id_key" ON "external_posts"("social_account_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_workspace_id_key" ON "user_profiles"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "style_profile_snapshots_workspace_id_version_key" ON "style_profile_snapshots"("workspace_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_workspace_id_key" ON "user_preferences"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "style_examples_memory_item_id_key" ON "style_examples"("memory_item_id");

-- CreateIndex
CREATE INDEX "style_examples_workspace_id_topic_idx" ON "style_examples"("workspace_id", "topic");

-- CreateIndex
CREATE INDEX "memory_items_workspace_id_type_idx" ON "memory_items"("workspace_id", "type");

-- CreateIndex
CREATE INDEX "content_ideas_workspace_id_idx" ON "content_ideas"("workspace_id");

-- CreateIndex
CREATE INDEX "content_drafts_workspace_id_status_idx" ON "content_drafts"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "content_versions_draft_id_idx" ON "content_versions"("draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_draft_id_version_key" ON "content_versions"("draft_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_posts_draft_id_key" ON "scheduled_posts"("draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_posts_idempotency_key_key" ON "scheduled_posts"("idempotency_key");

-- CreateIndex
CREATE INDEX "scheduled_posts_workspace_id_status_scheduled_at_idx" ON "scheduled_posts"("workspace_id", "status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "published_posts_draft_id_key" ON "published_posts"("draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "published_posts_published_version_id_key" ON "published_posts"("published_version_id");

-- CreateIndex
CREATE INDEX "published_posts_workspace_id_idx" ON "published_posts"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "published_posts_social_account_id_threads_post_id_key" ON "published_posts"("social_account_id", "threads_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_records_request_id_key" ON "job_records"("request_id");

-- CreateIndex
CREATE INDEX "job_records_workspace_id_type_status_idx" ON "job_records"("workspace_id", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "platform_rate_limits_social_account_id_category_key" ON "platform_rate_limits"("social_account_id", "category");

-- CreateIndex
CREATE INDEX "agent_runs_workspace_id_workflow_id_started_at_idx" ON "agent_runs"("workspace_id", "workflow_id", "started_at");

-- CreateIndex
CREATE INDEX "agent_actions_run_id_idx" ON "agent_actions"("run_id");

-- CreateIndex
CREATE INDEX "ai_usage_workspace_id_timestamp_idx" ON "ai_usage"("workspace_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_workspace_id_read_created_at_idx" ON "notifications"("workspace_id", "read", "created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_posts" ADD CONSTRAINT "thread_posts_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_posts" ADD CONSTRAINT "external_posts_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_profile_snapshots" ADD CONSTRAINT "style_profile_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_examples" ADD CONSTRAINT "style_examples_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_examples" ADD CONSTRAINT "style_examples_memory_item_id_fkey" FOREIGN KEY ("memory_item_id") REFERENCES "memory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "content_ideas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "content_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "content_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_posts" ADD CONSTRAINT "published_posts_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_posts" ADD CONSTRAINT "published_posts_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "content_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_posts" ADD CONSTRAINT "published_posts_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_records" ADD CONSTRAINT "job_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_rate_limits" ADD CONSTRAINT "platform_rate_limits_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_agent_action_id_fkey" FOREIGN KEY ("agent_action_id") REFERENCES "agent_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


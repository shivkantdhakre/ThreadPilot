-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 0009_autonomous_operator
-- Scope: Phase 5 Autonomous Operation, Safety Gate, Rules Engine, Experimentation & Adaptation Loop
-- Tables:
--   - workspace_members
--   - scheduled_post_quotas
--   - automation_rules
--   - rule_execution_budgets
--   - rule_execution_logs
--   - rule_action_executions
--   - safety_policy_configs
--   - pre_publish_safety_audits
--   - safety_override_logs
--   - experiments
--   - experiment_variants
--   - experiment_block_allocations
--   - experiment_post_assignments
--   - profile_adaptation_proposals
--   - autonomous_operator_configs
--   - autonomous_operator_leases
--   - autonomous_operator_runs
--   - autonomous_operator_candidates
-- Alterations:
--   - scheduled_posts: add uq_scheduled_post_account_slot, uq_scheduled_post_tenant
--   - learned_performance_profiles: add profile_version
--   - EvidenceGrade: add ACTION_PROPOSED
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RuleTriggerType') THEN
    CREATE TYPE "RuleTriggerType" AS ENUM (
      'POST_PUBLISHED', 'METRIC_OBSERVED', 'INSIGHT_GENERATED',
      'SCHEDULE_TIME_REACHED', 'SAFETY_AUDIT_FAILED', 'MANUAL_TRIGGER'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RuleExecutionStatus') THEN
    CREATE TYPE "RuleExecutionStatus" AS ENUM (
      'CLAIMED', 'EXECUTING', 'EXECUTED', 'SKIPPED_CONDITION', 'SKIPPED_BUDGET', 'FAILED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SafetyAuditStatus') THEN
    CREATE TYPE "SafetyAuditStatus" AS ENUM (
      'PENDING', 'RUNNING', 'PASSED', 'FLAGGED_APPROVAL_REQUIRED',
      'BLOCKED_POLICY_VIOLATION', 'EXPIRED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SafetyWallType') THEN
    CREATE TYPE "SafetyWallType" AS ENUM (
      'CLAIM_HALLUCINATION', 'TOXICITY_BRAND_SAFETY', 'POLICY_COMPLIANCE', 'SENSITIVE_TOPIC_RATE'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OverrideStatus') THEN
    CREATE TYPE "OverrideStatus" AS ENUM (
      'OVERRIDE_REQUESTED', 'OVERRIDDEN', 'REJECTED', 'EXPIRED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExperimentStatus') THEN
    CREATE TYPE "ExperimentStatus" AS ENUM (
      'DRAFT', 'ACTIVE', 'COLLECTING_DATA', 'ANALYSIS_LOCKED', 'CONCLUDED', 'ARCHIVED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExperimentMetric') THEN
    CREATE TYPE "ExperimentMetric" AS ENUM (
      'ENGAGEMENT_RATE_BY_VIEWS', 'LIKE_RATE', 'REPLY_RATE', 'REPOST_RATE', 'TOTAL_VIEWS'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExperimentEffectType') THEN
    CREATE TYPE "ExperimentEffectType" AS ENUM ('RELATIVE', 'ABSOLUTE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OptimizationDirection') THEN
    CREATE TYPE "OptimizationDirection" AS ENUM ('MAXIMIZE', 'MINIMIZE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdaptationProposalStatus') THEN
    CREATE TYPE "AdaptationProposalStatus" AS ENUM (
      'PENDING_REVIEW', 'APPLIED', 'REJECTED', 'SUPERSEDED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AutonomyLevel') THEN
    CREATE TYPE "AutonomyLevel" AS ENUM (
      'MANUAL', 'SEMI_AUTONOMOUS', 'FULL_AUTONOMOUS', 'PAUSED'
    );
  END IF;
END $$;

ALTER TYPE "EvidenceGrade" ADD VALUE IF NOT EXISTS 'ACTION_PROPOSED';

-- 2. Alter existing tables
ALTER TABLE "scheduled_posts"
  ADD CONSTRAINT "uq_scheduled_post_account_slot" UNIQUE ("social_account_id", "scheduled_at"),
  ADD CONSTRAINT "uq_scheduled_post_tenant" UNIQUE ("id", "workspace_id", "social_account_id");

ALTER TABLE "learned_performance_profiles"
  ADD COLUMN IF NOT EXISTS "profile_version" INTEGER NOT NULL DEFAULT 1;

-- 3. Create workspace_members
CREATE TABLE IF NOT EXISTS "workspace_members" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_workspace_member" UNIQUE ("workspace_id", "user_id"),
  CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "workspace_members_user_id_idx" ON "workspace_members"("user_id");

-- 4. Create scheduled_post_quotas
CREATE TABLE IF NOT EXISTS "scheduled_post_quotas" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "week_window" TEXT NOT NULL,
  "max_weekly_posts" INTEGER NOT NULL,
  "claimed_posts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scheduled_post_quotas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_scheduled_post_quota" UNIQUE ("social_account_id", "week_window"),
  CONSTRAINT "uq_scheduled_post_quota_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "scheduled_post_quotas_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "scheduled_post_quotas_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "scheduled_post_quotas_social_account_id_week_window_idx" ON "scheduled_post_quotas"("social_account_id", "week_window");

-- 5. Create automation_rules
CREATE TABLE IF NOT EXISTS "automation_rules" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "trigger_type" "RuleTriggerType" NOT NULL,
  "ast_conditions" JSONB NOT NULL,
  "actions" JSONB NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "max_daily_executions" INTEGER NOT NULL DEFAULT 10,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_automation_rule_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "automation_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "automation_rules_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "automation_rules_social_account_id_trigger_type_is_active_idx" ON "automation_rules"("social_account_id", "trigger_type", "is_active");
CREATE INDEX IF NOT EXISTS "automation_rules_workspace_id_is_active_idx" ON "automation_rules"("workspace_id", "is_active");

-- 6. Create rule_execution_budgets
CREATE TABLE IF NOT EXISTS "rule_execution_budgets" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "execution_window" TEXT NOT NULL,
  "max_executions" INTEGER NOT NULL,
  "claimed_executions" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rule_execution_budgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_rule_budget_window" UNIQUE ("rule_id", "execution_window"),
  CONSTRAINT "uq_rule_budget_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "rule_execution_budgets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "rule_execution_budgets_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "rule_execution_budgets_rule_id_workspace_id_social_account_id_fkey" FOREIGN KEY ("rule_id", "workspace_id", "social_account_id") REFERENCES "automation_rules"("id", "workspace_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "rule_execution_budgets_social_account_id_execution_window_idx" ON "rule_execution_budgets"("social_account_id", "execution_window");

-- 7. Create rule_execution_logs
CREATE TABLE IF NOT EXISTS "rule_execution_logs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "execution_window" TEXT NOT NULL,
  "execution_key" TEXT NOT NULL,
  "status" "RuleExecutionStatus" NOT NULL DEFAULT 'CLAIMED',
  "lease_token" TEXT,
  "lease_until" TIMESTAMP(3),
  "evaluated_context" JSONB NOT NULL,
  "action_results" JSONB,
  "error_message" TEXT,
  "executed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rule_execution_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_rule_execution_log_idempotency" UNIQUE ("rule_id", "execution_window", "execution_key"),
  CONSTRAINT "uq_rule_execution_log_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "rule_execution_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "rule_execution_logs_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "rule_execution_logs_rule_id_workspace_id_social_account_id_fkey" FOREIGN KEY ("rule_id", "workspace_id", "social_account_id") REFERENCES "automation_rules"("id", "workspace_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "rule_execution_logs_social_account_id_execution_window_st_idx" ON "rule_execution_logs"("social_account_id", "execution_window", "status");

-- 8. Create rule_action_executions
CREATE TABLE IF NOT EXISTS "rule_action_executions" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "log_id" UUID NOT NULL,
  "action_index" INTEGER NOT NULL,
  "action_type" TEXT NOT NULL,
  "action_execution_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'EXECUTED',
  "result_payload" JSONB,
  "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rule_action_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rule_action_executions_action_execution_key_key" UNIQUE ("action_execution_key"),
  CONSTRAINT "uq_rule_action_execution_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "rule_action_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "rule_action_executions_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "rule_action_executions_log_id_workspace_id_social_account_id_fkey" FOREIGN KEY ("log_id", "workspace_id", "social_account_id") REFERENCES "rule_execution_logs"("id", "workspace_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 9. Create safety_policy_configs
CREATE TABLE IF NOT EXISTS "safety_policy_configs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "policy_version" TEXT NOT NULL,
  "hallucination_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
  "toxicity_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  "prohibited_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "flagged_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "require_claim_sources" BOOLEAN NOT NULL DEFAULT true,
  "max_consecutive_claims" INTEGER NOT NULL DEFAULT 3,
  "audit_ttl_seconds" INTEGER NOT NULL DEFAULT 86400,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "safety_policy_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_safety_policy_version" UNIQUE ("social_account_id", "policy_version"),
  CONSTRAINT "uq_safety_policy_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "safety_policy_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "safety_policy_configs_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 10. Create pre_publish_safety_audits
CREATE TABLE IF NOT EXISTS "pre_publish_safety_audits" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "draft_id" UUID NOT NULL,
  "content_version_id" UUID NOT NULL,
  "content_hash" TEXT NOT NULL,
  "status" "SafetyAuditStatus" NOT NULL DEFAULT 'PENDING',
  "policy_version" TEXT NOT NULL,
  "evaluator_version" TEXT NOT NULL DEFAULT '1.1.0',
  "model_version" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  "hallucination_score" DOUBLE PRECISION,
  "toxicity_score" DOUBLE PRECISION,
  "failed_walls" "SafetyWallType"[] DEFAULT ARRAY[]::"SafetyWallType"[],
  "audit_details" JSONB NOT NULL,
  "evaluated_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pre_publish_safety_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_safety_audit_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "uq_safety_audit_version" UNIQUE ("content_version_id", "policy_version"),
  CONSTRAINT "pre_publish_safety_audits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pre_publish_safety_audits_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pre_publish_safety_audits_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "content_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pre_publish_safety_audits_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pre_publish_safety_audits_draft_id_status_idx" ON "pre_publish_safety_audits"("draft_id", "status");
CREATE INDEX IF NOT EXISTS "pre_publish_safety_audits_workspace_id_status_expires_at_idx" ON "pre_publish_safety_audits"("workspace_id", "status", "expires_at");

-- 11. Create safety_override_logs
CREATE TABLE IF NOT EXISTS "safety_override_logs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "audit_id" UUID NOT NULL,
  "status" "OverrideStatus" NOT NULL DEFAULT 'OVERRIDE_REQUESTED',
  "actor_id" UUID NOT NULL,
  "actor_role_snapshot" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "risk_acknowledged" BOOLEAN NOT NULL,
  "one_time_token" UUID NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "consumed_by" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "overridden_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "safety_override_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "safety_override_logs_audit_id_key" UNIQUE ("audit_id"),
  CONSTRAINT "safety_override_logs_one_time_token_key" UNIQUE ("one_time_token"),
  CONSTRAINT "uq_safety_override_audit_tenant" UNIQUE ("audit_id", "workspace_id", "social_account_id"),
  CONSTRAINT "uq_safety_override_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "safety_override_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "safety_override_logs_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "safety_override_logs_audit_id_workspace_id_social_account_id_fkey" FOREIGN KEY ("audit_id", "workspace_id", "social_account_id") REFERENCES "pre_publish_safety_audits"("id", "workspace_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "safety_override_logs_workspace_id_actor_id_fkey" FOREIGN KEY ("workspace_id", "actor_id") REFERENCES "workspace_members"("workspace_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 12. Create experiments
CREATE TABLE IF NOT EXISTS "experiments" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "hypothesis" TEXT NOT NULL,
  "dimension" "AggregationDimension" NOT NULL,
  "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
  "primary_metric" "ExperimentMetric" NOT NULL DEFAULT 'ENGAGEMENT_RATE_BY_VIEWS',
  "effect_type" "ExperimentEffectType" NOT NULL DEFAULT 'RELATIVE',
  "target_observation_slot" "ObservationSlot" NOT NULL DEFAULT 'T_24H',
  "direction" "OptimizationDirection" NOT NULL DEFAULT 'MAXIMIZE',
  "min_practical_effect" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
  "min_sample_size_per_arm" INTEGER NOT NULL DEFAULT 10,
  "duration_days" INTEGER NOT NULL DEFAULT 14,
  "randomization_seed" TEXT NOT NULL,
  "eligible_arm_sample_size" INTEGER NOT NULL DEFAULT 0,
  "mature_arm_sample_size" INTEGER NOT NULL DEFAULT 0,
  "activated_at" TIMESTAMP(3),
  "enrollment_end_at" TIMESTAMP(3),
  "planned_analysis_at" TIMESTAMP(3),
  "canonical_analysis_as_of" TIMESTAMP(3),
  "analysis_cutoff" TIMESTAMP(3),
  "analysis_locked_at" TIMESTAMP(3),
  "hypothesis_family_key" TEXT,
  "hypothesis_family_revision" INTEGER,
  "hypothesis_family_size" INTEGER,
  "welch_t_statistic" DOUBLE PRECISION,
  "welch_p_value" DOUBLE PRECISION,
  "cohens_d" DOUBLE PRECISION,
  "ci95_lower" DOUBLE PRECISION,
  "ci95_upper" DOUBLE PRECISION,
  "q_value" DOUBLE PRECISION,
  "passes_fdr" BOOLEAN,
  "observed_relative_lift" DOUBLE PRECISION,
  "winning_variant_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "experiments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_experiment_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "experiments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "experiments_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "experiments_social_account_id_status_idx" ON "experiments"("social_account_id", "status");
CREATE INDEX IF NOT EXISTS "experiments_workspace_id_dimension_status_idx" ON "experiments"("workspace_id", "dimension", "status");

-- 13. Create experiment_variants
CREATE TABLE IF NOT EXISTS "experiment_variants" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "experiment_id" UUID NOT NULL,
  "variant_key" TEXT NOT NULL,
  "is_control" BOOLEAN NOT NULL DEFAULT false,
  "dimension_value" TEXT NOT NULL,
  "sample_count" INTEGER NOT NULL DEFAULT 0,
  "mean_primary_metric" DOUBLE PRECISION,
  "std_dev_primary_metric" DOUBLE PRECISION,

  CONSTRAINT "experiment_variants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_experiment_variant_key" UNIQUE ("experiment_id", "variant_key"),
  CONSTRAINT "uq_experiment_variant_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "experiment_variants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "experiment_variants_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "experiment_variants_experiment_id_workspace_id_social_acc_fkey" FOREIGN KEY ("experiment_id", "workspace_id", "social_account_id") REFERENCES "experiments"("id", "workspace_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "experiment_variants_social_account_id_experiment_id_idx" ON "experiment_variants"("social_account_id", "experiment_id");

-- Add foreign key from experiments.winning_variant_id -> experiment_variants
ALTER TABLE "experiments"
  ADD CONSTRAINT "experiments_winning_variant_fkey" FOREIGN KEY ("winning_variant_id", "workspace_id", "social_account_id") REFERENCES "experiment_variants"("id", "workspace_id", "social_account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 14. Create experiment_block_allocations
CREATE TABLE IF NOT EXISTS "experiment_block_allocations" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "experiment_id" UUID NOT NULL,
  "temporal_block_key" TEXT NOT NULL,
  "block_size" INTEGER NOT NULL DEFAULT 4,
  "current_block_number" INTEGER NOT NULL DEFAULT 0,
  "permuted_sequence" TEXT[] NOT NULL,
  "sequence_index_in_block" INTEGER NOT NULL DEFAULT 0,
  "total_assigned_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "experiment_block_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_experiment_block_allocation" UNIQUE ("experiment_id", "temporal_block_key"),
  CONSTRAINT "uq_block_allocation_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "experiment_block_allocations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "experiment_block_allocations_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "experiment_block_allocations_experiment_id_workspace_id_s_fkey" FOREIGN KEY ("experiment_id", "workspace_id", "social_account_id") REFERENCES "experiments"("id", "workspace_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 15. Create experiment_post_assignments
CREATE TABLE IF NOT EXISTS "experiment_post_assignments" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "experiment_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "temporal_block_key" TEXT NOT NULL,
  "block_number" INTEGER NOT NULL,
  "sequence_position" INTEGER NOT NULL,
  "draft_id" UUID NOT NULL,
  "scheduled_post_id" UUID,
  "published_post_id" UUID,
  "post_metric_id" UUID,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "experiment_post_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "experiment_post_assignments_draft_id_key" UNIQUE ("draft_id"),
  CONSTRAINT "experiment_post_assignments_scheduled_post_id_key" UNIQUE ("scheduled_post_id"),
  CONSTRAINT "experiment_post_assignments_published_post_id_key" UNIQUE ("published_post_id"),
  CONSTRAINT "experiment_post_assignments_post_metric_id_key" UNIQUE ("post_metric_id"),
  CONSTRAINT "uq_experiment_post_assignment_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "experiment_post_assignments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "experiment_post_assignments_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "experiment_post_assignments_experiment_id_workspace_id_s_fkey" FOREIGN KEY ("experiment_id", "workspace_id", "social_account_id") REFERENCES "experiments"("id", "workspace_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "experiment_post_assignments_variant_id_workspace_id_socia_fkey" FOREIGN KEY ("variant_id", "workspace_id", "social_account_id") REFERENCES "experiment_variants"("id", "workspace_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "experiment_post_assignments_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "content_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "experiment_post_assignments_scheduled_post_id_workspace_fkey" FOREIGN KEY ("scheduled_post_id", "workspace_id", "social_account_id") REFERENCES "scheduled_posts"("id", "workspace_id", "social_account_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "experiment_post_assignments_published_post_id_workspace_fkey" FOREIGN KEY ("published_post_id", "workspace_id", "social_account_id") REFERENCES "published_posts"("id", "workspace_id", "social_account_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "experiment_post_assignments_post_metric_id_workspace_id_fkey" FOREIGN KEY ("post_metric_id", "workspace_id", "social_account_id") REFERENCES "post_metrics"("id", "workspace_id", "social_account_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "experiment_post_assignments_experiment_id_variant_id_idx" ON "experiment_post_assignments"("experiment_id", "variant_id");

-- 16. Create profile_adaptation_proposals
CREATE TABLE IF NOT EXISTS "profile_adaptation_proposals" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "experiment_id" UUID,
  "action_execution_key" TEXT,
  "source_profile_version" INTEGER NOT NULL,
  "dimension" "AggregationDimension" NOT NULL,
  "dimension_value" TEXT NOT NULL,
  "observed_raw_lift" DOUBLE PRECISION NOT NULL,
  "winsorized_lift" DOUBLE PRECISION NOT NULL,
  "prior_weight" DOUBLE PRECISION NOT NULL,
  "proposed_weight" DOUBLE PRECISION NOT NULL,
  "sample_evidence_size" INTEGER NOT NULL,
  "evidence_grade" "EvidenceGrade" NOT NULL,
  "status" "AdaptationProposalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "applied_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "profile_adaptation_proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "profile_adaptation_proposals_action_execution_key_key" UNIQUE ("action_execution_key"),
  CONSTRAINT "uq_adaptation_proposal_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "profile_adaptation_proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "profile_adaptation_proposals_social_account_id_workspace_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "profile_adaptation_proposals_profile_id_workspace_id_soci_fkey" FOREIGN KEY ("profile_id", "workspace_id", "social_account_id") REFERENCES "learned_performance_profiles"("id", "workspace_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "profile_adaptation_proposals_experiment_id_workspace_id__fkey" FOREIGN KEY ("experiment_id", "workspace_id", "social_account_id") REFERENCES "experiments"("id", "workspace_id", "social_account_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "profile_adaptation_proposals_social_account_id_status_idx" ON "profile_adaptation_proposals"("social_account_id", "status");

-- 17. Create autonomous_operator_configs
CREATE TABLE IF NOT EXISTS "autonomous_operator_configs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "autonomy_level" "AutonomyLevel" NOT NULL DEFAULT 'SEMI_AUTONOMOUS',
  "max_weekly_posts" INTEGER NOT NULL DEFAULT 14,
  "min_hours_between_posts" INTEGER NOT NULL DEFAULT 4,
  "target_posting_hours" INTEGER[] DEFAULT ARRAY[9, 12, 17, 20]::INTEGER[],
  "planning_horizon_days" INTEGER NOT NULL DEFAULT 7,
  "enable_experiments" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "autonomous_operator_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "autonomous_operator_configs_social_account_id_key" UNIQUE ("social_account_id"),
  CONSTRAINT "uq_operator_config_account_workspace" UNIQUE ("social_account_id", "workspace_id"),
  CONSTRAINT "uq_operator_config_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "autonomous_operator_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "autonomous_operator_configs_social_account_id_workspace__fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 18. Create autonomous_operator_leases
CREATE TABLE IF NOT EXISTS "autonomous_operator_leases" (
  "social_account_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "lease_token" TEXT,
  "lease_until" TIMESTAMP(3),
  "cycle_id" UUID,
  "heartbeat_at" TIMESTAMP(3),

  CONSTRAINT "autonomous_operator_leases_pkey" PRIMARY KEY ("social_account_id"),
  CONSTRAINT "uq_operator_lease_tenant" UNIQUE ("social_account_id", "workspace_id"),
  CONSTRAINT "autonomous_operator_leases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "autonomous_operator_leases_social_account_id_workspace_i_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 19. Create autonomous_operator_runs
CREATE TABLE IF NOT EXISTS "autonomous_operator_runs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "cycle_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "candidates_evaluated" INTEGER NOT NULL DEFAULT 0,
  "candidates_scheduled" INTEGER NOT NULL DEFAULT 0,
  "safety_flagged_count" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),

  CONSTRAINT "autonomous_operator_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "autonomous_operator_runs_cycle_id_key" UNIQUE ("cycle_id"),
  CONSTRAINT "uq_operator_run_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "autonomous_operator_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "autonomous_operator_runs_social_account_id_workspace_id_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "autonomous_operator_runs_social_account_id_started_at_idx" ON "autonomous_operator_runs"("social_account_id", "started_at");

-- 20. Create autonomous_operator_candidates
CREATE TABLE IF NOT EXISTS "autonomous_operator_candidates" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "workspace_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "recommendation_id" UUID,
  "draft_id" UUID NOT NULL,
  "scheduled_slot" TIMESTAMP(3) NOT NULL,
  "scheduled_post_id" UUID,
  "status" TEXT NOT NULL,
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "autonomous_operator_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "autonomous_operator_candidates_scheduled_post_id_key" UNIQUE ("scheduled_post_id"),
  CONSTRAINT "uq_operator_candidate_tenant" UNIQUE ("id", "workspace_id", "social_account_id"),
  CONSTRAINT "autonomous_operator_candidates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "autonomous_operator_candidates_social_account_id_workspac_fkey" FOREIGN KEY ("social_account_id", "workspace_id") REFERENCES "social_accounts"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "autonomous_operator_candidates_run_id_workspace_id_social_fkey" FOREIGN KEY ("run_id", "workspace_id", "social_account_id") REFERENCES "autonomous_operator_runs"("id", "workspace_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "autonomous_operator_candidates_recommendation_id_workspac_fkey" FOREIGN KEY ("recommendation_id", "workspace_id", "social_account_id") REFERENCES "recommendation_exposures"("id", "workspace_id", "social_account_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "autonomous_operator_candidates_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "content_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "autonomous_operator_candidates_scheduled_post_id_worksp_fkey" FOREIGN KEY ("scheduled_post_id", "workspace_id", "social_account_id") REFERENCES "scheduled_posts"("id", "workspace_id", "social_account_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "autonomous_operator_candidates_run_id_status_idx" ON "autonomous_operator_candidates"("run_id", "status");

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 0008_analytics_and_intelligence
-- Scope: Phase 4 Performance Analytics & Intelligence Loop
-- Tables: analytics_observations, post_metrics, performance_aggregates,
--         insights, _InsightToPerformanceAggregate, learned_performance_profiles,
--         learned_dimension_weights, recommendation_exposures,
--         recommendation_scoring_configs, analytics_outbox_events, analytics_sync_states
-- Includes:
--   - PostgreSQL Composite Unique & Foreign Key Tenant Isolation Chains
--   - ON DELETE RESTRICT on RecommendationExposure -> Insight / LearnedDimensionWeight
--   - PostMetric Database Immutability Trigger with Purge Session Bypass
--   - Partial Unique Index for Single Active RecommendationScoringConfig
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ObservationSlot') THEN
    CREATE TYPE "ObservationSlot" AS ENUM ('T_1H', 'T_6H', 'T_24H', 'T_7D', 'T_30D');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ObservationStatus') THEN
    CREATE TYPE "ObservationStatus" AS ENUM (
      'SCHEDULED', 'PROCESSING', 'CAPTURED', 'FAILED',
      'RATE_LIMITED', 'MISSED', 'DELETED', 'UNAVAILABLE'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AggregationDimension') THEN
    CREATE TYPE "AggregationDimension" AS ENUM (
      'TOPIC', 'FORMAT', 'MEDIA_TYPE', 'POST_LENGTH_BUCKET',
      'PUBLISH_HOUR_UTC', 'PUBLISH_DAY_OF_WEEK'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AggregationGranularity') THEN
    CREATE TYPE "AggregationGranularity" AS ENUM (
      'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ALL_TIME'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EvidenceGrade') THEN
    CREATE TYPE "EvidenceGrade" AS ENUM (
      'INSUFFICIENT_DATA', 'LOW_SIGNAL', 'DIRECTIONAL', 'HIGH_SIGNAL'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecommendationProvenanceType') THEN
    CREATE TYPE "RecommendationProvenanceType" AS ENUM (
      'INSIGHT', 'LEARNED_WEIGHT', 'EXPLORATION'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecommendationAttributionStatus') THEN
    CREATE TYPE "RecommendationAttributionStatus" AS ENUM (
      'EXPOSED', 'ACCEPTED', 'DISMISSED', 'PUBLISHED', 'EVALUATED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AnalyticsOutboxType') THEN
    CREATE TYPE "AnalyticsOutboxType" AS ENUM (
      'TRIGGER_OBSERVATION', 'RETRY_OBSERVATION', 'TRIGGER_AGGREGATION',
      'TRIGGER_INSIGHTS', 'TRIGGER_PROFILE_LEARNING', 'TRIGGER_RECOMMENDATIONS'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OutboxEventStatus') THEN
    CREATE TYPE "OutboxEventStatus" AS ENUM (
      'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
    );
  END IF;
END $$;

-- 2. Multi-Tenant Unique Constraints on Existing Tables
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_social_account_workspace'
  ) THEN
    ALTER TABLE social_accounts ADD CONSTRAINT uq_social_account_workspace UNIQUE (id, workspace_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_published_post_tenant'
  ) THEN
    ALTER TABLE published_posts ADD CONSTRAINT uq_published_post_tenant UNIQUE (id, workspace_id, social_account_id);
  END IF;
END $$;

-- Alter content_ideas for Phase 4 Recommendations
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS social_account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE;
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS hook_style TEXT;
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS suggested_prompt TEXT;
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS predicted_score DOUBLE PRECISION;
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'SUGGESTED';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_content_idea_tenant'
  ) THEN
    ALTER TABLE content_ideas ADD CONSTRAINT uq_content_idea_tenant UNIQUE (id, workspace_id, social_account_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_ideas_social_account ON content_ideas(social_account_id);

-- 3. Create Table: analytics_observations
CREATE TABLE IF NOT EXISTS analytics_observations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  published_post_id UUID NOT NULL,
  observation_slot "ObservationSlot" NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  window_closes_at TIMESTAMPTZ NOT NULL,
  status "ObservationStatus" NOT NULL DEFAULT 'SCHEDULED',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  lease_token TEXT,
  lease_until TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_observation_slot UNIQUE (published_post_id, observation_slot),
  CONSTRAINT uq_analytics_observation_tenant UNIQUE (id, workspace_id, social_account_id),
  CONSTRAINT fk_obs_published_post_tenant FOREIGN KEY (published_post_id, workspace_id, social_account_id)
    REFERENCES published_posts(id, workspace_id, social_account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_obs_status_scheduled ON analytics_observations(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_obs_status_lease ON analytics_observations(status, lease_until);
CREATE INDEX IF NOT EXISTS idx_obs_tenant_status ON analytics_observations(workspace_id, social_account_id, status);

-- 4. Create Table: post_metrics
CREATE TABLE IF NOT EXISTS post_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  published_post_id UUID NOT NULL,
  observation_id UUID NOT NULL UNIQUE REFERENCES analytics_observations(id) ON DELETE CASCADE,
  observation_slot "ObservationSlot" NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  views INTEGER,
  likes INTEGER,
  replies INTEGER,
  reposts INTEGER,
  quotes INTEGER,
  engagement_rate_by_views DOUBLE PRECISION,
  like_rate DOUBLE PRECISION,
  reply_rate DOUBLE PRECISION,
  repost_rate DOUBLE PRECISION,
  quote_rate DOUBLE PRECISION,
  follower_count_at_publish INTEGER,
  engagement_rate_by_followers DOUBLE PRECISION,
  raw_api_response JSONB NOT NULL,
  metric_formula_version TEXT NOT NULL DEFAULT 'v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_post_metric_slot UNIQUE (published_post_id, observation_slot),
  CONSTRAINT uq_post_metric_tenant UNIQUE (id, workspace_id, social_account_id),
  CONSTRAINT fk_pm_published_post_tenant FOREIGN KEY (published_post_id, workspace_id, social_account_id)
    REFERENCES published_posts(id, workspace_id, social_account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_metrics_tenant_slot_captured ON post_metrics(workspace_id, social_account_id, observation_slot, captured_at);
CREATE INDEX IF NOT EXISTS idx_post_metrics_post_captured ON post_metrics(published_post_id, captured_at);

-- 5. PostMetric Immutability Trigger with Authorized Purge Session Bypass
CREATE OR REPLACE FUNCTION fn_post_metrics_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'post_metrics rows are immutable. UPDATE rejected on id=%', OLD.id;
  ELSIF TG_OP = 'DELETE' THEN
    IF CURRENT_SETTING('threadpilot.allow_purge', true) = 'on' THEN
      RETURN OLD;
    ELSE
      RAISE EXCEPTION 'DELETE on post_metrics rejected. Deletions are permitted only during authorized tenant purge with SET LOCAL threadpilot.allow_purge = ''on''.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_metrics_immutable ON post_metrics;
CREATE TRIGGER trg_post_metrics_immutable
  BEFORE UPDATE OR DELETE ON post_metrics
  FOR EACH ROW EXECUTE FUNCTION fn_post_metrics_immutable();

-- 6. Create Table: performance_aggregates
CREATE TABLE IF NOT EXISTS performance_aggregates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  dimension "AggregationDimension" NOT NULL,
  dimension_value TEXT NOT NULL,
  observation_slot "ObservationSlot" NOT NULL,
  granularity "AggregationGranularity" NOT NULL,
  bucket_date TIMESTAMPTZ NOT NULL,
  sample_size INTEGER NOT NULL,
  complement_size INTEGER NOT NULL,
  subject_avg_views DOUBLE PRECISION,
  subject_avg_likes DOUBLE PRECISION,
  subject_avg_replies DOUBLE PRECISION,
  subject_avg_engagement_by_views DOUBLE PRECISION,
  subject_std_dev_engagement DOUBLE PRECISION,
  complement_avg_engagement DOUBLE PRECISION,
  complement_std_dev_engagement DOUBLE PRECISION,
  absolute_delta DOUBLE PRECISION,
  percent_delta DOUBLE PRECISION,
  cohens_d DOUBLE PRECISION,
  degrees_of_freedom DOUBLE PRECISION,
  welch_t_statistic DOUBLE PRECISION,
  welch_p_value DOUBLE PRECISION,
  ci95_lower DOUBLE PRECISION,
  ci95_upper DOUBLE PRECISION,
  hypothesis_family_key TEXT NOT NULL,
  hypothesis_family_revision INTEGER NOT NULL,
  hypothesis_family_size INTEGER NOT NULL,
  passes_fdr BOOLEAN,
  q_value DOUBLE PRECISION,
  aggregation_version TEXT NOT NULL DEFAULT 'v1',
  analytics_revision INTEGER NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_perf_aggregate UNIQUE (social_account_id, dimension, dimension_value, observation_slot, granularity, bucket_date, analytics_revision),
  CONSTRAINT uq_performance_aggregate_tenant UNIQUE (id, workspace_id, social_account_id)
);

CREATE INDEX IF NOT EXISTS idx_perf_agg_account_slot_gran_date ON performance_aggregates(social_account_id, observation_slot, granularity, bucket_date);
CREATE INDEX IF NOT EXISTS idx_perf_agg_workspace_dim_fdr ON performance_aggregates(workspace_id, dimension, passes_fdr);

-- 7. Create Table: insights
CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  dimension "AggregationDimension" NOT NULL,
  dimension_value TEXT NOT NULL,
  observation_slot "ObservationSlot" NOT NULL,
  sample_size INTEGER NOT NULL,
  complement_size INTEGER NOT NULL,
  subject_avg_engagement DOUBLE PRECISION,
  complement_avg_engagement DOUBLE PRECISION,
  absolute_delta DOUBLE PRECISION,
  percent_delta DOUBLE PRECISION,
  cohens_d DOUBLE PRECISION,
  ci95_lower DOUBLE PRECISION,
  ci95_upper DOUBLE PRECISION,
  welch_p_value DOUBLE PRECISION,
  evidence_grade "EvidenceGrade" NOT NULL,
  hypothesis_family_key TEXT NOT NULL,
  hypothesis_family_revision INTEGER NOT NULL,
  hypothesis_family_size INTEGER NOT NULL,
  passes_fdr BOOLEAN NOT NULL DEFAULT FALSE,
  q_value DOUBLE PRECISION,
  observation TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  generation_model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  aggregation_version TEXT NOT NULL,
  metric_formula_version TEXT NOT NULL,
  analytics_revision_at_generation INTEGER NOT NULL,
  analysis_window_start TIMESTAMPTZ NOT NULL,
  analysis_window_end TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_insight_tenant UNIQUE (id, workspace_id, social_account_id)
);

CREATE INDEX IF NOT EXISTS idx_insights_account_grade_created ON insights(social_account_id, evidence_grade, created_at);
CREATE INDEX IF NOT EXISTS idx_insights_workspace_dim_active ON insights(workspace_id, dimension, is_active);

-- 8. Create Junction Table: _InsightToPerformanceAggregate
CREATE TABLE IF NOT EXISTS "_InsightToPerformanceAggregate" (
  "A" UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
  "B" UUID NOT NULL REFERENCES performance_aggregates(id) ON DELETE CASCADE,
  CONSTRAINT "_InsightToPerformanceAggregate_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX IF NOT EXISTS "_InsightToPerformanceAggregate_B_index" ON "_InsightToPerformanceAggregate"("B");

-- 9. Create Table: learned_performance_profiles
CREATE TABLE IF NOT EXISTS learned_performance_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL UNIQUE REFERENCES social_accounts(id) ON DELETE CASCADE,
  best_topic TEXT,
  best_topic_weight DOUBLE PRECISION,
  best_topic_sample_size INTEGER,
  best_topic_revision INTEGER,
  best_format TEXT,
  best_format_weight DOUBLE PRECISION,
  best_format_sample_size INTEGER,
  best_format_revision INTEGER,
  best_length_bucket TEXT,
  best_length_bucket_weight DOUBLE PRECISION,
  best_length_bucket_sample_size INTEGER,
  best_length_bucket_revision INTEGER,
  best_hour_utc INTEGER,
  best_hour_weight DOUBLE PRECISION,
  best_hour_sample_size INTEGER,
  best_hour_revision INTEGER,
  best_day INTEGER,
  best_day_weight DOUBLE PRECISION,
  best_day_sample_size INTEGER,
  best_day_revision INTEGER,
  analytics_revision_at_computation INTEGER NOT NULL,
  last_computed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_learned_profile_tenant UNIQUE (id, workspace_id, social_account_id)
);

-- 10. Create Table: learned_dimension_weights
CREATE TABLE IF NOT EXISTS learned_dimension_weights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  dimension "AggregationDimension" NOT NULL,
  dimension_value TEXT NOT NULL,
  raw_weight DOUBLE PRECISION NOT NULL,
  decayed_weight DOUBLE PRECISION NOT NULL,
  total_sample_size INTEGER NOT NULL,
  eligible_bucket_count INTEGER NOT NULL,
  evidence_bucket_count INTEGER NOT NULL,
  highest_evidence_grade "EvidenceGrade" NOT NULL,
  observation_slot "ObservationSlot" NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  analytics_revision INTEGER NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_learned_dim_weight UNIQUE (social_account_id, dimension, dimension_value, observation_slot),
  CONSTRAINT uq_learned_weight_tenant UNIQUE (id, workspace_id, social_account_id),
  CONSTRAINT fk_learned_weight_profile_tenant FOREIGN KEY (profile_id, workspace_id, social_account_id)
    REFERENCES learned_performance_profiles(id, workspace_id, social_account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_learned_weights_account_dim_active ON learned_dimension_weights(social_account_id, dimension, is_active);
CREATE INDEX IF NOT EXISTS idx_learned_weights_workspace_dim_decayed ON learned_dimension_weights(workspace_id, dimension, decayed_weight);

-- 11. Create Table: recommendation_exposures
-- P0 #1 FIX: composite foreign keys to Insight and LearnedDimensionWeight strictly enforce ON DELETE RESTRICT
CREATE TABLE IF NOT EXISTS recommendation_exposures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  provenance_type "RecommendationProvenanceType" NOT NULL DEFAULT 'INSIGHT',
  insight_id UUID,
  learned_weight_id UUID,
  exploration_dimension "AggregationDimension",
  exploration_value TEXT,
  content_idea_id UUID UNIQUE,
  draft_id UUID UNIQUE REFERENCES content_drafts(id) ON DELETE SET NULL,
  published_post_id UUID UNIQUE,
  evaluated_post_metric_id UUID UNIQUE,
  observed_lift DOUBLE PRECISION,
  attribution_status "RecommendationAttributionStatus" NOT NULL DEFAULT 'EXPOSED',
  analytics_revision_at_generation INTEGER NOT NULL,
  cycle_idempotency_key TEXT NOT NULL UNIQUE,
  exposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_recommendation_exposure_tenant UNIQUE (id, workspace_id, social_account_id),
  CONSTRAINT uq_exposure_content_idea UNIQUE (content_idea_id, workspace_id, social_account_id),
  CONSTRAINT uq_exposure_published_post UNIQUE (published_post_id, workspace_id, social_account_id),
  CONSTRAINT uq_exposure_evaluated_post_metric UNIQUE (evaluated_post_metric_id, workspace_id, social_account_id),
  CONSTRAINT fk_exposure_content_idea_tenant FOREIGN KEY (content_idea_id, workspace_id, social_account_id)
    REFERENCES content_ideas(id, workspace_id, social_account_id) ON DELETE CASCADE,
  CONSTRAINT fk_exposure_published_post_tenant FOREIGN KEY (published_post_id, workspace_id, social_account_id)
    REFERENCES published_posts(id, workspace_id, social_account_id) ON DELETE CASCADE,
  CONSTRAINT fk_exposure_evaluated_metric_tenant FOREIGN KEY (evaluated_post_metric_id, workspace_id, social_account_id)
    REFERENCES post_metrics(id, workspace_id, social_account_id) ON DELETE SET NULL,
  CONSTRAINT fk_exposure_insight_tenant FOREIGN KEY (insight_id, workspace_id, social_account_id)
    REFERENCES insights(id, workspace_id, social_account_id) ON DELETE RESTRICT,
  CONSTRAINT fk_exposure_learned_weight_tenant FOREIGN KEY (learned_weight_id, workspace_id, social_account_id)
    REFERENCES learned_dimension_weights(id, workspace_id, social_account_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_rec_exposure_account_status ON recommendation_exposures(social_account_id, attribution_status);
CREATE INDEX IF NOT EXISTS idx_rec_exposure_workspace_status_created ON recommendation_exposures(workspace_id, attribution_status, created_at);

-- 12. Create Table: recommendation_scoring_configs
CREATE TABLE IF NOT EXISTS recommendation_scoring_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  weight_learned_weight DOUBLE PRECISION NOT NULL DEFAULT 0.35,
  weight_freshness DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  weight_explicit_pref DOUBLE PRECISION NOT NULL DEFAULT 0.50,
  exploration_fraction DOUBLE PRECISION NOT NULL DEFAULT 0.20,
  half_life_days DOUBLE PRECISION NOT NULL DEFAULT 30.0,
  max_candidates_per_cycle INTEGER NOT NULL DEFAULT 4,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial Unique Index: Exactly one active scoring config
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_scoring_config
  ON recommendation_scoring_configs (is_active) WHERE is_active = TRUE;

-- Seed default scoring config if none exists
INSERT INTO recommendation_scoring_configs (
  id, weight_learned_weight, weight_freshness, weight_explicit_pref,
  exploration_fraction, half_life_days, max_candidates_per_cycle, is_active, created_at, updated_at
) VALUES (
  uuid_generate_v4(), 0.35, 0.15, 0.50, 0.20, 30.0, 4, true, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- 13. Create Table: analytics_outbox_events
CREATE TABLE IF NOT EXISTS analytics_outbox_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  event_type "AnalyticsOutboxType" NOT NULL,
  status "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
  payload JSONB NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  delivery_generation INTEGER NOT NULL DEFAULT 1,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  lease_token TEXT,
  lease_until TIMESTAMPTZ,
  execute_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_execute ON analytics_outbox_events(status, execute_at);
CREATE INDEX IF NOT EXISTS idx_outbox_status_lease ON analytics_outbox_events(status, lease_until);
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_status ON analytics_outbox_events(workspace_id, social_account_id, status);

-- 14. Create Table: analytics_sync_states
CREATE TABLE IF NOT EXISTS analytics_sync_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL UNIQUE REFERENCES social_accounts(id) ON DELETE CASCADE,
  analytics_revision INTEGER NOT NULL DEFAULT 0,
  ingestion_generation INTEGER NOT NULL DEFAULT 0,
  last_ingestion_at TIMESTAMPTZ,
  last_aggregation_at TIMESTAMPTZ,
  preferred_topics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  avoided_topics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  preferred_formats TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  avoided_formats TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  max_pending_recommendations INTEGER NOT NULL DEFAULT 10,
  max_recommendations_per_cycle INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

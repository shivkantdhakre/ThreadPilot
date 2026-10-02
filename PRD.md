# PRD — ThreadPilot: Personal Social AI Platform for Threads

**Product Name:** ThreadPilot  
**Document Version:** 1.0  
**Document Type:** Product Requirements Document (PRD)  
**Status:** Living Engineering Document & Evolution Roadmap  
**Target Platform:** Web Application (Next.js 15) + API (NestJS 11) + Async Workers (BullMQ) + Meta Threads Graph API + Google Gemini AI + PostgreSQL with `pgvector`  
**Primary Goal:** Enable creators, developers, and founders to automate their Threads presence while continuously learning, preserving, and reproducing their personal writing voice, topical authority, and interaction patterns.

---

## 1. Executive Summary & Product Vision

### 1.1 The Vision

**ThreadPilot** is an AI-powered personal social operating system designed specifically for Meta's Threads network. Unlike generic social-media schedulers that treat content creation as generic text generation, ThreadPilot models the author. It implements a closed-loop operating lifecycle:

$$\text{Understand Author} \longrightarrow \text{Discover Opportunities} \longrightarrow \text{Generate Content} \longrightarrow \text{Improve \& Validate} \longrightarrow \text{Publish} \longrightarrow \text{Engage} \longrightarrow \text{Analyze} \longrightarrow \text{Learn} \longrightarrow \text{Adapt Profile}$$

ThreadPilot acts as a high-fidelity **AI Social Media Operator** trained on the user's authentic history. Routine tasks (formatting, initial drafting, trend synthesis, schedule execution, comment categorization) become increasingly autonomous, while sensitive decisions (final post approval, controversial replies, brand positioning) remain under strict human control.

### 1.2 Core Architectural Invariant

```
PostgreSQL owns business state.
BullMQ owns execution.
Redis owns coordination.
Threads owns platform state.
pgvector owns semantic memory.
Google Gemini owns generation & extraction.
```

---

## 2. Problem Statement & Value Proposition

### 2.1 The Problem

Building an impactful presence on Threads requires high consistency across multiple cognitively demanding tasks:

1. **Topical Opportunity Sourcing:** Scanning tech trends, news, and community discussions.
2. **Personal Voice Consistency:** Maintaining a distinct voice (sentence cadence, vocabulary density, tone, hooks) across dozens of posts per week.
3. **Format Optimization:** Complying with platform realities (500-character limit, strong single-line hooks, conversation starters).
4. **Publishing Cadence:** Timing posts across global audience timezones without manual intervention.
5. **Engagement Maintenance:** Monitoring incoming replies, filtering spam/trolling, and crafting thoughtful, tone-consistent replies.
6. **Absence of a Learning Loop:** Current tools lack memory; every post generation starts from zero without awareness of what writing styles resonated historically.

### 2.2 The Solution: The Personal Social Profile

ThreadPilot solves this by maintaining a continuously evolving **Personal Social Profile** backed by:

- **8-Point Stylometric Fingerprinting** extracted from authentic historical posts.
- **Multi-Representation Semantic Vector Memory** (`pgvector`) retrieving past exemplar posts as few-shot guidance.
- **Fail-Safe Asynchronous Publishing Pipeline** with atomic database fencing and platform reconciliation.
- **Human-in-the-Loop Engagement Agent** with automated interaction classification.

---

## 3. Target Personas & Use Cases

### 3.1 Primary Personas

- **Technical Founders & Solo Entrepreneurs:** Need regular industry visibility to build audience and distribution, but have zero bandwidth for daily manual authoring.
- **Software Engineers & Creators:** Possess deep domain expertise and distinct writing styles, but struggle with consistent hook writing, formatting, and regular scheduling.
- **Domain Experts & Researchers:** Want to translate complex ideas into bite-sized, engaging Threads posts without compromising nuance.

### 3.2 Key Use Cases

| Use Case                        | Description                                                                                     | Primary Value                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Zero-Cold-Start Drafting**    | Generate 5 authentic post drafts from a technical URL or topic in seconds.                      | Eliminates blank-canvas writer's block.              |
| **Voice Preservation**          | Rewrites or polishes rough ideas while strictly enforcing the author's stylometrics.            | Guarantees authentic personal voice.                 |
| **Fail-Safe Scheduling**        | Schedule posts across multiple Threads accounts with automatic queue-loss recovery.             | Prevents silent publishing drops or duplicate posts. |
| **Conversational Review Queue** | Auto-classifies incoming replies and drafts context-aware responses for 1-click approval.       | Cuts daily engagement time by 80%.                   |
| **Empirical Style Learning**    | Identifies writing patterns (e.g. contrarian hooks vs questions) correlating with higher reach. | Eliminates guesswork in content strategy.            |

---

## 4. Product Goals & Non-Goals

### 4.1 Primary Goals

1. **Authentic Content Generation:** Generate Threads drafts that faithfully reflect the user's stylometric profile.
2. **Continuous Learning Loop:** Extract writing patterns from historical posts and refine them using user edits and platform performance.
3. **Resilient Publishing:** Deliver zero-duplicate, at-most-once publishing guarantees over Meta's Threads API with automatic network recovery.
4. **Context-Aware Engagement:** Classify replies and generate tone-matched response candidates.
5. **Progressive Autonomy:** Enable users to graduate from 100% manual review to rules-based autonomous publishing.
6. **Multi-Tenant Isolation:** Ensure strict workspace tenancy, in-memory client token security, and AES-256-GCM OAuth credential encryption.

### 4.2 Non-Goals (Strict Guardrails for Version 1)

- **No Cross-Platform Expansion:** ThreadPilot is strictly focused on Meta Threads. No X (Twitter), LinkedIn, or Instagram cross-posting in Version 1.
- **No Persona Impersonation:** ThreadPilot will not generate content designed to mimic third parties or fabricate personal lived experiences.
- **No Engagement Farming:** The system will never generate generic spam ("Great post!", "Thoughts?"), engagement bait, or automated mass-follow actions.
- **No Unfenced Autonomous Replies:** Auto-replies will never engage with political controversy, personal attacks, or ambiguous context without human approval.
- **No Private Account Scraping:** All data ingestion relies exclusively on authoritative Meta Threads Graph API endpoints.

---

## 5. System Architecture & High-Level Information Flow

```mermaid
flowchart TD
    subgraph UI ["Frontend (apps/web)"]
        Dashboard["Dashboard & Analytics"]
        Creator["Content Studio & Editor"]
        Calendar["Publishing Calendar"]
        ProfileUI["Voice Profile & Exemplars"]
        ReviewQueue["Engagement Review Queue"]
    end

    subgraph API ["Gateway API (apps/api)"]
        AuthMod["Auth & Tenant Isolation"]
        ContentMod["Content & Draft Service"]
        PublishMod["Scheduling Controller"]
        EngageMod["Engagement Gateway"]
        JobsMod["Job Dispatcher & SSE Stream"]
    end

    subgraph Queue ["Coordination Layer (Redis)"]
        BullMQ["BullMQ Queues (Ingestion, Style, Content, Publishing, Engagement)"]
        PubSub["Redis Pub/Sub (Job Progress SSE)"]
    end

    subgraph Workers ["Worker Execution (apps/worker)"]
        IngestProc["Ingestion Processor"]
        StyleProc["Style Extractor Graph"]
        ContentProc["Content Generation Graph"]
        PublishProc["Publishing Engine & Reconciler"]
        EngageProc["Engagement Processor"]
        AnalyticsProc["Metrics Synchronizer"]
    end

    subgraph Memory ["Persistence & Vector Store"]
        Postgres[("PostgreSQL 16 (Neon)")]
        PgVector[("pgvector (768-dim Embeddings)")]
    end

    subgraph External ["External Platform Services"]
        MetaThreads["Meta Threads Graph API"]
        GeminiAI["Google Gemini 2.5 (Flash & Embeddings)"]
    end

    UI <-->|REST API + SSE| API
    API -->|Enqueue Jobs| BullMQ
    BullMQ --> Workers
    Workers -->|State & Vectors| Memory
    Workers <-->|LLM & Embeddings| GeminiAI
    Workers <-->|OAuth, Ingestion, Publishing| MetaThreads
    Workers -->|Publish Events| PubSub
    PubSub --> API
```

---

## 6. Implementation Phases: The Living Roadmap

ThreadPilot is architected in 5 distinct, loosely coupled phases. Each phase builds upon the data contracts of the preceding phase while maintaining independent modularity.

```mermaid
timeline
    title ThreadPilot Implementation Phases
    section Phase 1 (Completed)
        Identity & OAuth PKCE : Token Encryption : Ingestion Engine : pgvector Memory : Stylometric Extraction : LangGraph Content Studio
    section Phase 2 (Completed)
        Resilient Publishing Pipeline : Atomic CAS Claiming : 45s Ambiguity Protocol : Scan 1-6 Reconciler : Multi-Account Draft Reuse : Calendar UI
    section Phase 3 (Completed)
        Autonomous Engagement Engine : Ingestion Loop Breaker : Multi-Tier Adaptive Sync : Hierarchical Intent Classifier : 500-Code-Unit Reply Graph : Grounding & Kill Switch : CAS Fenced Reply Publisher : Keyset Review Deck UI : Editorial Learning
    section Phase 4 (Next)
        Platform Metrics Sync : Multi-Dimensional Analytics : AI Correlation Insights : Performance Feedback Loop : Topic Weighting
    section Phase 5 (Future)
        Dynamic Rules Engine : Autonomy Levels 0-3 : Safety Gate & Hallucination Filter : A/B Variant Experiments : Continuous Evolution
```

### Phase 1: Foundation & Personal Voice Intelligence _(Fully Implemented)_

- Multi-tenant workspace architecture with family-based refresh token rotation and in-memory access token security.
- Meta Threads OAuth 2.0 PKCE with AES-256-GCM token encryption and key versioning.
- Authoritative historical post ingestion storing raw payloads and normalized `ThreadPost` records.
- Multi-representation vector storage in `pgvector` with Google Gemini 768-dimensional embeddings.
- 8-point stylometric feature extraction (`StyleExtractionGraph`) computing vocabulary depth, sentence length, emoji frequency, and hook patterns.
- Multi-turn LangGraph drafting engine (`ContentGenerationGraph`) with exemplar retrieval and strict 500-character final validation gate.
- Next.js 15 dashboard with real-time SSE job progress tracking, draft editor, and voice profile card.

### Phase 2: Resilient Scheduled Publishing Pipeline _(Fully Implemented)_

- Fail-safe state machine for scheduled posts: `SCHEDULED` $\rightarrow$ `CLAIMED` $\rightarrow$ `CREATING_CONTAINER` $\rightarrow$ `CONTAINER_CREATED` $\rightarrow$ `PUBLISHING` $\rightarrow$ `PUBLISHED`.
- Atomic PostgreSQL CAS claim fencing (`UPDATE ... WHERE id = :id AND lease_until <= NOW() RETURNING *`).
- Pre-execution quota gating preserving attempt counts without exhausting retry budgets.
- Two-stage container publishing with 45-second ambiguous publish recovery protocol (feed matching within $\pm4$ min window).
- Background reconciliation watchdog with 6 asynchronous healing scans (un-enqueued dispatches, due schedules, retry backoffs, stale leases, timestamp backfills, outbox events).
- Scoped multi-account publishing allowing `ARCHIVED` drafts to be scheduled across accounts without unique collision.
- Front-end calendar scheduling, timezone handling, and operator resolution interface for quarantined posts.

### Phase 3: Autonomous Engagement & Community Intelligence Engine _(Fully Implemented)_

- **Phase 3A — Database Relational FSM & Constraints (Migration 0007_engagement_engine):**
  - Implemented 15 core enums (`InteractionStatus`, `ReplyExecutionStatus`, `AutonomyMode`, `PolicyStage`, `PolicyDecisionType`, `InteractionIntent`, `FeedbackType`, `SyncTier`, `SyncStatus`, `AmbiguityType`, `ResponseDecision`, `Sentiment`, `HideStatus`, `RecoveryResolution`, etc.).
  - Added 9 core relational models: `EngagementSyncState`, `Interaction`, `InteractionClassification`, `PolicyDecision`, `ReplyDraft`, `ReplyDraftVersion`, `ReplyExecution`, `EditorialFeedback`, `IdempotencyRecord`.
  - Enforced 8 SQL CHECK constraints (bounded confidence $[0,1]$, toxicity/harassment/controversy $[0,1]$, non-empty bodies, rating $-1/1$) and 4 partial unique indexes (`idx_unique_current_classification`, `idx_unique_active_reply_execution`, `idx_unique_active_sync_lease`, `idx_unique_active_draft_per_interaction`).
- **Phase 3B — Ingestion Loop Breaker & Adaptive Multi-Tier Sync:**
  - Background polling in `EngagementIngestProcessor` with adaptive synchronization tiers: `HOT` (3 min), `WARM` (20 min), `COLD` (3 hours) based on root post age.
  - Defense-in-depth triple loop breaker preventing bot self-replies: checks `is_reply_owned_by_me === true`, case-insensitive username snapshot matching, and author external ID matching.
  - Sliding timestamp overlaps and cursor-based pagination watermarks ensuring zero dropped interactions.
- **Phase 3C — Hierarchical Intent Classification & Pre-Policy Gating:**
  - `InteractionClassifierGraph` with Google Gemini structured output categorizing incoming replies (`QUESTION`, `AGREEMENT`, `DISAGREEMENT`, `COMPLIMENT`, `REQUEST`, `TROLLING`, `SPAM`, `UNCLEAR`).
  - Granular safety and risk scoring: toxicity, harassment, controversy, sentiment, and prompt injection defense.
  - Pre-generation policy gate (`rules-v1.ts`) setting initial triage: `AUTO_REPLY`, `REVIEW_REQUIRED`, or `BLOCKED`.
- **Phase 3D — Contextual Reply Drafting & 500-Code-Unit Bounds:**
  - `ReplyGenerationGraph` assembling root post, parent comments, author voice profile, and exemplar memories into context-aware responses.
  - Hard UTF-16 code-unit counting (`validateThreadText`) strictly enforcing the 500-code-unit Meta platform ceiling.
  - Immutable monotonic `ReplyDraftVersion` tracking with parent version lineage and diff summaries.
- **Phase 3E — Post-Generation Safety Grounding & Outbound Kill Switch:**
  - `PostGenerationSafetyGraph` detecting unsupported claims, factuality risks, and brand tone violations.
  - Autonomy level arbitration (`REVIEW_ONLY`, `SHADOW`, `RULES_BASED`, `OFF`). Shadow mode computes would-auto-reply telemetry without dispatching external publish requests.
  - Emergency Outbound Kill Switch (`repliesPaused = true` in workspace preferences) providing instant pre-flight and post-generation halting across all outbound automation.
- **Phase 3F — API Gateway, Keyset Pagination & Optimistic Concurrency:**
  - High-performance REST endpoints in `EngagementController` with keyset cursor pagination (`GET /engagement/interactions`).
  - Optimistic locking via HTTP `If-Match` headers: stale version updates fail deterministically with HTTP 409 Conflict.
  - Granular operator ambiguity resolution and tenant-scoped `Idempotency-Key` headers on manual draft triggering.
- **Phase 3G — Fenced CAS Publisher & Watchdog Reconciliation:**
  - Universal CAS worker fencing in `ReplyPublishProcessor` with lease duration tracking and unique worker tokens.
  - Exactly-once container creation: container IDs are persisted immediately, avoiding duplicate Meta containers on retries.
  - Canonical 429 exponential backoffs (5s, 15s, 30s, 60s, terminal).
  - Background `EngagementReconciliationService` running Scans 0 through 6 to heal un-enqueued dispatches, expired leases, stuck containers, unlinked executions, and pending sync leases.
  - Transactional Outbox integration: `REPLY_EXECUTION_DISPATCH` events routed safely to `reply-publish-queue` via `EventOutboxProcessor`.
- **Phase 3H — Editorial Personalization & Memory Contamination Guard:**
  - Tracks user manual edits against AI drafts via word-level diff summaries in `EditorialFeedback`.
  - Curates high-rated edits into vector memory exemplars while filtering out contamination (profanity, prompt leakage, personal data).
- **Frontend UI/UX Integration:**
  - Next.js 15 Community Review Deck (`/replies`) with filter tabs (`NEEDS_REVIEW`, `REPLIED`, `AUTO_REPLIED`, `DISMISSED`, `ALL`), search bar, and social account switcher.
  - Keyboard shortcuts (`a` for Approve, `e` for Edit, `r` for Regenerate, `d` for Dismiss, `Escape` to close modals).
  - Autonomous Reply Engine telemetry widget in `/dashboard` displaying live monitoring state, queue count, and warning banners.
  - Autonomy Mode selector and Outbound Kill Switch toggle in `/settings`.

### Phase 4: Performance Analytics & Intelligence Loop *(Implemented — Definitive Production Baseline, v17 Frozen)*

- **Phase 4A — Database Schema & Relational Integrity:**
  - 11 specialized enums (`ObservationSlot` T_1H through T_30D, `ObservationStatus`, `AggregationGranularity`, `AggregationDimension`, `EvidenceGrade`, `AnalyticsOutboxType`, `OutboxStatus`, `RecommendationAttributionStatus`, `RecommendationProvenanceType`, `HookStyle`).
  - 8 core relational models: `AnalyticsObservation`, `PostMetric`, `PerformanceAggregate`, `Insight`, `LearnedPerformanceProfile`, `LearnedDimensionWeight`, `RecommendationExposure`, `AnalyticsOutboxEvent`, `AnalyticsSyncState`, `FollowerSnapshot`, `RecommendationScoringConfig`.
  - Database-engine immutability trigger on `post_metrics` rejecting `UPDATE` unconditionally and rejecting `DELETE` unless authorized via transaction-local purge session (`SET LOCAL threadpilot.allow_purge = 'on'`).
  - Strict composite unique constraints and foreign keys `(workspace_id, social_account_id)` preventing cross-tenant leakage.
  - Attribution ledger relational integrity enforcing `ON DELETE RESTRICT` on referenced `Insight` and `LearnedDimensionWeight` records to guarantee audit preservation.
- **Phase 4B — Transactional Outbox with CAS Lease Fencing:**
  - Asynchronous event bus via `AnalyticsOutboxEvent` with `FOR UPDATE SKIP LOCKED` atomic claiming and 60-second lease fencing (`leaseToken`, `leaseUntil`).
  - Deduplication key enforcement preventing duplicate database event insertion.
  - Isolated queue job IDs derived from entity IDs, dedupe keys, and incremented `deliveryGeneration` for audited replays.
  - Background `AnalyticsOutboxDispatchService` running a 5-second polling loop with distributed Redis leader election.
- **Phase 4C — Ingestion with Atomic Observation Fencing & Strict FSM:**
  - Observation lifecycle: `SCHEDULED` $\rightarrow$ `PROCESSING` (60s lease) $\rightarrow$ `CAPTURED` / `MISSED` / `FAILED` / `RATE_LIMITED` / `DELETED` / `UNAVAILABLE`.
  - 15-second HTTP timeout with non-overlapping active heartbeat renewing lease every 10 seconds.
  - Window cutoff CAS check: if window closes in-flight, capture is rejected, transitioning atomically to `MISSED` with zero `PostMetric` rows written.
  - Rate limits (429) transactionally enqueue `RETRY_OBSERVATION` outbox events with exponential backoff.
  - Background `ExpiredObservationSweeperService` running every 60s to recover dead-worker leases.
- **Phase 4D — Multi-Dimensional Aggregation Engine:**
  - Independent-group CTE SQL aggregation computing subject vs complement cohorts with zero Cartesian products and zero pseudoreplication.
  - Transaction-scoped PostgreSQL advisory locks (`pg_try_advisory_xact_lock`) preventing concurrent aggregation collisions.
  - Ingestion generation tracking with overlapping generation detection at commit time.
- **Phase 4E — Canonical Dimension Resolvers:**
  - Evaluates cohorts across 7 orthogonal dimensions: `TOPIC`, `FORMAT`, `HOOK_STYLE`, `PUBLISH_HOUR_UTC`, `PUBLISH_DAY_OF_WEEK`, `POST_LENGTH_BUCKET`, and `MEDIA_TYPE`.
- **Phase 4F — Statistical Evidence & Complete Family BH-FDR Correction:**
  - Welch's t-test with unequal sample sizes and variances, Welch-Satterthwaite degrees of freedom, 95% confidence intervals, and Cohen's d effect sizes.
  - Benjamini-Hochberg False Discovery Rate (BH-FDR) accounting for the complete family universe $|U| = m$.
  - Four-tier evidence grading hierarchy: `INSUFFICIENT`, `EXPLORATORY`, `DIRECTIONAL`, `HIGH_SIGNAL`.
  - `EvidenceGrade.HIGH_SIGNAL` strictly requires passing BH-FDR (`passesFDR === true`); failing FDR caps grade at `DIRECTIONAL`.
- **Phase 4G — Longitudinal Multi-Bucket Profile Learning:**
  - Aggregates evidence strictly across monthly granularity buckets to prevent duplicate weighting.
  - Evidence-gated learning: only `DIRECTIONAL` and `HIGH_SIGNAL` aggregates influence learned weights.
  - Exponential half-life decay ($T_{1/2} = 30$ days) using immutable canonical `asOf` timestamps.
  - Stale dimension weights deactivated transactionally upon new revision computation.
- **Phase 4H — Closed-Loop Recommendation Engine & 1:1 Attribution Ledger:**
  - Multi-factor candidate scoring combining explicit creator preferences, learned dimension weights, and freshness decay.
  - First-class 1:1 attribution ledger (`RecommendationExposure`) enforcing strict FSM transitions:
    $$\text{EXPOSED} \longrightarrow \text{ACCEPTED} \longrightarrow \text{PUBLISHED} \longrightarrow \text{EVALUATED}$$
    or terminal dismissal (`EXPOSED` / `ACCEPTED` $\rightarrow$ `DISMISSED`).
  - Stage-mandatory field validation (`contentIdeaId`, `draftId`, `publishedPostId`, `evaluatedPostMetricId`, `observedLift`).
  - Observed lift evaluation against historical baseline upon `T_24H` metric capture.
- **Phase 4I — Frontend Analytics Dashboard & Recommendation Deck:**
  - Next.js 15 analytics interface (`/analytics`) featuring KPI summary cards, pipeline diagnostic panel with historical backfill trigger, multi-dimensional cohort tabs, and empirical top-performer early signal fallbacks.
  - Closed-loop intelligence deck (`/learning`) presenting active AI insights with FDR badge indicators, candidate recommendations with 1-click draft creation, and learned dimension weight distributions.

### Phase 5: Autonomous Social Operator & Content Experimentation _(Future Phase)_

- User-configurable Automation Rules Engine (`IF topic = 'AI' AND confidence > 0.90 AND risk = 'LOW' THEN auto-schedule`).
- Autonomy Level Matrix:
  - **Level 0 (Manual):** AI generates suggestions only; user manually drafts and triggers publishing.
  - **Level 1 (Approval):** AI drafts and schedules; user explicitly clicks "Approve".
  - **Level 2 (Rules-Based):** AI auto-publishes content that matches strict rule criteria.
  - **Level 3 (Autonomous Operator):** AI selects topic, format, timing, and creates content within weekly bounds.
- Safety Gate & Policy Enforcement: Pre-publish hallucination check, personal-claim verification, sentiment fence, and platform rate limit protection.
- Native A/B Content Experimentation: Multi-variant testing on hooks, post length, and CTAs with statistical significance reporting.
- Continuous Profile Adaptation: Automatic micro-adjustments to style parameters based on monthly audience response.

---

## 7. Product Modules Specification

### Module 1: Account, Multi-Tenancy & Security

- **Workspace Architecture:** Workspaces act as the administrative boundary. All social accounts, drafts, style profiles, and vector memories are strictly scoped by `workspace_id`.
- **In-Memory Token Security:** API access tokens are held exclusively in browser memory. Refresh tokens are stored in HttpOnly, SameSite=Lax cookies with cryptographic Argon2id hashing and family-based reuse detection.
- **Threads OAuth PKCE:** Implements standard OAuth 2.0 PKCE exchange (`code_verifier` and `code_challenge`) via [`ThreadsOAuthService`](file:///d:/Projects/threads-automation/packages/threads-client/src/threads-oauth.service.ts).
- **Encrypted Token Store:** Access tokens and refresh tokens are encrypted at rest using AES-256-GCM with key versioning (`{keyVersion}:{iv}:{authTag}:{ciphertext}`) via [`TokenEncryptionService`](file:///d:/Projects/threads-automation/packages/threads-client/src/token-encryption.service.ts).

### Module 2: Personal AI Voice Profile & Stylometrics

- **8 Core Stylometric Indicators:**
  1. `avgPostLengthChars`: Typical character count per post.
  2. `avgSentenceLengthWords`: Average sentence length and complexity.
  3. `questionFrequency`: Proportion of posts ending in or featuring questions.
  4. `emojiFrequency`: Usage rate and preferred emoji sets.
  5. `firstPersonFrequency`: Use of "I", "my", "we" vs objective/third-person prose.
  6. `technicalVocabScore`: Frequency of domain-specific technical terminology.
  7. `listUsageFrequency`: Tendency to use bulleted or numbered structures.
  8. `contraryHookFrequency`: Tendency to open with contrarian or pattern-interrupt statements.
- **Immutable Snapshots:** Every time the profile is calibrated or edited, a versioned snapshot is stored in `style_profile_snapshots` for complete auditability.
- **Identity Overrides:** High-level positioning, bio, profession, and areas of expertise are protected from AI mutation and can only be modified by the user.

### Module 3: Vector Memory & Exemplar Retrieval

- **pgvector Multi-Representation Architecture:** High-performing historical posts are embedded into PostgreSQL `pgvector` using Google Gemini `gemini-embedding-2` (768 dimensions).
- **Task-Specific Coordinates:** Embeddings are partitioned by task type (`DOCUMENT` for retrieval, `SIMILARITY` for duplicate detection) to maintain vector coordinate purity.
- **Dynamic Few-Shot Injection:** When generating content, the system performs cosine-similarity matching against the user's past exemplars, injecting authentic examples directly into the LLM system prompt.

### Module 4: Topic & Trend Discovery

- **Relevance Scoring Algorithm:** Evaluates potential post topics using a composite formula:
  $$\text{Opportunity Score} = 0.35 \times \text{User Interest} + 0.30 \times \text{Historical Performance} + 0.20 \times \text{Trend Momentum} + 0.15 \times \text{Topic Gap}$$
- **Transparency:** The system provides natural language explanations for every suggested topic (e.g., _"Suggested because your posts on LangGraph received 40% higher replies than average"_).

### Module 5: Content Generation Studio

- **Multi-Turn LangGraph Architecture:** Powered by [`ContentGenerationGraph`](file:///d:/Projects/threads-automation/packages/agents/src/content/content.graph.ts):
  1. `load_memory`: Fetches profile metrics and top-k vector exemplars.
  2. `generate_initial`: Generates structured drafts matching the user's hooks and cadence.
  3. `evaluate_draft`: Analyzes hook strength, readability, and stylistic adherence.
  4. `refine_draft`: Applies targeted rewrites to improve punchiness.
  5. `validate_final`: Hard deterministic check ensuring length $\le 500$ chars, no placeholder text, and non-empty body.
- **Version Tracking:** Every generation or user edit creates an immutable `ContentVersion` record with diff summaries.

### Module 6: AI Editorial Improvement Panel

- **Targeted Transformation Presets:**
  - _Sharpen Hook:_ Rewrites opening lines using contrarian or curiosity-gap techniques.
  - _Make Concise:_ Strips filler phrases and optimizes reading cadence.
  - _Add Personal Voice:_ Injects first-person perspective and personal positioning.
  - _Technical Deep-Dive:_ Increases vocabulary depth and nuance.
- **Visual Diff Comparison:** Highlights line-by-line additions and deletions before user acceptance.

### Module 7: Content Calendar & Scheduling Management

- **Visual Calendar Interface:** Day, week, and month views displaying queued, publishing, and published posts.
- **Timezone Awareness:** Explicit validation of IANA timezone identifiers with UTC instant persistence.
- **Multi-Account Scoped Scheduling:** Supports scheduling the same `ARCHIVED` draft to multiple Threads accounts at different times without database constraint collision.

### Module 8: Resilient Publishing Engine

- **Atomic Fenced Execution:** Worker leases posts using unique execution attempt UUIDs, preventing dual-worker execution.
- **Two-Stage Threads Publishing:** First creates a container via `POST /me/threads`, polls container status (`FINISHED`, `ERROR`, `EXPIRED`), then commits via `POST /me/threads_publish`.
- **45-Second Ambiguous Publish Protocol:** If a network timeout occurs during publish commit, the worker evaluates recent feed history ($\pm4$ min) to verify actual platform publication before declaring failure.
- **Watchdog Reconciliation:** Background reconciler (Scans 1 to 6) recovers lost Redis jobs, expired leases, and missing platform timestamps without manual operator intervention.

### Module 9: Engagement Monitoring, Loop Breaker & Adaptive Ingestion

- **Multi-Tier Adaptive Ingestion:** Periodic background polling via [`EngagementIngestProcessor`](file:///d:/Projects/threads-automation/apps/worker/src/processors/engagement-ingest.processor.ts) applying adaptive polling intervals based on root post age: `HOT` (<24h, 3 min), `WARM` (24h-7d, 20 min), and `COLD` (>7d, 3 hours).
- **Defense-in-Depth Loop Breaker:** Prevents infinite bot self-reply loops through a three-stage validation pipeline:
  1. Threads API native `is_reply_owned_by_me === true` flag.
  2. Case-insensitive username snapshot matching against connected `SocialAccount.username`.
  3. Author external ID matching against connected `SocialAccount.externalId`.
- **14-State Interaction Lifecycle:** State transitions from `NEW` $\rightarrow$ `CLASSIFYING` $\rightarrow$ `CLASSIFIED` $\rightarrow$ `DRAFTING` $\rightarrow$ `DRAFTED` $\rightarrow$ `OUTPUT_SAFETY_EVALUATING` $\rightarrow$ `REVIEW_REQUIRED` $\rightarrow$ `APPROVED` $\rightarrow$ `PUBLISHING` $\rightarrow$ `REPLIED` (or terminal branches `DISMISSED`, `NOT_REQUIRED`, `BLOCKED`, `RECOVERY_REQUIRED`).
- **Canonical Content Deduplication:** Normalizes incoming reply text and computes SHA-256 `canonical_content_hash` combined with `(social_account_id, external_interaction_id)` uniqueness.

### Module 10: Conversational Intelligence, Safety Grounding & Autonomous Fenced Reply Engine

- **Hierarchical Intent Classification:** Structured Gemini output in [`InteractionClassifierGraph`](file:///d:/Projects/threads-automation/packages/agents/src/engagement/interaction-classifier.graph.ts) categorizing intent into 8 dimensions (`QUESTION`, `AGREEMENT`, `DISAGREEMENT`, `COMPLIMENT`, `REQUEST`, `TROLLING`, `SPAM`, `UNCLEAR`) alongside sentiment and granular continuous risk scores (toxicity, harassment, controversy $[0.0, 1.0]$).
- **Pre-Generation Policy Engine:** Deterministic rule evaluation (`rules-v1.ts`) gating low-risk questions for draft synthesis while immediately dead-lettering toxic comments or prompt injection attempts.
- **Contextual Reply Synthesis:** Powered by [`ReplyGenerationGraph`](file:///d:/Projects/threads-automation/packages/agents/src/engagement/reply-generation.graph.ts) assembling thread context (root post + parent interaction), author voice metrics, and vector exemplars with strict 500-code-unit bounds (`validateThreadText`).
- **Post-Generation Safety Grounding:** Output validation in [`PostGenerationSafetyGraph`](file:///d:/Projects/threads-automation/packages/agents/src/engagement/post-generation-safety.graph.ts) flagging unsupported claims, factuality risks, and brand voice deviations.
- **Progressive Autonomy & Outbound Kill Switch:**
  - `REVIEW_ONLY`: All drafts routed to operator review queue.
  - `SHADOW`: Simulates autonomous routing (`wouldAutoReplyInLive = true`) without making external publish calls.
  - `RULES_BASED`: High-confidence, safe, non-controversial replies auto-publish while sensitive topics queue for human review.
  - Emergency Kill Switch (`repliesPaused = true`): Instantly halts all outbound automated comment publishing across the workspace.
- **Fenced CAS Reply Publisher:** Atomic execution leases, attempt fencing, and single-container creation in [`ReplyPublishProcessor`](file:///d:/Projects/threads-automation/apps/worker/src/processors/reply-publish.processor.ts) with canonical 429 exponential backoffs.
- **Self-Healing Watchdog:** [`EngagementReconciliationService`](file:///d:/Projects/threads-automation/apps/worker/src/services/engagement-reconciliation.service.ts) executing Scans 0 to 6 recovering lost BullMQ jobs, expired leases, stuck containers, and stale sync leases.
- **Editorial Personalization & Contamination Guard:** [`EditorialPersonalizationService`](file:///d:/Projects/threads-automation/apps/worker/src/services/editorial-personalization.service.ts) logs word-level diffs (`EditorialFeedback`) on human edits, curating positive feedback into high-quality vector exemplars while sanitizing profanity, sensitive data, and prompt leaks.

### Module 11: Performance Analytics & Metric Ingestion Engine (Phase 4)

- **Automated Observation Slots:** Schedules telemetry captures at 8 standardized temporal slots: `T_1H` (velocity), `T_6H` (early traction), `T_24H` (benchmark), `T_48H`, `T_72H` (stabilization), `T_7D` (mature engagement), `T_14D`, `T_30D` (long-tail ceiling).
- **Strict Observation FSM:** Transitions: `SCHEDULED` $\rightarrow$ `PROCESSING` (fenced with 60-second CAS lease token) $\rightarrow$ `CAPTURED` (terminal success), `MISSED` (window expiry), `FAILED` (retry scheduled), `RATE_LIMITED` (429 exponential backoff), `DELETED` (post removed), or `UNAVAILABLE` (permission revoked).
- **Platform Metric Ingestion & Invariant Immutability:** Ingests views, likes, replies, reposts, and quotes via Meta Threads Graph API. Raw records are persisted into `post_metrics` with database-engine immutability triggers rejecting `UPDATE` and non-purge `DELETE`.
- **NULL Safety & Derived Metrics:** Computes engagement rates (by views and followers), like rate, reply rate, and repost rate without false-zero coercion (strictly preserving NULL when platform metric missing).

### Module 12: Multi-Dimensional Statistical Evidence Engine (Phase 4)

- **Independent-Group CTE Aggregation:** Groups posts across 7 dimensions (`TOPIC`, `FORMAT`, `HOOK_STYLE`, `PUBLISH_HOUR_UTC`, `PUBLISH_DAY_OF_WEEK`, `POST_LENGTH_BUCKET`, `MEDIA_TYPE`) joined against independent complement sets with zero Cartesian products.
- **Welch's t-Test & 95% Confidence Intervals:** Robust two-tailed unequal variance hypothesis testing with Welch-Satterthwaite degrees of freedom and small-sample precondition guards ($n \ge 3$, non-zero variance).
- **Cohen's d Effect Size:** Standardized effect size computation over independent subject vs complement groups.
- **Benjamini-Hochberg FDR Correction:** Controls False Discovery Rate across the complete hypothesis family universe ($|U| = m$) bounding false discoveries at $q \le 0.10$.
- **Evidence Grading Hierarchy:** `INSUFFICIENT` ($n < 3$ or degenerate variance), `EXPLORATORY` (low sample or high uncertainty), `DIRECTIONAL` (meaningful effect + adequate sample), `HIGH_SIGNAL` (robust across all criteria AND passes BH-FDR correction).

### Module 13: Longitudinal Profile Learning & Closed-Loop Intelligence Loop (Phase 4)

- **Longitudinal Monthly Aggregation:** Computes longitudinal weights across historical monthly buckets, eliminating multi-counting across daily/weekly snapshots.
- **Evidence-Gated Weighting:** Restricts learned profile updates strictly to `DIRECTIONAL` and `HIGH_SIGNAL` evidence.
- **Temporal Half-Life Decay:** Applies exponential time-decay ($T_{1/2} = 30$ days) evaluated against canonical, immutable `asOf` timestamps.
- **Multi-Factor Recommendation Scoring:** Evaluates candidate ideas combining explicit creator preferences (0.50), learned dimension weights (0.35), and freshness decay (0.15).
- **1:1 Attribution Ledger & Observed Lift Tracking:** Enforces first-class attribution in `RecommendationExposure` tracking the full lifecycle:
  $$\text{EXPOSED} \longrightarrow \text{ACCEPTED} \longrightarrow \text{PUBLISHED} \longrightarrow \text{EVALUATED}$$
  Upon `T_24H` metric capture of a recommended post, evaluates observed engagement lift against the baseline mean and records verified impact.
- **Attribution Ledger Immutability:** Enforces composite foreign keys with `ON DELETE RESTRICT` on referenced insights and learned weights, preserving audit history against source entity deactivation.

### Module 14: Transactional Analytics Outbox & Sweeper Recovery (Phase 4)

- **Transactional Outbox Event Bus:** All state transitions that trigger downstream async stages write to `AnalyticsOutboxEvent` within the same database transaction.
- **SKIP LOCKED Claiming:** Outbox dispatcher claims events using `FOR UPDATE SKIP LOCKED` with 60-second lease fencing.
- **Audited Replay Path:** Replaying failed events increments `deliveryGeneration`, yielding fresh BullMQ job IDs isolated from previous attempts.
- **Sweeper Recovery:** `ExpiredObservationSweeperService` scans for abandoned `PROCESSING` leases, transitioning expired records to `MISSED` or scheduling retries if windows remain open.

---

## 8. Monorepo Project Structure & Codebase Reference

Every module and phase maps directly to existing or planned files across the ThreadPilot Turborepo codebase:

```
threadpilot/
├── apps/
│   ├── api/                                      # NestJS 11 Gateway Service
│   │   └── src/
│   │       ├── auth/                             # User authentication, Argon2id, JWT rotation
│   │       │   ├── auth.controller.ts            # POST /auth/login, /auth/register, /auth/refresh
│   │       │   ├── auth.service.ts               # User creation, credential validation
│   │       │   ├── password.service.ts           # Argon2id password hashing
│   │       │   ├── refresh-token.service.ts      # Family-based refresh token rotation
│   │       │   └── token.service.ts              # In-memory access token signing
│   │       ├── common/                           # Cross-cutting decorators, guards, filters, redis
│   │       │   ├── decorators/                   # @CurrentUser(), @CurrentWorkspace()
│   │       ├── analytics/                        # [Phase 4] Analytics & Recommendation Gateway
│   │       │   ├── analytics.controller.ts       # GET /analytics/overview, /aggregates, /insights, /learning
│   │       │   ├── recommendations.controller.ts # GET /analytics/recommendations, POST accept/dismiss
│   │       │   ├── analytics.service.ts          # Aggregates, insights, and recommendation service logic
│   │       │   ├── recommendation-validator.ts   # Stage-mandatory attribution transition checks
│   │       │   └── analytics.module.ts           # Analytics dependency injection & controller routing
│   │       ├── auth/                             # User authentication, Argon2id, JWT rotation
│   │       │   ├── auth.controller.ts            # POST /auth/login, /auth/register, /auth/refresh
│   │       │   ├── auth.service.ts               # User creation, credential validation
│   │       │   ├── password.service.ts           # Argon2id password hashing
│   │       │   ├── refresh-token.service.ts      # Family-based refresh token rotation
│   │       │   └── token.service.ts              # In-memory access token signing
│   │       ├── common/                           # Cross-cutting decorators, guards, filters, redis
│   │       │   ├── decorators/                   # @CurrentUser(), @CurrentWorkspace()
│   │       │   ├── filters/                      # GlobalExceptionFilter (RFC 7807 problem details)
│   │       │   ├── guards/                       # JwtAuthGuard, WorkspaceScopeGuard
│   │       │   └── redis/                        # Resilient Redis provider & health probe
│   │       ├── content/                          # Drafts, Ideas, Versions & Scheduling API
│   │       │   ├── content.controller.ts         # Endpoints for ideas, drafts, versions, scheduling
│   │       │   └── content.service.ts            # Business logic for drafts, scheduling, CAS checks
│   │       ├── engagement/                       # [Phase 3] Autonomous Engagement Gateway
│   │       │   ├── engagement.controller.ts      # Keyset pagination, draft edit, approve, dismiss, resolve
│   │       │   ├── engagement.service.ts         # Keyset queries, If-Match 409 check, outbox dispatches
│   │       │   └── engagement.module.ts          # Dependency injection & queue wiring
│   │       ├── ingestion/                        # Historical post ingestion triggers
│   │       │   ├── ingestion.controller.ts       # POST /ingestion/trigger
│   │       │   └── ingestion.service.ts          # Dispatches BullMQ ingestion jobs
│   │       ├── jobs/                             # Background job tracking & SSE stream
│   │       │   ├── job-dispatcher.service.ts     # Enqueues BullMQ tasks with idempotency
│   │       │   ├── jobs.controller.ts            # GET /jobs/:requestId/status & /jobs/:id/events (SSE)
│   │       │   └── jobs.service.ts               # Queries job records from database
│   │       ├── notifications/                    # In-app notifications
│   │       ├── profile/                          # User profile & voice settings
│   │       ├── social-accounts/                  # Threads account management
│   │       ├── threads-auth/                     # Threads OAuth 2.0 PKCE exchange
│   │       └── workspace/                        # Multi-tenant workspace management
│   │
│   ├── web/                                      # Next.js 15 App Router Frontend
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (auth)/                       # Authentication views (login, register, callback)
│   │       │   ├── (dashboard)/                  # Authenticated application shell
│   │       │   │   ├── analytics/page.tsx        # [Phase 4] Analytics Dashboard & Pipeline Diagnostic
│   │       │   │   ├── connect/page.tsx          # Connect Threads account interface
│   │       │   │   ├── create/page.tsx           # Content generation studio, editor & preview
│   │       │   │   ├── dashboard/page.tsx        # Overview, metrics, autonomous reply telemetry widget
│   │       │   │   ├── learning/page.tsx         # [Phase 4] Closed-Loop Intelligence & Recs Deck
│   │       │   │   ├── posts/page.tsx            # Historical and published posts library
│   │       │   │   ├── profile/page.tsx          # Voice style card, 8 metrics, retrain button
│   │       │   │   ├── queue/page.tsx            # Queue triage & attention management
│   │       │   │   ├── replies/page.tsx          # [Phase 3] Community Review Deck
│   │       │   │   ├── schedules/page.tsx        # Calendar & list scheduling views
│   │       │   │   └── settings/page.tsx         # Workspace settings & emergency kill switch toggle
│   │       │   ├── globals.css                   # Global styles & design system tokens
│   │       │   └── layout.tsx                    # Root application layout
│   │       ├── components/                       # Shared UI components
│   │       │   ├── editor/                       # Content studio components
│   │       │   ├── engagement/                   # [Phase 3] Community Review Deck components
│   │       │   │   ├── AmbiguityAlertBanner.tsx  # Warning banner for external ambiguity
│   │       │   │   ├── AutonomySettingsModal.tsx # Autonomy level & kill switch modal
│   │       │   │   ├── DismissModal.tsx          # Dismissal reason selection modal
│   │       │   │   ├── EngagementHeader.tsx      # Tab controls, stats badges, kill switch indicator
│   │       │   │   ├── InteractionCard.tsx       # Compact card for incoming replies
│   │       │   │   ├── InteractionDetailDeck.tsx # Thread context, draft editor, diff viewer
│   │       │   │   ├── OperatorResolveModal.tsx  # Operator manual confirmation modal
│   │       │   │   └── RegenerateDraftModal.tsx  # Custom prompt instructions modal
│   │       │   ├── profile/                      # Profile & voice components
│   │       │   ├── Sidebar.tsx                   # Main navigation bar (includes /replies, /analytics, /learning)
│   │       │   └── TopBar.tsx                    # Header with workspace selector & status
│   │       ├── hooks/                            # React hooks (useAuth, useJobProgress)
│   │       └── lib/                              # Client utilities (api-client, sse)
│   │
│   └── worker/                                   # NestJS 11 BullMQ Worker Service
│       └── src/
│           ├── health/                           # Worker health & liveness checks
│           ├── processors/                       # BullMQ queue consumers
│           │   ├── analytics-aggregate.processor.ts # [Phase 4] Independent-group CTE aggregation & Welch/FDR
│           │   ├── analytics-insights.processor.ts  # [Phase 4] Evidence-gated AI insight generator
│           │   ├── analytics-learning.processor.ts  # [Phase 4] Longitudinal profile learning & weight decay
│           │   ├── analytics-sync.processor.ts      # [Phase 4] Fenced observation fetch & metric capture
│           │   ├── content.processor.ts          # Executes LangGraph ContentGenerationGraph
│           │   ├── embedding.processor.ts        # Generates Google Gemini vector embeddings
│           │   ├── engagement-classify.processor.ts # [Phase 3] Executes InteractionClassifierGraph
│           │   ├── engagement-ingest.processor.ts   # [Phase 3] Multi-tier sync & loop breaker
│           │   ├── event-outbox.processor.ts     # Transactional outbox event dispatcher
│           │   ├── ingestion.processor.ts        # Ingests historical posts via Threads API
│           │   ├── publishing.processor.ts       # [Phase 2] Fenced Threads publisher
│           │   ├── reply-draft.processor.ts      # [Phase 3] Executes ReplyGenerationGraph
│           │   ├── reply-publish.processor.ts    # [Phase 3] Fenced CAS reply publisher
│           │   ├── style.processor.ts            # Executes LangGraph StyleExtractionGraph
│           │   └── token-refresh.processor.ts    # Background OAuth token refresh cron
│           ├── services/                         # Internal worker helper services
│           │   ├── ai-factory.service.ts         # ModelRouter & Gemini adapter factory
│           │   ├── analytics-outbox-dispatch.service.ts # [Phase 4] 5s polling outbox dispatcher
│           │   ├── analytics-outbox.service.ts   # [Phase 4] Transactional outbox writer & claimer
│           │   ├── editorial-personalization.service.ts # [Phase 3] Word-level diff & memory curation
│           │   ├── embedding-reconciliation.service.ts # Heals missing vector embeddings
│           │   ├── engagement-reconciliation.service.ts # [Phase 3] Watchdog Scans 0-6
│           │   ├── expired-observation-sweeper.service.ts # [Phase 4] Dead worker observation lease reclaimer
│           │   ├── job-progress.service.ts       # Emits Redis pub/sub progress events for SSE
│           │   ├── learning-profile.service.ts   # [Phase 4] Longitudinal weight recomputation & decay
│           │   ├── observation-fsm.service.ts    # [Phase 4] Strict observation state machine transitions
│           │   ├── publishing-reconciliation.service.ts # [Phase 2] Watchdog Scans 1-6
│           │   ├── publishing.service.ts         # Encapsulates container creation/publish
│           │   ├── recommendation-engine.service.ts # [Phase 4] Candidate scoring & exposure ledger
│           │   └── statistical-evidence.service.ts # [Phase 4] Welch's t-test, Cohen's d, and BH-FDR
│           └── worker.module.ts                  # Worker application root module
│
├── packages/
│   ├── agents/                                   # LangGraph Workflow Graphs
│   ├── ai/                                       # AI Providers & Model Routing
│   ├── database/                                 # Prisma Schema & Vector Repository
│   │   ├── prisma/
│   │   │   ├── migrations/                       # SQL migrations (0001 to 0008_analytics_engine)
│   │   │   └── schema.prisma                     # Authoritative schema (26 enums, 24 relational models)
│   │   └── src/
│   │       ├── index.ts                          # Exports PrismaClient instance
│   │       └── memory.repository.ts              # pgvector raw SQL queries (cosine similarity)
│   ├── observability/                            # Logging & Metrics
│   ├── threads-client/                           # Meta Threads API SDK
│   └── types/                                    # Shared TypeScript Contracts & Schemas
│
└── prompts/                                      # Version-Controlled Prompt Catalog
    ├── content-generation/                       # Generation prompt templates & few-shot examples
    ├── style-extraction/                         # Stylometric extraction prompt definitions
    └── reply-generation/                         # [Phase 3] Engagement agent reply prompts
```

---

## 9. Platform Constraints & Meta Threads API Compliance

ThreadPilot adheres strictly to Meta's published Threads API constraints and developer policies:

1. **Character Limit:** Exact hard limit of 500 characters per single post and reply. ThreadPilot enforces a deterministic validation node at the agent level that rejects any text over 500 code units before persistence.
2. **Publishing Rate Limit:** Meta enforces a limit of 250 published posts per 24-hour rolling window per user. ThreadPilot tracks local usage via `PlatformRateLimit` and enters `QUOTA_BLOCKED` before breaching platform limits.
3. **Token Validity:** Short-lived user tokens expire in 1 hour; long-lived tokens expire in 60 days. ThreadPilot schedules automated background token refresh via [`TokenRefreshProcessor`](file:///d:/Projects/threads-automation/apps/worker/src/processors/token-refresh.processor.ts) whenever a token reaches 30 days of remaining life.
4. **Container Expiration:** Threads creation containers expire after 24 hours. The worker polling loop enforces a 24-hour timeout; expired non-ambiguous containers transition to retry or permanent failure.
5. **Two-Step Publishing:** Publishing is asynchronous: container creation (`POST /me/threads`) followed by publishing (`POST /me/threads_publish`). ThreadPilot arbitrates this across asynchronous worker steps with atomic status checkpoints.

---

## 10. Success Criteria & KPIs

| Metric | Target | Verification Method |
| :--- | :--- | :--- |
| **Drafting Speed** | $< 10$ seconds from idea to validated draft | `AgentRun.latencyMs` instrumentation |
| **Voice Fidelity** | $> 85\%$ user acceptance of drafts without major rewrite | Ratio of `user_rating = 1` vs `-1` in `StyleExample` |
| **Publishing Reliability** | $99.99\%$ at-most-once delivery; 0 duplicate posts | Absence of duplicate `threads_post_id` across `published_posts` |
| **Recovery Autonomy** | $100\%$ of transient network flakes healed automatically | Reconciliation scan metrics in `PublishingReconciliationService` & `EngagementReconciliationService` |
| **Loop Breaker Efficacy** | $100\%$ of self-replies intercepted before classification | Triple loop breaker assertions in `engagement-ingest.spec.ts` |
| **Reply Length Bounds** | $100\%$ of generated replies $\le 500$ UTF-16 code units | Deterministic UTF-16 counting in `reply-generation.graph.ts` |
| **Optimistic Concurrency** | $100\%$ deterministic HTTP 409 Conflict on stale edits | Keyset version checks in `EngagementService.updateDraft()` |
| **Observation Capture Rate** | $> 95\%$ of scheduled observation windows captured within cutoff | Telemetry query in `AnalyticsObservation` (`status = 'CAPTURED'`) |
| **FDR False Discovery Bound** | $q \le 0.10$ across all high-signal published insights | Benjamini-Hochberg rank-step gating verification in `statistical-evidence.spec.ts` |
| **Attribution 1:1 Integrity** | $100\%$ 1-to-1 linkage across ideas, drafts, posts, and post-metrics | Database constraint `uq_recommendation_exposure_tenant` & `ON DELETE RESTRICT` checks |
| **Deterministic asOf Decay** | $100\%$ identical weight recomputations across worker delays | Canonical `asOf` propagation test suite in `verify-full-system-e2e.ts` |
| **Recommendation Lift** | Positively correlated observed engagement lift on accepted recs | Monitored `observedLift` tracking in `/analytics` overview |
| **Daily Time Saved** | Reduce daily social management time from 45 min to $< 8$ min | User engagement session length tracking in `/replies` review deck |

---

## 11. Living Document Protocols

This PRD is designed as an **adaptable, living architecture document**. As future phases are developed:

1. **Never Silently Deviate:** Any change to core invariants (database ownership, FSM states, API contracts) must be reflected here first.
2. **Phase Status Updates:** When a phase moves from _Roadmap_ to _In-Progress_ or _Implemented_, update the Roadmap timeline and codebase file listings.
3. **API Evolution:** When Meta updates the Threads Graph API (e.g. adding analytics endpoints or carousel publishing), update Section 9 to reflect new boundaries.

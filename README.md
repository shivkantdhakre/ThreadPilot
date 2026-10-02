# 🧵 ThreadPilot

> **Personal Social AI Platform for Threads**  
> Build, train, and maintain an authentic personal AI voice on Meta's Threads with stylometric fingerprinting, vector memory retrieval, and autonomous generation workflows.

[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-red.svg)](https://nestjs.com)
[![Google Gemini](https://img.shields.io/badge/AI-Google%20GenAI-orange.svg)](https://ai.google.dev)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20pgvector-blue.svg)](https://neon.tech)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📖 Overview

**ThreadPilot** is a production-oriented, privacy-first personal social AI platform designed specifically for Meta's Threads network. Unlike generic content generators, ThreadPilot ingests your authentic publishing history, analyzes your unique stylometric traits (sentence structure, punctuation patterns, vocabulary density, vocabulary richness, hook styles), stores high-performing exemplar posts in a high-dimensional vector space (`pgvector`), and dynamically injects this context into every generation cycle.

### ✨ Highlights

- **🧬 Personal Voice & Stylometric Fingerprinting (Phase 1)**: Real-time extraction of 8 distinct stylistic metrics (post length, sentence cadence, question ratio, emoji frequency, first-person voice, technical depth, contrary hooks, and list patterns).
- **🧠 Vector Memory & Exemplar Retrieval (Phase 1)**: Semantic similarity matching over past successful posts using Google GenAI embeddings (`gemini-embedding-2`) with cosine distance ranking in PostgreSQL `pgvector`. Vector coordinate space purity is strictly preserved without cross-model mixing.
- **🛡️ Stateless Interactions API Requests (Phase 1)**: ThreadPilot uses stateless Interactions API requests (`store: false`) and does not rely on Gemini's server-side interaction history as its application memory. PostgreSQL + `pgvector` serves as the sole authoritative memory store.
- **🔒 In-Memory Token Security & OAuth 2.0 PKCE (Phase 1)**: Access tokens are held exclusively in-memory (never persisted in `localStorage` to eliminate XSS risks), paired with HttpOnly, SameSite=Lax rotating refresh tokens and strict multi-tenant workspace isolation.
- **⚡ Asynchronous Queue Architecture (Phases 1–4)**: Powered by Redis and BullMQ with live Server-Sent Events (SSE) streaming real-time job lifecycle stages (`QUEUED` → `LOADING_MEMORY` → `GENERATING` → `EVALUATING` → `PERSISTING` → `COMPLETE`).
- **📅 Resilient Two-Phase Scheduled Publishing (Phase 2)**: Atomic CAS lease claiming, 24-hour rolling Meta rate limit protection, container-to-publication lifecycle, and autonomous 3-scan feed reconciliation for ambiguous network partitions.
- **💬 Autonomous Engagement Engine (Phase 3)**: Multi-tier adaptive ingestion (HOT/WARM/COLD sync cadences), loop-breaker invariants preventing circular bot-to-bot replies, 14-state `InteractionStatus` FSM, and 13-state `ReplyExecutionStatus` FSM.
- **🛡️ Multi-Stage Safety Grounding & 500-Code-Unit Hard Ceiling (Phase 3)**: Pre-generation intent and risk classification, post-generation factuality and safety verification, prompt injection defense, and strict UTF-16 code unit ceiling enforcement.
- **✏️ Editorial Feedback Loop & Exemplar Learning (Phase 3)**: Tracks word diffs and operator revisions during review triage, embedding approved exemplars into vector memory for continual stylometric personalization.
- **🖥️ Community Review Deck & Real-Time Telemetry (Phase 3)**: Next.js 15 review interface with segmented filtering (`NEEDS_REVIEW`, `REPLIED`, `AUTO_REPLIED`, `DISMISSED`), rapid single-key triage shortcuts (`a`, `d`, `r`, `e`), optimistic 409 CAS conflict handling, and live SSE telemetry.
- **📈 Performance Analytics & Telemetry Ingestion (Phase 4)**: 8 standardized observation slots (`T_1H` to `T_30D`), strict observation FSM with CAS lease fencing, and PostgreSQL database-engine immutability triggers on metrics with authorized purge session bypass.
- **🧪 Rigorous Statistical Evidence Engine (Phase 4)**: Independent-group CTE aggregation, Welch's t-test with unequal sample variances, 95% confidence intervals, Cohen's d effect sizes, and Benjamini-Hochberg FDR correction controlling false discoveries at $q \le 0.10$ across the complete hypothesis family universe.
- **🔄 Closed-Loop Intelligence & 1:1 Attribution Ledger (Phase 4)**: Longitudinal monthly profile learning with 30-day temporal half-life decay, multi-factor recommendation candidate scoring, and first-class 1:1 attribution tracking (`EXPOSED` $\rightarrow$ `ACCEPTED` $\rightarrow$ `PUBLISHED` $\rightarrow$ `EVALUATED`) with `ON DELETE RESTRICT` composite keys and observed lift evaluation.

---

## 🏛️ Architecture

```mermaid
flowchart TD
    subgraph Client ["Frontend (Next.js 15 + TailwindCSS)"]
        UI["Web App (Port 3000)"]
        Studio["Content Studio & Editor (/create)"]
        Calendar["Publishing Calendar (/schedules)"]
        ReviewDeck["Community Review Deck (/replies)"]
        AnalyticsDeck["Performance Analytics (/analytics)"]
        LearningDeck["Closed-Loop Intelligence (/learning)"]
        SSEClient["SSE / Telemetry Client"]
    end

    subgraph Gateway ["API Layer (NestJS 11 - Port 3001)"]
        API["REST API Gateway"]
        Auth["Auth & Refresh Token Rotation"]
        OAuth["Threads OAuth 2.0 PKCE"]
        ContentSvc["Content & Scheduling Service"]
        EngageCtrl["Engagement Controller & Idempotency"]
        AnalyticsCtrl["Analytics & Recommendation Controller"]
        EngageGateway["Engagement SSE Gateway"]
        PersonalizeSvc["Editorial Personalization Service"]
    end

    subgraph Queue ["Message Broker & Distributed State (Redis 7)"]
        BullMQ["BullMQ Distributed Queues"]
        QPublish["publishing / event-outbox"]
        QEngage["engagement-ingest / classify"]
        QReply["reply-publish / feedback"]
        QAnalytics["analytics-sync / aggregate / insights / recs"]
        Locks["Redlock Distributed Leases"]
    end

    subgraph Workers ["Async Worker Service (NestJS 11 - Port 3002)"]
        Worker["Worker Core"]
        IngestProc["Historical & Adaptive Ingestion"]
        PubProc["Two-Phase Publishing Processor"]
        PubReconciler["Publishing Feed Reconciler (Scans 1-3)"]
        EngageIngestProc["Engagement Ingestion & Loop Breaker"]
        ReplyPubProc["Fenced Reply Publisher & Ambiguity Handler"]
        EditorialProc["Editorial Feedback Processor"]
        AnalyticsSyncProc["Analytics Observation Sync Processor"]
        AnalyticsAggregateProc["Cohort Aggregator & Welch/FDR Engine"]
        AnalyticsInsightsProc["Evidence-Gated AI Insights Processor"]
        AnalyticsLearningProc["Longitudinal Profile Learning Processor"]
        OutboxDispatchSvc["Transactional Outbox Dispatcher (5s poll)"]
        SweeperSvc["Expired Observation Sweeper Service"]
    end

    subgraph Intelligence ["AI Layer (@threadpilot/ai & @threadpilot/agents)"]
        GeminiRouter["Model Router & Resilient Fallback"]
        StyleGraph["Style Extraction Graph"]
        ContentGraph["Content Generation & Polishing Graph"]
        ClassifierGraph["Intent & Risk Classification Graph"]
        ReplyGraph["Contextual Reply Generation Graph"]
        SafetyGate["Post-Generation Safety & Grounding Gate"]
        EvidenceSvc["Statistical Evidence & BH-FDR Service"]
        LearningSvc["Longitudinal Learning & Decay Service"]
        RecEngine["Multi-Factor Recommendation Engine"]
    end

    subgraph Platform ["External Integrations"]
        ThreadsAPI["Meta Threads Graph API & Insights"]
        GeminiAPI["Google Gemini 2.5 & Embeddings"]
    end

    subgraph Storage ["Persistence Layer"]
        Postgres[("PostgreSQL 16 + pgvector (Neon)")]
        FSMs["Observation, Interaction & Reply FSMs"]
        CheckConstraints["PostMetric Immutability & ON DELETE RESTRICT Constraints"]
    end

    UI -->|REST / HTTPS| API
    SSEClient -->|SSE Streams| EngageGateway
    API --> Auth
    API --> OAuth
    API --> ContentSvc
    API --> EngageCtrl
    API --> AnalyticsCtrl
    EngageCtrl --> PersonalizeSvc
    
    API -->|Dispatch Jobs| BullMQ
    BullMQ --> QPublish
    BullMQ --> QEngage
    BullMQ --> QReply
    BullMQ --> QAnalytics
    
    Worker --> IngestProc
    Worker --> PubProc
    Worker --> PubReconciler
    Worker --> EngageIngestProc
    Worker --> ReplyPubProc
    Worker --> EditorialProc
    Worker --> AnalyticsSyncProc
    Worker --> AnalyticsAggregateProc
    Worker --> AnalyticsInsightsProc
    Worker --> AnalyticsLearningProc

    Worker --> Intelligence
    StyleGraph --> GeminiRouter
    ContentGraph --> GeminiRouter
    ClassifierGraph --> GeminiRouter
    ReplyGraph --> GeminiRouter
    SafetyGate --> GeminiRouter
    GeminiRouter --> GeminiAPI

    PubProc --> ThreadsAPI
    ReplyPubProc --> ThreadsAPI
    AnalyticsSyncProc --> ThreadsAPI
    IngestProc --> ThreadsAPI
    PubReconciler --> ThreadsAPI

    Worker --> Postgres
    API --> Postgres
    Postgres --> FSMs
    Postgres --> CheckConstraints
```

---

## 📦 Monorepo Structure

ThreadPilot is organized as an efficient Turborepo monorepo powered by `pnpm`:

```
threadpilot/
├── apps/
│   ├── api/                 # NestJS REST API (Auth, OAuth, Workspaces, Jobs, Content, Engagement, SSE)
│   │   ├── src/auth/            # Argon2id auth, family-based refresh token rotation
│   │   ├── src/common/          # Tenancy guards, idempotency interceptors, logging
│   │   ├── src/content/         # Content draft authoring, versioning, and scheduling
│   │   ├── src/engagement/      # Phase 3: Review deck controller, SSE gateway, editorial service
│   │   └── src/threads-auth/    # OAuth 2.0 PKCE redirect & callback handlers
│   ├── web/                 # Next.js 15 Frontend (App Router, Studio, Schedule, Replies Deck)
│   │   ├── src/app/             # Pages: /creator, /schedule, /replies, /dashboard, /settings
│   │   ├── src/components/      # UI: engagement cards, thread tree, keyboard triage, modals
│   │   └── src/hooks/           # Custom hooks: useEngagementSSE, useKeyboardShortcuts, useJobProgress
│   └── worker/              # NestJS BullMQ Worker executing resilient pipelines & agents
│       ├── src/processors/      # Publishing, Ingestion, Engagement Ingest, Reply Publisher
│       └── src/services/        # Reconciliation scans, feed verification, lease managers
├── packages/
│   ├── agents/              # LangGraph workflows
│   │   ├── src/content/         # Content generation, idea discovery, validation gate
│   │   ├── src/profile/         # Voice extraction, stylometric fingerprinting
│   │   └── src/engagement/      # Phase 3: Classifier graph, Reply graph, Safety grounding gate
│   ├── ai/                  # AI adapters (Google GenAI, Model Router, Resilient Fallback)
│   ├── config/              # Shared configuration schemas & environment validation
│   ├── database/            # Prisma schema, migrations (0001-0007), and MemoryRepository (pgvector)
│   ├── observability/       # Pino logger and OpenTelemetry instrumentation
│   ├── prompts/             # Version-controlled prompt catalog & few-shot exemplars
│   ├── threads-client/      # Meta Threads API SDK (OAuth exchange, publishing, rate limits)
│   └── types/               # Shared TypeScript interfaces, DTOs, and schemas
└── scripts/
    └── comprehensive-audit-test.js  # 29-step end-to-end integration & security test suite
```

---

## 🚀 Quick Start Guide

### Prerequisites

- **Node.js**: v20.x or v22.x+
- **Package Manager**: `pnpm` (`corepack enable` or `npm install -g pnpm`)
- **Database**: PostgreSQL with `pgvector` enabled (e.g. [Neon](https://neon.tech), Supabase, or local Docker)
- **Cache**: Redis instance (v6+ or local Redis server)
- **AI Access**: Google Gemini API key ([Google AI Studio](https://aistudio.google.com/))
- **Meta Developer Account**: Threads App ID & App Secret ([Meta Developers](https://developers.facebook.com))

---

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/shivkantdhakre/ThreadPilot.git
cd ThreadPilot
pnpm install
```

---

### 2. Configure Environment Variables

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

Populate the key variables:

```env
NODE_ENV=development

# Public URLs
APP_PUBLIC_URL=http://localhost:3000
API_PUBLIC_URL=http://localhost:3001
WORKER_PORT=3002

# PostgreSQL 16 with pgvector
# Recommended for local development: Docker Compose (docker-compose up -d)
# Optional: Neon / Supabase / other PostgreSQL provider
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/threadpilot"
DATABASE_URL_LOCAL="postgresql://postgres:postgres@localhost:5432/threadpilot"

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_URL_LOCAL="redis://localhost:6379"

# JWT Secrets (generate with `openssl rand -base64 64`)
JWT_ACCESS_SECRET="your-access-secret"
JWT_REFRESH_SECRET="your-refresh-secret"

# Token Encryption Key (32-byte base64 string: `openssl rand -base64 32`)
TOKEN_ENCRYPTION_KEY="your-32-byte-base64-key"
TOKEN_ENCRYPTION_KEY_VERSION=1

# Threads App Credentials
THREADS_APP_ID="your-threads-app-id"
THREADS_APP_SECRET="your-threads-app-secret"
THREADS_REDIRECT_URI="https://your-domain-or-tunnel.com/api/v1/threads-auth/callback"
THREADS_API_BASE_URL="https://graph.threads.net"

# Google Gemini AI (Configuration-driven models & fallbacks)
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL_CONTENT="gemini-3.5-flash-lite"
GEMINI_MODEL_CONTENT_FALLBACKS="gemini-3.1-flash-lite,gemini-3.7-flash"
GEMINI_MODEL_CLASSIFICATION="gemini-3.5-flash-lite"
GEMINI_MODEL_EMBEDDING="gemini-embedding-2"
GEMINI_MODEL_EMBEDDING_FALLBACKS="" # Disabled to guarantee vector space coordinate purity
GEMINI_EMBEDDING_DIMENSIONS=768
```

---

### 3. Setup Database & Prisma Migrations

Generate the Prisma client and apply database migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

_(Optional) Inspect your database with Prisma Studio:_

```bash
pnpm db:studio
```

---

### 4. Build All Packages

Compile the TypeScript packages and applications:

```bash
pnpm build
```

---

### 5. Launch Development Services

Run all services concurrently using Turbo:

```bash
pnpm dev
```

Or run individual services in separate terminals:

```bash
# Terminal 1: Backend API (Port 3001)
pnpm --filter @threadpilot/api start:dev

# Terminal 2: Worker Engine (Port 3002)
node --env-file=.env apps/worker/dist/main.js

# Terminal 3: Frontend Web Dashboard (Port 3000)
pnpm --filter @threadpilot/web dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Automated Testing & Verification

ThreadPilot is thoroughly verified across unit, integration, live provider, and security layers with **327 automated tests across 11 packages (100% passing)** plus the Master E2E Verification Suite:

### 1. Monorepo Test Coverage Breakdown

Run all automated unit, crash recovery, and integration test suites across the monorepo:

```bash
pnpm test
```

| Package / App | Tests | Key Test Suites | Critical Guarantees Verified |
|---|---|---|---|
| **`@threadpilot/database`** | **33** | `engagement-schema-constraints.spec.ts`, `real-pgvector-duplicate.spec.ts`, `memory.repository.spec.ts` | 8 SQL check constraints (priority 1–10, confidence 0–1, non-empty body, user rating -1/1), pgvector 768-dim space purity, duplicate deduplication |
| **`@threadpilot/ai`** | **13** | `gemini-provider.spec.ts`, `gemini-live-smoke.spec.ts` | Stateless Interactions API (`store: false`), error classification (429 backoff, 4xx abort), Gemini Embedding 2 prefix pipeline, model fallback chain |
| **`@threadpilot/agents`** | **11** | `engagement-agents.spec.ts`, `duplicate-calibration.spec.ts` | Style extraction graph, duplicate calibration (0.88 threshold), intent classification, reply generation graph, 500-code-unit safety gate |
| **`@threadpilot/threads-client`** | **20** | `threads-api.client.spec.ts`, `token-refresh-concurrency.spec.ts`, `oauth-negative-paths.spec.ts`, `threads-live-contract.spec.ts` | OAuth 2.0 PKCE handshake, token encryption (AES-256-GCM), refresh concurrency locking, platform rate-limit error propagation |
| **`@threadpilot/worker`** | **127** | `statistical-evidence.spec.ts`, `observation-fsm.spec.ts`, `dimension-resolvers.spec.ts`, `publishing-processor.spec.ts`, `publishing-reconciliation.spec.ts`, `engagement-ingest.spec.ts`, `engagement-classify.spec.ts`, `engagement-fenced-publish.spec.ts`, `engagement-acceptance-suite.spec.ts` | Welch's t-test, BH-FDR correction, observation FSM transitions, two-phase publishing FSM, CAS lease claims, 3-scan feed reconciler, loop breaker invariant ($N \le 2$), intent triage, fenced CAS reply publisher |
| **`@threadpilot/api`** | **62** | `analytics-pipeline.spec.ts`, `analytics-service.spec.ts`, `auth-service.spec.ts`, `cross-tenant-isolation.spec.ts`, `content-service.spec.ts`, `engagement-controller-gateway.spec.ts`, `engagement-service.spec.ts` | Multi-dimensional aggregation, empirical optimal discovery, Argon2id auth, family-based refresh rotation, `WorkspaceScopeGuard` 403 enforcement, optimistic 409 conflict handling, SSE telemetry streaming |
| **`@threadpilot/web`** | **61** | `analytics-ui-integration.spec.ts`, `engagement-review-deck.spec.ts`, `engagement-ui-integration.spec.ts`, `calendar-schedules.spec.ts`, `auth-client-security.spec.ts`, `timezone-display.spec.ts` | Analytics dimension formatting, optimal window badges, community review deck tab filters, keyboard triage shortcuts (`a`, `d`, `r`, `e`), calendar scheduling, in-memory token safety |
| **Total Monorepo Suite** | **327** | **100% Passing Tests** | **Zero known flaky tests, strict database constraints, end-to-end multi-tenant isolation** |

---

### 2. Master End-to-End System Verification Suite

Run the comprehensive master verification script across all 6 critical system domains:

```bash
npx tsx scripts/verify-full-system-e2e.ts
```

```text
================================================================
   THREADPILOT MASTER END-TO-END FEATURE & LIFECYCLE AUDIT      
================================================================

--- 1. Multi-Tenant Foundation & AES-256 Token Vault ---
  [PASS] Token encrypted with AES-256-GCM format version 1
  [PASS] Decrypted token matches raw secret byte-for-byte
  [PASS] Tenant, encrypted social account, sync state, and scoring configuration initialized in PostgreSQL

--- 2. Observation Scheduling, Metrics Ingestion & Aggregation ---
  [PASS] Aggregated cohort persisted with Welch p-value: 0.00002 and FDR: PASS

--- 3. Downstream Intelligence Chain & Outbox Execution ---
  [PASS] Insights generated: 1
  [PASS] Active Insight committed to database
  [PASS] Insight assigned HIGH_SIGNAL grade
  [PASS] Profile learning processed weights successfully
  [PASS] LearnedDimensionWeight created for topic tech
  [PASS] Decayed weight is positive
  [PASS] Recommendations generated: 2
  [PASS] Exposed recommendations found in database (2)

--- 4. API Gateway Service Endpoints ---
  [PASS] Overview reports views >= 12500
  [PASS] Overview reports captured windows >= 1
  [PASS] Aggregates endpoint returns cohorts
  [PASS] Insights endpoint returns active insights
  [PASS] Learning profile returns weights
  [PASS] Recommendations endpoint returns candidate exposures

--- 5. Closed-Loop Lifecycle & Attribution Feedback ---
  [PASS] Recommendation status transitioned to ACCEPTED
  [PASS] Draft successfully created with 1-to-1 linkage
  [PASS] Recommendation transitioned to PUBLISHED and linked publishedPostId
  [PASS] Recommendation transitioned to EVALUATED
  [PASS] Observed lift accurately recorded: +195.2%
  [PASS] ON DELETE RESTRICT prevented physical deletion of referenced Insight in attribution ledger

--- 6. Community Engagement, Autonomy & Ambiguity Arbitration ---
  [PASS] Optimistic concurrency detects version number mismatch (409 Conflict check)
  [PASS] Draft version incremented to v2 with user edited text
  [PASS] Operator ambiguity resolved with CONFIRMED_PUBLISHED
  [PASS] Test workspace and all relational dependencies safely purged

================================================================
  MASTER E2E VERIFICATION RESULTS: 29 PASSED, 0 FAILED
================================================================
```

---

### 3. Live Gemini Interactions & Embedding Smoke Test

Perform genuine live tests against Google's Gemini Interactions and Embedding APIs using your server-side API key:

```bash
pnpm test:gemini-live
```

Validates:
- Live authentication with Google Gemini servers
- Interactions API payload execution with `input: string` and strict privacy (`store: false`)
- Structured JSON output with Zod schema validation and token usage extraction
- Gemini Embedding 2 execution across `DOCUMENT`, `QUERY`, and `SIMILARITY` formats
- Wire-level JSON verification confirming NO `taskType` request field is transmitted in API payloads
- Live end-to-end semantic duplicate discrimination: verifies that a paraphrased duplicate yields high similarity (`0.9434 >= 0.88`) while a same-topic contrasting post remains safely below threshold (`0.8214 < 0.88`) with a >0.12 separation margin

---

### 3. 29-Step Live Integration Audit

Smoke test live running API and Worker services against the 29-step audit script:

```bash
node scripts/comprehensive-audit-test.js
```

```text
══════════════════════════════════════════════════════
   AUDIT RESULTS SUMMARY
══════════════════════════════════════════════════════
  ✓ Health: 2/2
  ✓ Auth: 5/5
  ✓ Workspace: 2/2
  ✓ OAuth: 2/2
  ✓ SocialAccounts: 1/1
  ✓ Profile: 2/2
  ✓ Content: 5/5
  ✓ Jobs: 4/4
  ✓ Ingestion: 2/2
  ✓ Notifications: 2/2
  ✓ Security: 2/2

  TOTAL: 29/29 PASSED | 0 FAILED
  🎉 ALL TESTS PASSED
══════════════════════════════════════════════════════
```

---

## 🔑 Key Features Deep Dive

### 1. Dynamic Stylometric Profiler (Phase 1)

ThreadPilot extracts key markers from your authentic Threads posts:

| Metric | Description |
| :--- | :--- |
| **Avg Post Length** | Character count distribution across historical posts |
| **Sentence Length** | Word cadence and rhythm |
| **Question Frequency** | Frequency of rhetorical and engagement queries |
| **Emoji Density** | Placement and density of emojis per post |
| **First-Person Voice** | Proportion of active personal narrative (`I`, `we`, `my`) |
| **Technical Vocab** | Density of specialized industry and domain terminology |
| **Contrary Hooks** | Frequency of contrarian and counter-intuitive opening lines |
| **List / Bullet Usage** | Formatting tendencies toward multi-line structured lists |

### 2. Resilient AI Fallback Engine (Phase 1)

To prevent workflow disruptions caused by API rate-limits (`429 RESOURCE_EXHAUSTED`) or transient server spikes (`503 UNAVAILABLE`), `@threadpilot/ai` includes an intelligent configuration-driven failover loop:

```
Configured Primary (e.g. gemini-3.5-flash-lite)
    │
    ├── Exponential backoff on 429 / 5xx
    ├── Fast-fail abort on 401 / 400 / Schema error (no model fallback)
    └── If retry budget exhausted (or 404 model unavailable)
            │
            ▼
    Configured Fallback (e.g. gemini-3.1-flash-lite ──> gemini-3.7-flash)
            └── Executed strictly through identical Interactions API (store: false)
```

### 3. Resilient Two-Phase Publishing Engine (Phase 2)

Thread publishing on Meta Threads requires creating a media container followed by a publish commit. ThreadPilot wraps this in a fault-tolerant state machine:
- **Atomic CAS Lease Claiming:** Distributed workers claim scheduled posts using atomic Compare-And-Swap database leases, eliminating race conditions across multiple worker pods.
- **24-Hour Rolling Quota Guard:** Intercepts outgoing requests against Meta's platform limit (250 posts/24h). If limits are approached, jobs enter `QUOTA_BLOCKED` without consuming attempt retries.
- **Ambiguity Reconciliation Scans:** If a network partition or HTTP 500 occurs during container publication, the reconciler executes a 3-stage scan against the author's live public feed before attempting a retry, guaranteeing zero duplicate Threads posts.
- **Transactional Event Outbox:** Notifications and analytics events are persisted in `event_outbox` alongside business operations, ensuring atomic dispatch even during network failures.

### 4. Autonomous Engagement & Community Intelligence Engine (Phase 3)

ThreadPilot actively monitors conversations around your posts, triaging comments and generating grounded replies:
- **Adaptive Sync Tiers:** Root posts are automatically categorized into `HOT` (active discussion, 2-minute cadence), `WARM` (moderate velocity, 10-minute cadence), and `COLD` (archived, 1-hour cadence) sync loops to optimize API quota.
- **Conversational Loop Breaker:** Enforces an invariant ceiling ($N \le 2$ consecutive bot replies per author thread) and immediately marks self-authored comments as `NOT_REQUIRED`, permanently preventing runaway AI-to-AI reply loops.
- **Intent & Safety Classification Graph:** Analyzes inbound comments for 8 discrete intents (`QUESTION`, `AGREEMENT`, `DISAGREEMENT`, `COMPLIMENT`, `REQUEST`, `TROLLING`, `SPAM`, `UNCLEAR`) and computes granular safety scores (`toxicityScore`, `harassmentScore`, `controversyScore`, `isPromptInjection`).
- **Contextual Reply Generation Graph:** Synthesizes context from the root post, parent comments, author voice profile, and retrieved style exemplars to generate nuanced, authentic draft responses.
- **Post-Generation Safety Gate:** Validates drafts against hallucinated first-person claims, controversial topics, and enforces the strict platform limit of $\le 500$ UTF-16 code units.
- **Multi-Modal Autonomy Gate:** Operates under four tenant-configurable modes:
  - `RULES_BASED`: High-confidence, safe responses publish autonomously; sensitive or complex comments route to review.
  - `REVIEW_ONLY`: Every generated draft awaits explicit operator approval before dispatch.
  - `SHADOW`: AI runs all classification and drafting workflows invisibly to benchmark performance without publishing.
  - `OFF`: Automatic engagement ingestion and drafting are paused.

### 5. Community Review Deck & Editorial Personalization (Phase 3)

- **Dedicated Review Interface (`/replies`):** Segmented filter tabs (`NEEDS_REVIEW`, `REPLIED`, `AUTO_REPLIED`, `DISMISSED`, `ALL`), collapsible thread hierarchy tree, and real-time pending alert badges.
- **Productive Single-Key Triage:** Fast-triage keyboard shortcuts (`a` to approve, `d` to dismiss, `r` to regenerate, `e` to edit inline) allow operators to process hundreds of comments per hour. Shortcuts automatically yield when typing in text areas.
- **Editorial Memory Learning:** Captures word-level diffs when operators edit AI drafts. High-quality human revisions are indexed as few-shot exemplars in `pgvector`, continuously refining future reply style to mirror operator preferences.
- **Optimistic Concurrency Control:** Enforces version-checked draft modifications, returning `409 Conflict` if another operator or background job updated the draft concurrently.
- **Real-Time Telemetry Gateway:** WebSocket / SSE streaming delivers live sync status, queue counts, and emergency kill switch indicators directly to the operator dashboard.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue for bug reports and feature requests.

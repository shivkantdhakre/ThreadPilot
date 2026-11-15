# 🧵 ThreadPilot: Personal Social AI Platform for Threads

> **Enterprise-grade, privacy-first personal social operating system designed specifically for Meta's Threads network.**  
> Powered by stylometric fingerprinting, dual-representation `pgvector` memory with exact-term hybrid search, fail-safe CAS-fenced async publishing, autonomous community engagement, empirical Welch/FDR analytics, and fail-closed governance.

[![Node.js](https://img.shields.io/badge/Node.js-v22+-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E.svg?logo=nestjs&logoColor=white)](https://nestjs.com)
[![Google Gemini](https://img.shields.io/badge/AI-Google%20GenAI%202.5-4285F4.svg?logo=google&logoColor=white)](https://ai.google.dev)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016%20%2B%20pgvector-4169E1.svg?logo=postgresql&logoColor=white)](https://neon.tech)
[![Redis](https://img.shields.io/badge/Cache%20%26%20Queue-Redis%207%20%2B%20BullMQ-DC382D.svg?logo=redis&logoColor=white)](https://redis.io)
[![Turborepo](https://img.shields.io/badge/Monorepo-Turborepo%20%2B%20pnpm-EF4444.svg?logo=turborepo&logoColor=white)](https://turbo.build)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📑 Table of Contents

1. [Executive Summary & Problem Statement](#-1-executive-summary--problem-statement)
2. [Live Links & Repository Metadata](#-2-live-links--repository-metadata)
3. [Core Feature Matrix (Phases 1–5)](#-3-core-feature-matrix-phases-15)
4. [User Interface & Walkthrough](#-4-user-interface--walkthrough)
5. [Complete Technology Stack](#-5-complete-technology-stack)
6. [High-Level System Architecture](#-6-high-level-system-architecture)
7. [Detailed Backend & Worker Architecture](#-7-detailed-backend--worker-architecture)
8. [Database Architecture & Data Models](#-8-database-architecture--data-models)
9. [Core System Workflows & Sequence Diagrams](#-9-core-system-workflows--sequence-diagrams)
10. [REST API Documentation](#-10-rest-api-documentation)
11. [Monorepo Directory Structure](#-11-monorepo-directory-structure)
12. [Installation & Local Development](#-12-installation--local-development)
13. [Environment Configuration](#-13-environment-configuration)
14. [Security Architecture & Cryptography](#-14-security-architecture--cryptography)
15. [Error Handling, Self-Healing & Reliability](#-15-error-handling-self-healing--reliability)
16. [Verification, Quality Assurance & Test Suites](#-16-verification-quality-assurance--test-suites)
17. [Production Deployment & Infrastructure](#-17-production-deployment--infrastructure)
18. [Performance & Scalability Engineering](#-18-performance--scalability-engineering)
19. [Key Architectural Decisions & Trade-offs](#-19-key-architectural-decisions--trade-offs)
20. [Known Limitations & Roadmap](#-20-known-limitations--roadmap)
21. [Technical Interview Preparation Guide](#-21-technical-interview-preparation-guide)
22. [License & Acknowledgments](#-22-license--acknowledgments)

---

## 📖 1. Executive Summary & Problem Statement

### The Problem
Building an impactful presence on social platforms (specifically Meta Threads) is cognitively demanding for technical founders, developers, and creators. Existing social media schedulers (Buffer, Hootsuite, generic ChatGPT wrappers) suffer from three fatal flaws:
1. **The Blank Canvas Problem:** They treat content generation as generic text completion without memory of the author's voice, resulting in bland "AI-slop".
2. **Absence of a Learning Loop:** They operate open-loop; past viral posts and post-publishing audience metrics are never translated into empirical writing parameters.
3. **Fragile Distributed Integration:** They lack resilient state machines for Meta's asynchronous two-step media container publishing, leading to duplicated posts, zombie drafts, or rate-limit lockouts.

### The Solution: ThreadPilot
**ThreadPilot** is an autonomous personal social operating system that continuously executes a closed-loop intelligence cycle:

$$\text{Ingest History} \longrightarrow \text{Extract Voice} \longrightarrow \text{Generate Contextual Drafts} \longrightarrow \text{4-Wall Safety Gate} \longrightarrow \text{Publish via CAS Lease} \longrightarrow \text{Triage Replies} \longrightarrow \text{Welch/FDR Analytics} \longrightarrow \text{Adapt Profile}$$

ThreadPilot maintains an immutable **Personal Social Profile** trained on the creator's authentic publishing history. Routine tasks (cadence analysis, 500-code-unit limit enforcement, comment categorization, optimal window scheduling) become autonomous, while sensitive decisions (controversial topics, policy flags, persona weight changes) remain under strict human-in-the-loop governance.

---

## 🔗 2. Live Links & Repository Metadata

- **GitHub Repository:** [https://github.com/shivkantdhakre/ThreadPilot](https://github.com/shivkantdhakre/ThreadPilot)
- **Production Web Application:** `[Add verified live deployment URL — e.g. https://threadpilot.vercel.app]`
- **Production REST API Gateway:** `[Add verified live API URL — e.g. https://threadpilot-api.onrender.com]`
- **Swagger / OpenAPI Documentation:** `http://localhost:3001/api/docs` (Available when API server is running)

---

## ⚡ 3. Core Feature Matrix (Phases 1–5)

| Phase | Subsystem | Implemented Functionality | Verification Status |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Voice & Memory** | • 8-point mathematical stylometric profiling (sentence length, cadence, emoji, question ratio)<br>• Dual-representation `pgvector` memory (`DOCUMENT` vs `SIMILARITY`)<br>• **Task 1 Exact-Term Matching:** Parameterized `ILIKE` keyword search with exact-first ranking<br>• Multi-turn LangGraph drafting with deterministic 500 UTF-16 code unit ceiling | **100% Verified** (33 tests) |
| **Phase 2** | **Publishing & Vault** | • OAuth 2.0 PKCE handshake with Meta Graph API<br>• Versioned AES-256-GCM envelope token encryption (`{v}:{iv.tag.cipher}`)<br>• Atomic Compare-And-Swap (CAS) database leasing state machine (`ScheduledPost`)<br>• Autonomous 3-scan feed reconciliation preventing duplicate posts on network ambiguity | **100% Verified** (20 tests) |
| **Phase 3** | **Community Engagement** | • Adaptive polling synchronization (`HOT` 3m, `WARM` 20m, `COLD` 3h)<br>• Triple loop breaker preventing infinite bot self-replies ($N \le 2$ invariant)<br>• Intent & toxicity classification (`QUESTION`, `TROLLING`, `SPAM`, prompt injection)<br>• Memory Contamination Guard preventing malicious comments from polluting voice memory<br>• Web review deck with single-key triage shortcuts (`a`, `d`, `r`, `e`) and optimistic 409 CAS handling | **100% Verified** (55 tests) |
| **Phase 4** | **Analytics & Learning** | • 8 observation slots (`T_1H` to `T_30D`) with PostgreSQL database-engine immutability triggers<br>• Independent-group CTE SQL aggregation computing cohorts with zero pseudoreplication<br>• Welch's two-sample $t$-test, safe Cohen's $d$, and Complete Family Benjamini-Hochberg FDR ($q \le 0.05$)<br>• Longitudinal profile learning with 30-day exponential half-life decay<br>• 1:1 attribution ledger (`EXPOSED` $\rightarrow$ `ACCEPTED` $\rightarrow$ `PUBLISHED` $\rightarrow$ `EVALUATED`) with `ON DELETE RESTRICT` | **100% Verified** (127 tests) |
| **Phase 5** | **Governance & Operator** | • JSON AST Automation Rules Engine with P5-75 co-transactional execution idempotency<br>• Pre-publish 4-Wall Safety Gate (hallucination, brand safety, 500-char compliance, topic velocity)<br>• Option A CAS single-use manual overrides with role snapshots (`OWNER`/`ADMIN`)<br>• Strictly two-arm A/B experimentation with permuted block allocation ($K=4$)<br>• Closed-loop profile adaptation with winsorized lift ($[-0.50, +0.50]$) and CAS version increments<br>• 15-min autonomous operator with 10-min distributed account leases, ISO week quotas, and emergency kill switch | **100% Verified** (82 tests) |

---

## 🖥️ 4. User Interface & Walkthrough

The web interface is built with Next.js 15, Tailwind CSS, and Framer Motion, organized into dedicated operational decks:

1. **Content Studio (`/create`):** Real-time drafting with few-shot exemplar injection, format toggles (`post`, `thread`, `hook_body_cta`), and a live deterministic UTF-16 character countdown.
2. **Interactive Publishing Calendar (`/schedules`):** Visual timezone-aware calendar displaying pending, published, and failed slots, with direct deep-links from safety-rejected posts to the governance inspection modal.
3. **Community Review Deck (`/replies`):** Fast keyboard triage (`a` approve, `e` edit inline, `r` regenerate, `d` dismiss) across incoming Threads comments with conversational context hierarchy trees.
4. **Empirical Analytics Deck (`/analytics`):** Interactive KPI cards, observation slot capture progress, multi-dimensional cohort performance tabs (Topic, Format, Hook Style, Length, Timing), and early top-performer signal fallbacks.
5. **Closed-Loop Intelligence Deck (`/learning`):** FDR-passing AI insight cards, active candidate recommendations with 1-click draft creation, and learned dimension weight distributions.
6. **Governance & Operator Deck (`/governance`):** Real-time autonomous operator telemetry, weekly ISO quota meters, AST rule builder, 4-wall safety rejection telemetry, Option A override dialogs, and emergency kill switch controls.

> *Note for reviewers: Screenshots can be captured from the local development server at `http://localhost:3000`. Key brand assets are located in `apps/web/public/assets/`.*

---

## 🛠️ 5. Complete Technology Stack

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                                THREADPILOT STACK                                  │
├─────────────────────┬─────────────────────────────────────────────────────────────┤
│ Frontend Framework  │ Next.js 15.5.25 (App Router, Server & Client Components)   │
│ Client UI & Styling │ React 19.3.0, Tailwind CSS 3.4.19, Framer Motion, Lucide    │
│ Backend Framework   │ NestJS 11.0.0 (Express, Modular DI Architecture, Guards)   │
│ Persistence Layer   │ PostgreSQL 16 with pgvector extension (Neon / Docker)       │
│ ORM & Schema Engine │ Prisma ORM 6.3.0 with custom post-generation scripts        │
│ Queue & State Store │ Redis 7.4 + BullMQ 5.40.0 (Atomic Lua scripts, Redlock)     │
│ Artificial Intel.   │ Google Gemini 2.5 (gemini-2.5-flash) & gemini-embedding-2   │
│ Agent Orchestration │ LangGraph, LangChain Core, Custom State Machine Graphs      │
│ Security & Crypto   │ Argon2id, AES-256-GCM Envelope Vault, OAuth 2.0 PKCE        │
│ Monorepo Tooling    │ Turborepo 2.11.2, pnpm 10.6.5 Workspaces                    │
│ Observability       │ Pino Structured Logging, OpenTelemetry tracing hooks        │
│ Cloud Infrastructure│ Vercel (Web), Render (API), Railway (Worker), Neon (DB)     │
└─────────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## 🏛️ 6. High-Level System Architecture

The following diagram illustrates the physical and logical boundaries of ThreadPilot across client, gateway, queue, worker, and external cloud infrastructure:

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Layer (Next.js 15)"]
        Browser["User Browser"]
        WebClient["apps/web (Port 3000)\nNext.js App Router"]
        Browser <-->|HTTPS / HTML| WebClient
    end

    subgraph APILayer ["API Gateway Layer (NestJS 11)"]
        API["apps/api (Port 3001)\nGlobal Prefix: /api/v1"]
        AuthModule["Auth & PKCE Vault"]
        ContentModule["Content & Scheduling"]
        EngageModule["Engagement & SSE Gateway"]
        AnalyticsModule["Analytics & Learning"]
        GovModule["Governance & Rules"]
        
        API --> AuthModule
        API --> ContentModule
        API --> EngageModule
        API --> AnalyticsModule
        API --> GovModule
    end

    subgraph StateLayer ["Coordination & Storage Layer"]
        Postgres[("PostgreSQL 16 + pgvector\n66 Relational Models")]
        Redis[("Redis 7 (BullMQ)\nQueues + Distributed Locks")]
    end

    subgraph WorkerLayer ["Asynchronous Execution Layer (apps/worker)"]
        Worker["NestJS BullMQ Worker Engine (Port 3002)"]
        PubProcessor["Publishing Processor (CAS)"]
        EngageProcessor["Engagement Triage & Loop Breaker"]
        AnalyticsProcessor["Observation & Cohort Aggregator"]
        GovProcessor["Rules AST & Safety Gate Evaluator"]
        Reconcilers["Self-Healing Reconcilers (Scans 0-6)"]
        
        Worker --> PubProcessor
        Worker --> EngageProcessor
        Worker --> AnalyticsProcessor
        Worker --> GovProcessor
        Worker --> Reconcilers
    end

    subgraph ExternalServices ["External Platform Providers"]
        MetaGraph["Meta Threads Graph API\n(OAuth, Publish, Insights, Replies)"]
        GeminiAPI["Google Gemini 2.5 & Embeddings\n(Stateless Interactions API)"]
    end

    WebClient <-->|REST API + HttpOnly JWT| API
    WebClient <-->|Server-Sent Events| EngageModule
    
    API <-->|Prisma ORM (Pooled)| Postgres
    API -->|Dispatch Jobs / Redlock| Redis
    
    Redis <-->|Queue Polling| Worker
    Worker <-->|Prisma ORM (Unpooled/Pooled)| Postgres
    
    Worker <-->|Two-Phase Publishing & Sync| MetaGraph
    Worker <-->|LLM Graphs & pgvector Vectors| GeminiAPI
    API <-->|OAuth PKCE Exchange| MetaGraph
```

---

## ⚙️ 7. Detailed Backend & Worker Architecture

ThreadPilot implements strict separation between synchronous HTTP request handling (`apps/api`) and durable asynchronous execution (`apps/worker`).

### Backend Request Lifecycle (`apps/api`)
1. **Entry Point:** `apps/api/src/main.ts` initializes NestJS with Helmet, CookieParser, Global ValidationPipe (DTO whitelisting), and CORS whitelist verification.
2. **Global Route Prefix:** All endpoints are mounted under `/api/v1/...`.
3. **Tenancy Guard:** `WorkspaceScopeGuard` extracts `workspaceId` from the verified JWT claims or `x-workspace-id` header, asserting tenant membership in PostgreSQL.
4. **Concurrency & Idempotency:** Endpoints enforce optimistic locking via HTTP `If-Match` headers (yielding `409 Conflict` on version divergence) and deduplicate requests using `IdempotencyRecord` entries in PostgreSQL.
5. **Transactional Outbox Dispatch:** Mutation endpoints write domain records and corresponding `EventOutbox` or `AnalyticsOutboxEvent` rows within a single PostgreSQL transaction.

### Distributed Worker Architecture (`apps/worker`)
1. **Queue Topology:** 12 dedicated BullMQ queues with backoff policies:
   - `content-generation-queue`: Multi-turn LangGraph generation
   - `publishing-queue`: Resilient two-phase container publishing
   - `engagement-ingest-queue` & `engagement-classify-queue`: Adaptive sync and intent classification
   - `reply-publish-queue`: Fenced CAS reply publisher
   - `analytics-sync-queue` & `analytics-aggregate-queue`: Metric capture and Welch/FDR aggregation
   - `rules-engine-queue` & `safety-gate-queue`: Rule evaluation and 4-wall safety audits
   - `autonomous-operator-queue`: Distributed account leasing and candidate scheduling
2. **Self-Healing Reconcilers:** Background watchdog loops running every 1–5 minutes:
   - `PublishingReconciliationService`: Verifies Meta public feeds to resolve ambiguous container timeouts.
   - `EngagementReconciliationService`: Scans 0–6 resolving dead leases and stuck reply executions.
   - `ExpiredObservationSweeperService`: Reclaims abandoned analytics observation leases.

---

## 🗄️ 8. Database Architecture & Data Models

The persistence layer is powered by **PostgreSQL 16 with `pgvector`** managed via Prisma ORM ([`packages/database/prisma/schema.prisma`](file:///d:/Projects/threads-automation/packages/database/prisma/schema.prisma)), encompassing 66 relational models.

```mermaid
erDiagram
    Workspace ||--o{ SocialAccount : owns
    Workspace ||--o{ UserProfile : configures
    Workspace ||--o{ ContentDraft : authors
    Workspace ||--o{ Interaction : receives
    Workspace ||--o{ AnalyticsObservation : tracks
    Workspace ||--o{ AutomationRule : defines

    SocialAccount ||--o{ OAuthToken : holds
    SocialAccount ||--o{ ScheduledPost : schedules
    SocialAccount ||--o{ ScheduledPostQuota : enforces

    ContentDraft ||--o{ ContentVersion : versions
    ContentVersion ||--o{ ScheduledPost : dispatches
    ContentVersion ||--o{ PrePublishSafetyAudit : audits

    MemoryItem ||--o{ MemoryEmbedding : contains
    Workspace ||--o{ MemoryItem : isolates

    Interaction ||--o{ InteractionClassification : classifies
    Interaction ||--o{ ReplyDraft : drafts
    ReplyDraft ||--o{ ReplyDraftVersion : versions
    ReplyDraftVersion ||--o{ ReplyExecution : publishes

    ScheduledPost ||--o{ PostMetric : captures
    PostMetric ||--o{ PerformanceAggregate : aggregates
    PerformanceAggregate ||--o{ Insight : derives
    Insight ||--o{ RecommendationExposure : recommends

    AutomationRule ||--o{ RuleExecutionLog : records
    RuleExecutionLog ||--o{ RuleActionExecution : executes
    PrePublishSafetyAudit ||--o{ SafetyOverrideLog : overrides
    Experiment ||--o{ ExperimentVariant : defines
```

### Critical Database Integrity Invariants
1. **`PostMetric` Immutability Engine Trigger:** A PostgreSQL database trigger unconditionally rejects `UPDATE` statements on metrics and forbids `DELETE` unless authorized via transaction-local session state (`SET LOCAL threadpilot.allow_purge = 'on'`).
2. **Relational Attribution Ledger:** `RecommendationExposure` enforces `ON DELETE RESTRICT` on referenced `Insight` and `LearnedDimensionWeight` records to guarantee audit preservation.
3. **Compound Unique Keys:** Cross-tenant leakage is physically prevented at the database engine level (e.g. `(workspaceId, socialAccountId)` composite keys across all sub-entities).

---

## 🔄 9. Core System Workflows & Sequence Diagrams

### Workflow 1: Dual-Representation Ingestion & Exact-Term Hybrid Search
Demonstrates how past posts are ingested, split into dual vector spaces, and queried with exact-first keyword prioritization:

```mermaid
sequenceDiagram
    autonumber
    actor Creator as Creator / Operator
    participant API as apps/api (Content)
    participant Agent as LangGraph ContentGraph
    participant DB as PostgreSQL + pgvector
    participant Gemini as Google Gemini 2.5

    Creator->>API: POST /api/v1/content/generate { topic: '"Nike Air Max" campaign' }
    API->>Agent: invoke(initialState)
    
    par Exact Term Extraction & Keyword Search
        Agent->>Agent: extractExactTerms(topic) -> ['Nike Air Max']
        Agent->>DB: findByExactTerms(workspaceId, terms) [ILIKE '%Nike Air Max%']
        DB-->>Agent: Returns exact-match MemoryItem (ID: 101)
    and Semantic Vector Embeddings
        Agent->>Gemini: embed({ texts: [topic] })
        Gemini-->>Agent: 768-dim vector literal
        Agent->>DB: findSimilar(workspaceId, taskType='DOCUMENT', vector)
        DB-->>Agent: Returns semantic matches (ID: 101, ID: 204)
    end

    Agent->>Agent: mergeResults(): exact matches ranked first, deduplicated by ID
    Agent->>Gemini: generateDraft(fewShotExemplars, topic)
    Gemini-->>Agent: Candidate text
    Agent->>Agent: validateFinal(): deterministic <= 500 UTF-16 code units
    Agent->>DB: Persist ContentDraft & ContentVersion v1
    Agent-->>API: Generated Draft Ready
    API-->>Creator: HTTP 201 Created { draftId, versions }
```

### Workflow 2: Atomic CAS-Fenced Publishing & Reconciliation
Demonstrates race-free two-phase publishing to Meta Threads:

```mermaid
sequenceDiagram
    autonumber
    participant Worker as PublishingProcessor
    participant DB as PostgreSQL (ScheduledPost)
    participant Meta as Meta Threads Graph API
    participant Reconciler as PublishingReconciler

    Worker->>DB: UPDATE scheduled_posts SET status='PUBLISHING', lease_until=NOW()+5m WHERE id=:id AND status='SCHEDULED'
    alt CAS Lease Claim Failed (affected_rows === 0)
        Worker->>Worker: Abort: Post claimed by another worker pod
    else CAS Lease Acquired (affected_rows === 1)
        Worker->>Meta: POST /v1.0/{user_id}/threads (create media container)
        alt Network Timeout / 5xx Error
            Worker->>DB: Retain status='PUBLISHING'; do NOT retry immediately
            Note over Reconciler: Reconciler triggers Scan 1
            Reconciler->>Meta: GET /v1.0/{user_id}/threads (Inspect public feed)
            alt Post exists on Meta feed
                Reconciler->>DB: UPDATE status='PUBLISHED', published_post_id=metaId
            else Post does not exist
                Reconciler->>DB: Rollback status='SCHEDULED', lease_until=NULL
            end
        else Container Created (id=container123)
            Worker->>Meta: Poll container status until 'FINISHED'
            Worker->>Meta: POST /v1.0/{user_id}/threads_publish (publish container)
            Meta-->>Worker: Published Thread ID
            Worker->>DB: UPDATE status='PUBLISHED', published_at=NOW()
        end
    end
```

### Workflow 3: Phase 5 Governance: Rules AST, Safety Gate & Option A Override
Demonstrates automated rule evaluation and fail-closed safety fencing:

```mermaid
sequenceDiagram
    autonumber
    participant Worker as AutonomousOperator
    participant Rules as RulesEngineService
    participant Safety as SafetyGateService
    participant DB as PostgreSQL
    actor Operator as Human Operator

    Worker->>Rules: evaluateRules(context)
    Rules->>Rules: Parse AST (metric.engagement >= 0.05 AND topic == 'AI')
    Rules->>DB: Co-transactional check: insert RuleActionExecution (P5-75 key)
    
    Rules->>Safety: evaluateCandidate(draftVersion)
    Safety->>Safety: Wall 1: Claim Hallucination (Gemini Grounding)
    Safety->>Safety: Wall 2: Toxicity & Brand Safety
    Safety->>Safety: Wall 3: 500-code-unit Platform Compliance
    Safety->>Safety: Wall 4: Sensitive Topic Velocity

    alt Any Wall Fails (e.g. Wall 1 Hallucination Score > 0.30)
        Safety->>DB: PrePublishSafetyAudit status = 'BLOCKED_POLICY_VIOLATION'
        Safety-->>Worker: Execution Blocked (Fail-Closed)
        Note over Operator: Operator inspects rejection on /governance
        Operator->>DB: POST /api/v1/governance/safety/override { auditId, reason, riskAcknowledged }
        DB-->>Operator: Issues single-use CAS token (oneTimeToken)
        Worker->>DB: Consume override token (affected_rows === 1)
        Worker->>DB: Schedule post with P5-76 candidate lease fencing
    else All 4 Walls Pass
        Safety->>DB: PrePublishSafetyAudit status = 'PASSED'
        Worker->>DB: Schedule post
    end
```

---

## 📡 10. REST API Documentation

All API routes are served under `/api/v1/...` and guarded by `WorkspaceScopeGuard` (requiring JWT authentication and valid tenant scoping) unless marked **Public**.

| Method | Endpoint | Purpose | Auth Required | Key Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register new user and personal workspace | Public | `201`, `400`, `409` |
| `POST` | `/api/v1/auth/login` | Authenticate with Argon2id, receive JWT & cookie | Public | `200`, `401` |
| `POST` | `/api/v1/auth/refresh` | Rotate refresh token with reuse detection | Cookie (`tp_rt`) | `200`, `401` |
| `POST` | `/api/v1/auth/logout` | Revoke active refresh token family | Bearer JWT | `200` |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user profile & workspaces | Bearer JWT | `200`, `401` |
| `GET` | `/api/v1/threads-auth/connect` | Initiate Meta OAuth 2.0 PKCE redirect | Bearer JWT | `200` |
| `GET` | `/api/v1/threads-auth/callback` | Exchange authorization code for 60-day token | Public (OAuth) | `302` Redirect |
| `GET` | `/api/v1/content/drafts` | List drafts with version counts & status | Bearer JWT | `200` |
| `POST` | `/api/v1/content/generate` | Dispatch LangGraph AI content drafting job | Bearer JWT | `202 Accepted` |
| `POST` | `/api/v1/content/drafts/:id/schedule`| Schedule draft version with slot collision checks | Bearer JWT | `201`, `409` |
| `GET` | `/api/v1/content/schedules` | List scheduled posts for calendar display | Bearer JWT | `200` |
| `POST` | `/api/v1/content/schedules/:id/cancel`| Cancel scheduled post releasing calendar slot | Bearer JWT | `200`, `400` |
| `GET` | `/api/v1/engagement/interactions` | Keyset cursor pagination of community replies | Bearer JWT | `200` |
| `POST` | `/api/v1/engagement/interactions/:id/draft`| Generate contextual reply draft for comment | Bearer JWT | `201` |
| `PATCH` | `/api/v1/engagement/interactions/:id/draft`| Edit draft inline with optimistic `If-Match` | Bearer JWT | `200`, `409` |
| `POST` | `/api/v1/engagement/interactions/:id/approve`| Approve candidate reply for publishing | Bearer JWT | `200` |
| `GET` | `/api/v1/analytics/overview` | Fetch high-level KPIs and captured slots | Bearer JWT | `200` |
| `GET` | `/api/v1/analytics/aggregates` | Multi-dimensional cohort aggregation metrics | Bearer JWT | `200` |
| `GET` | `/api/v1/analytics/insights` | Evidence-gated AI insights with FDR badges | Bearer JWT | `200` |
| `GET` | `/api/v1/analytics/learning` | Longitudinal profile learned dimension weights | Bearer JWT | `200` |
| `GET` | `/api/v1/analytics/recommendations` | Candidate recommendation cards with lift scores | Bearer JWT | `200` |
| `POST` | `/api/v1/analytics/recommendations/:id/accept`| Accept recommendation, link 1:1 draft | Bearer JWT | `201` |
| `POST` | `/api/v1/governance/rules` | Create AST automation rule | Bearer JWT | `201`, `400` |
| `GET` | `/api/v1/governance/rules` | List tenant automation rules | Bearer JWT | `200` |
| `PATCH`| `/api/v1/governance/rules/:id/toggle` | Toggle rule active status | Bearer JWT | `200` |
| `GET` | `/api/v1/governance/safety/audits` | Query 4-wall safety evaluation telemetry | Bearer JWT | `200` |
| `POST` | `/api/v1/governance/safety/override` | Execute Option A single-use manual override | Bearer JWT | `200`, `403` |
| `POST` | `/api/v1/governance/experiments` | Create strictly two-arm A/B experiment | Bearer JWT | `201`, `400` |
| `POST` | `/api/v1/governance/experiments/:id/activate`| Activate experiment with decoupled horizons | Bearer JWT | `200` |
| `GET` | `/api/v1/governance/operator/status` | Real-time autonomous operator telemetry | Bearer JWT | `200` |
| `POST` | `/api/v1/governance/operator/toggle` | Emergency Outbound Operator Kill Switch | Bearer JWT | `200` |
| `GET` | `/api/v1/governance/adaptation/proposals`| List profile adaptation proposals | Bearer JWT | `200` |
| `POST` | `/api/v1/governance/adaptation/proposals/:id/apply`| Apply proposal with winsorized lift & CAS v+1| Bearer JWT | `200`, `409` |
| `GET` | `/api/v1/health` | Service liveness & database connectivity check | Public | `200` |

---

## 📁 11. Monorepo Directory Structure

```
threadpilot/
├── apps/
│   ├── api/                         # NestJS 11 REST API Gateway (Port 3001)
│   │   ├── src/auth/                # Argon2id hashing, family-based refresh token rotation
│   │   ├── src/common/              # WorkspaceScopeGuard, decorators, logging interceptors
│   │   ├── src/content/             # Draft authoring, versioning, calendar scheduling
│   │   ├── src/engagement/          # Review deck controller, SSE telemetry gateway
│   │   ├── src/analytics/           # Cohort aggregation, insights, recommendation endpoints
│   │   ├── src/governance/          # Phase 5: Rules, Safety, Experiments, Operator, Adaptation
│   │   └── src/threads-auth/        # Meta OAuth 2.0 PKCE exchange and token vault
│   ├── web/                         # Next.js 15.5 App Router Frontend (Port 3000)
│   │   ├── src/app/                 # Route handlers: /create, /schedules, /replies, /analytics, /governance
│   │   ├── src/components/          # UI: Review deck, calendar modal, AST builder, telemetry cards
│   │   └── src/hooks/               # Custom hooks: useAuth, useEngagementSSE, useKeyboardShortcuts
│   └── worker/                      # NestJS 11 BullMQ Asynchronous Worker (Port 3002)
│       ├── src/processors/          # Publishing, Ingestion, Engagement, Analytics, Rules, Safety
│       └── src/services/            # Watchdog reconcilers, feed verifiers, lease managers, operator
├── packages/
│   ├── agents/                      # LangGraph agentic workflows & safety gates
│   │   ├── src/content/             # ContentGraph, exact-terms extractor, deterministic 500-char gate
│   │   ├── src/profile/             # StyleExtractionGraph (8 stylometric markers)
│   │   └── src/engagement/          # ClassifierGraph, ReplyGraph, PostGenerationSafetyGraph
│   ├── ai/                          # Google Gemini 2.5 SDK, Model Router, Fallback cascade
│   ├── config/                      # Environment schemas, rules definitions (rules-v1.ts)
│   ├── database/                    # Prisma ORM, migrations (0001-0009), MemoryRepository (pgvector + ILIKE)
│   ├── observability/               # Structured Pino logging, OpenTelemetry integration
│   ├── prompts/                     # Version-controlled system prompts & few-shot catalogs
│   ├── threads-client/              # Meta Threads Graph API client, AES-256-GCM token encryption
│   └── types/                       # Shared TypeScript interfaces, DTOs, Zod AST schemas
├── infrastructure/
│   └── docker/                      # Multi-stage Dockerfiles (api, worker, web, migrate)
├── scripts/
│   ├── verify-full-system-e2e.ts    # 41-assertion Master E2E System Verification Suite
│   ├── verify-production-config.mjs # Preflight deployment verification script
│   └── comprehensive-audit-test.js  # 29-step live HTTP API smoke audit
├── turbo.json                       # Turborepo task pipeline configuration
├── pnpm-workspace.yaml              # Monorepo workspace package layout
└── package.json                     # Monorepo dependencies & root lifecycle scripts
```

---

## 🚀 12. Installation & Local Development

### Prerequisites
- **Node.js**: v22.x LTS (Recommended) or v20.x
- **Package Manager**: `pnpm` v10+ (`corepack enable pnpm`)
- **Docker**: For local PostgreSQL 16 (`pgvector`) and Redis 7 (or cloud equivalents)

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/shivkantdhakre/ThreadPilot.git
cd ThreadPilot
pnpm install
```

### Step 2: Start Local Infrastructure (Docker Compose)
Launch PostgreSQL with `pgvector` and Redis:
```bash
docker-compose up -d
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```
*(Ensure `DATABASE_URL`, `REDIS_URL`, and `GEMINI_API_KEY` are populated).*

### Step 4: Run Database Migrations
Generate Prisma Client and deploy all 9 migrations to PostgreSQL:
```bash
pnpm db:generate
pnpm db:migrate
```

### Step 5: Build Monorepo Packages
Compile all 11 TypeScript packages and Next.js assets:
```bash
pnpm build
```

### Step 6: Launch Development Servers
Start all applications concurrently via Turborepo:
```bash
pnpm dev
```
- **Web Dashboard:** [http://localhost:3000](http://localhost:3000)
- **REST API Gateway:** [http://localhost:3001](http://localhost:3001)
- **Swagger Documentation:** [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- **Worker Engine:** Running on background port `3002`

---

## 🔐 13. Environment Configuration

| Variable | Purpose | Required | Example Format |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Application runtime environment | Yes | `development` / `production` |
| `APP_PUBLIC_URL` | Public origin of the frontend web application | Yes | `http://localhost:3000` |
| `API_PUBLIC_URL` | Public origin of the backend REST API | Yes | `http://localhost:3001` |
| `NEXT_PUBLIC_API_URL`| API base URL injected into frontend client | Yes | `http://localhost:3001/api/v1` |
| `DATABASE_URL` | Pooled connection for Prisma application runtime | Yes | `postgresql://user:pass@ep-pooler.neon.tech/neondb` |
| `DATABASE_URL_UNPOOLED`| Direct connection for migrations & advisory locks | Production | `postgresql://user:pass@ep.neon.tech/neondb` |
| `REDIS_URL` | Redis connection URL for BullMQ queues & Redlock | Yes | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | 256-bit secret for signing short-lived access JWTs | Yes | `min_32_chars_random_entropy_secret` |
| `JWT_REFRESH_SECRET`| 256-bit secret for signing refresh tokens | Yes | `min_32_chars_random_entropy_secret` |
| `TOKEN_ENCRYPTION_KEY`| 32-byte base64 AES-256-GCM token encryption key | Yes | `base64_encoded_32_byte_aes_gcm_key` |
| `TOKEN_ENCRYPTION_KEY_VERSION`| Current active key version index | Yes | `1` |
| `THREADS_APP_ID` | Meta Threads App ID from Meta Developers | Yes | `123456789012345` |
| `THREADS_APP_SECRET`| Meta Threads App Secret | Yes | `32_character_meta_app_secret` |
| `THREADS_REDIRECT_URI`| OAuth callback URL (must match Meta settings) | Yes | `http://localhost:3001/api/v1/threads-auth/callback` |
| `GEMINI_API_KEY` | Server-side Google Gemini AI API key | Yes | `AIzaSyDummyKeyForDocumentation_123` |
| `CORS_ORIGIN` | Allowed cross-origin domains | Yes | `http://localhost:3000` |

---

## 🛡️ 14. Security Architecture & Cryptography

ThreadPilot enforces defense-in-depth across storage, authentication, and external integrations:

1. **Password Hashing:** Argon2id with memory cost $65,536\text{ KB}$, iterations $3$, and parallelism $4$.
2. **Access Token Lifecycle & Storage:** Access tokens are short-lived (15 minutes) and stored exclusively in frontend React memory state (`useAuth` hook), never in `localStorage` or `sessionStorage` (eliminating token exfiltration via XSS).
3. **Family-Based Refresh Token Rotation with Compromise Recovery:** Refresh tokens are delivered via `HttpOnly`, `SameSite=Lax`, `Secure` cookies. Each token belongs to an immutable cryptographic family. If an already-consumed refresh token is replayed, the server instantly detects token reuse and **revokes the entire token family**, invalidating all active sessions for that user.
4. **OAuth 2.0 PKCE Handshake:** External Meta authentication utilizes a cryptographically random 43–128 character `code_verifier` paired with a base64url-encoded SHA-256 `code_challenge`, verified against a 10-minute state record in Redis.
5. **AES-256-GCM Envelope Encryption:** Long-lived 60-day Meta access tokens are encrypted with AES-256-GCM using a random 12-byte IV and 16-byte authentication tag, stored with a version prefix (`{version}:{base64(iv + tag + ciphertext)}`), enabling zero-downtime key rotation.
6. **Zero-Trust Multi-Tenancy:** Every database query, BullMQ job payload, and raw `pgvector` SQL query unconditionally includes `WHERE workspace_id = :workspaceId`.

---

## 🛠️ 15. Error Handling, Self-Healing & Reliability

### Distributed Idempotency & Leasing Invariants
- **P5-75 Co-Transactional Rule Execution Idempotency:** When an automated rule triggers a side-effect (e.g. `AUTO_SCHEDULE`), the rule execution key and the resulting `ScheduledPost` are committed inside the exact same database transaction. Duplicate queue deliveries throw unique constraint violations on `action_execution_key`, immediately aborting without creating duplicate posts.
- **P5-76 Candidate Lease Fencing Atomic Rollback:** When candidate posts are transitioned by the autonomous operator, conditional updates require `lease_token` and `lease_until > NOW()`. If `affected_rows !== 1`, the transaction executes an **immediate atomic rollback**, preventing orphaned posts.

### Self-Healing Watchdogs
- **Meta 429 Exponential Backoff:** When Meta platform rate limits are encountered, workers enter canonical backoff intervals ($5\text{s}, 15\text{s}, 30\text{s}, 60\text{s}$) before marking tasks as `QUOTA_BLOCKED`.
- **Reconciliation Engine (Scans 0–6):** If worker pods crash or network partitions occur mid-publish, the reconciler checks the true state on Meta's public feed before deciding whether to finalize or retry.

---

## 🧪 16. Verification, Quality Assurance & Test Suites

ThreadPilot maintains a rigorous automated testing baseline with **100% passing tests across 11 monorepo packages**:

```text
TAP version 13
ok 1 - Governance API Controllers & Service Contract Verification
ok 2 - Governance Worker Fencing, Idempotency & Concurrency Invariants
ok 3 - Governance UI Navigation & Interactive Modals
ok 4 - Phase 5 Comprehensive Acceptance Test Suite
ok 5 - Phase 5 Database Schema, Enums & Compound Unique Constraints
ok 6 - Phase 5 Types & Evaluator Invariant Tests
ok 7 - Historical Duplicate Ingestion to Detection E2E (apps/worker)
ok 8 - Exact-Term Matching Unit Tests (packages/agents)
ok 9 - Hybrid Retrieval Integration Tests (packages/agents)
ok 10 - MemoryRepository ILIKE Keyword Search Tests (packages/database)

# Total Tests: 327+ Unit & Integration Tests | 0 Failed | 100% Passing
```

### Running Test Commands
```bash
# Run all unit and integration tests across monorepo
pnpm test

# Run Phase 5 dedicated test suites
node --experimental-strip-types --test packages/database/test/phase5-schema-constraints.spec.ts packages/types/test/phase5-types.spec.ts apps/api/test/governance-controller.spec.ts apps/worker/test/phase5-acceptance.spec.ts apps/worker/test/governance-worker-fencing.spec.ts apps/web/test/governance-ui-integration.spec.ts

# Run the 41-Assertion Master End-to-End System Verification Suite
npx tsx scripts/verify-full-system-e2e.ts

# Run Live Gemini Interactions API & Embedding Smoke Test
pnpm test:gemini-live
```

---

## 🚢 17. Production Deployment & Infrastructure

ThreadPilot is deployed across specialized cloud infrastructure providers:

```mermaid
flowchart LR
    Vercel["Vercel\napps/web (Next.js 15)\nDeterministic Build"]
    Render["Render\napps/api (NestJS)\nPORT Binding"]
    Railway["Railway\napps/worker (BullMQ)\nHeadless Processor"]
    Neon["Neon Serverless PostgreSQL\npgvector + Pooled/Unpooled URLs"]
    Upstash["Upstash / Redis Cloud\nManaged Redis TLS (BullMQ)"]

    Vercel <-->|HTTPS API / Cookies| Render
    Render <-->|DATABASE_URL (Pooled)| Neon
    Railway <-->|DATABASE_URL (Pooled)| Neon
    Render <-->|REDIS_URL (TLS)| Upstash
    Railway <-->|REDIS_URL (TLS)| Upstash
```

### Platform Deployment Specifications
1. **Frontend Web (`apps/web` on Vercel):**
   - Built via `turbo run build`.
   - **Deterministic Font Optimization:** Google Fonts (`Plus Jakarta Sans`) are loaded client-side via preconnect and CSS custom variables (`--font-jakarta`), completely eliminating build-time network failures and shared IP rate-limiting errors (`TypeError: Cannot read properties of null`).
2. **Backend API (`apps/api` on Render):**
   - Deployed as a web service using `infrastructure/docker/Dockerfile.api`.
   - Binds dynamically to platform-injected `PORT` environment variables.
3. **Worker Engine (`apps/worker` on Railway):**
   - Deployed as a headless background worker using `infrastructure/docker/Dockerfile.worker`.
4. **Database Migrations (`infrastructure/docker/Dockerfile.migrate`):**
   - Runs `prisma migrate deploy` directly against `DATABASE_URL_UNPOOLED` (port 5432, direct connection) to safely acquire PostgreSQL advisory locks without PgBouncer connection pooling interference.

---

## 📈 18. Performance & Scalability Engineering

1. **Keyset Cursor Pagination:** All high-volume endpoints (`/interactions`, `/schedules`) utilize deterministic keyset pagination (`(createdAt, id)` tuple cursors) instead of offset-based pagination, maintaining $O(1)$ query execution times regardless of table depth.
2. **Independent-Group CTE SQL Aggregations:** Phase 4 cohort analysis aggregates thousands of metrics using Common Table Expressions (CTEs) without Cartesian products or in-memory arrays.
3. **Vector Distance Pruning:** Vector queries execute indexed cosine distance scans (`ORDER BY embedding <=> :vector`) strictly scoped by tenant workspace IDs, avoiding global table scans.
4. **Permuted Block Allocation:** Content experiments randomize assignments into balanced blocks ($K=4$), avoiding global database locks during assignment.

---

## 💡 19. Key Architectural Decisions & Trade-offs

### Decision 1: Dual-Representation Vector Memory & Hybrid Exact-Term Search
- **Context:** Style exemplar retrieval requires asymmetric search (`DOCUMENT`), while duplicate detection requires symmetric distance (`SIMILARITY`). Furthermore, pure semantic vector search often buries exact creator campaign terms (e.g. `"Nike Air Max"` or `ARR`).
- **Choice:** Generated dual embeddings per post in `pgvector` and built hybrid keyword retrieval using parameterized `ILIKE` clauses with exact matches prioritized first.
- **Trade-off:** Requires generating two embeddings per historical post ($2\times$ storage), but guarantees 100% exact term prioritization and zero duplicate confusion.

### Decision 2: Atomic CAS Fenced Publishing vs. Direct API Calls
- **Context:** Meta's publishing API is a 2-step async container process. Network timeouts can leave drafts in ambiguous states.
- **Choice:** Enforced Compare-and-Swap (CAS) lease claiming on `ScheduledPost` records and paired it with a 3-scan background feed reconciler.
- **Trade-off:** Adds short lease acquisition overhead and polling latency, but completely eliminates duplicate posts and zombie states.

### Decision 3: Parameterized `ILIKE` vs. PostgreSQL Full-Text Search (FTS)
- **Context:** Implementing keyword search for exact campaign terms.
- **Choice:** Selected parameterized `ILIKE` queries rather than PostgreSQL `tsvector`/GIN indexes.
- **Trade-off:** Postgres FTS uses linguistic stemmers that alter brand names and acronyms (e.g. stripping `#` from hashtags or stemming words). `ILIKE` matches exact creator substrings verbatim without requiring schema alterations or migration locks on existing cloud databases.

---

## 🚧 20. Known Limitations & Roadmap

### Known Limitations
1. **Single Threads Account Per OAuth Session:** Meta currently scopes OAuth tokens to one Threads user profile per authorization code. Multi-account switching requires distinct OAuth handshakes.
2. **Meta Container Processing Lag:** Video and multi-image carousel containers require up to 30 seconds of processing time on Meta's infrastructure before publishing can be finalized.
3. **Serverless Worker Scaling:** In high-concurrency environments, BullMQ worker nodes require centralized Redis instances rather than serverless ephemeral functions.

### Future Roadmap
- [ ] Multi-image carousel visual previews in Content Studio.
- [ ] Direct webhook integration for real-time inbound comment push notifications (replacing adaptive polling).
- [ ] Cross-network expansion: LinkedIn and Bluesky adapters sharing the same stylometric persona engine.

---

## 🎯 21. Technical Interview Preparation Guide

This section is designed to help you confidently present ThreadPilot during technical interviews, placement drives, and architectural deep dives.

### ⚡ 30-Second Elevator Pitch
> *"ThreadPilot is an autonomous personal social operating system built for Meta's Threads network. Unlike generic AI schedulers that output bland text into a calendar, ThreadPilot acts as an authentic digital twin. It extracts an 8-point stylometric fingerprint from the creator's real post history, stores dual-representation embeddings in PostgreSQL `pgvector`, and uses hybrid exact-term keyword retrieval to generate voice-accurate drafts. It handles the entire lifecycle—including two-phase CAS publishing, autonomous community reply triage, Welch/FDR empirical analytics, and a fail-closed 4-wall safety governance gate."*

### ⏱️ 2-Minute Architectural Walkthrough
> *"Architecturally, ThreadPilot is structured as a Turborepo monorepo with strict separation of concerns across three core services:*
> 1. *A Next.js 15 App Router frontend with real-time SSE telemetry, an interactive Content Studio, and a keyboard-driven Community Review Deck.*
> 2. *A NestJS 11 REST API Gateway enforcing multi-tenant workspace isolation, Argon2id authentication, rotating refresh tokens with reuse detection, and OAuth 2.0 PKCE.*
> 3. *An asynchronous execution layer powered by Redis and BullMQ, running specialized LangGraph workflows.*
> 
> *Our persistence layer is PostgreSQL 16 with `pgvector`. A critical engineering insight was recognizing that style inspiration requires asymmetric `DOCUMENT` vector search, while duplicate detection requires symmetric `SIMILARITY` distance. To solve this, we store dual vector embeddings per post and layer a parameterized `ILIKE` exact keyword search on top, ensuring creator campaign terms always take priority.*
> 
> *For publishing, we handle Meta's asynchronous 2-step container lifecycle using atomic Compare-And-Swap (CAS) leases and autonomous reconciliation workers that inspect the live feed on network drops to guarantee zero duplicate posts. Finally, Phase 5 introduces a 4-wall pre-publish safety gate, an AST rules engine, two-arm A/B experimentation, and closed-loop profile adaptation with winsorized lift."*

### 🧠 Top 15 Technical Interview Questions & Code-Grounded Answers

#### Q1: Why did you choose PostgreSQL with `pgvector` over dedicated vector databases like Pinecone or Milvus?
> **Answer:** *"To prevent distributed dual-write inconsistency and maintain strict multi-tenant boundaries. By keeping vector embeddings in the same relational database as our business entities (`workspaces`, `content_drafts`, `scheduled_posts`), we can execute vector similarity queries and relational tenant filters (`WHERE workspace_id = :id`) within a single atomic query. It eliminates external vector sync latency, simplifies backups, and guarantees ACID transactions."*

#### Q2: How does the system prevent generating duplicate posts?
> **Answer:** *"We use symmetric `SIMILARITY` task-type embeddings in `pgvector`. Before a draft is persisted, `ContentGraph.checkDuplicate` embeds the candidate text and queries `memory_embeddings` using cosine distance (`1 - (me.embedding <=> query::vector)`). If similarity exceeds our calibrated threshold of `0.88`, the draft is flagged as a duplicate and routed for revision."*

#### Q3: Why did you implement exact keyword search with `ILIKE` instead of PostgreSQL Full-Text Search (FTS)?
> **Answer:** *"Postgres FTS applies linguistic stemming dictionaries (e.g., converting 'running' to 'run', dropping punctuation, and splitting proprietary acronyms like 'ARR' or 'Q3Launch'). The acceptance criteria required exact creator term fidelity for quoted phrases, product names, and hashtags. Parameterized `ILIKE %term%` guarantees exact substring containment without dictionary stemming, and avoided introducing DDL schema migrations across existing cloud databases."*

#### Q4: How does the system handle Meta's asynchronous two-step publishing safely?
> **Answer:** *"Publishing requires creating a media container (`POST /threads`) and publishing it (`POST /threads_publish`). In `PublishingProcessor`, workers acquire an atomic time-bounded CAS database lease (`lease_until = NOW() + 5m`). If a network timeout occurs during publishing, the worker does not blindly retry. Instead, our `PublishingReconciliationService` queries Meta's live public feed to verify if the post was published, preventing catastrophic double-posting."*

#### Q5: What is the P5-75 Co-Transactional Rule Execution Idempotency Invariant?
> **Answer:** *"When an automation rule executes a side effect (such as auto-scheduling a post), the engine computes a deterministic key `actionExecutionKey` (combining `ruleId`, `window`, and `actionIndex`). The `RuleActionExecution` log and the `ScheduledPost` record are inserted inside the **exact same PostgreSQL transaction**. If a worker restarts and re-delivers the job, PostgreSQL throws a unique constraint violation on `action_execution_key`, immediately aborting without creating duplicate posts."*

#### Q6: What is the P5-76 Candidate Lease Fencing Invariant?
> **Answer:** *"During autonomous operator candidate scheduling, the database update requires matching both `lease_token` and verifying `lease_until > NOW()`. If another worker pod claimed the candidate or the lease expired, `affected_rows` is 0. The transaction immediately executes an atomic rollback, ensuring zero orphaned scheduled posts and zero leaked weekly quotas."*

#### Q7: How does the 4-Wall Pre-Publish Safety Gate work?
> **Answer:** *"Every candidate draft is evaluated sequentially across 4 walls: Wall 1 checks factual claim hallucination against stored memories using Gemini; Wall 2 evaluates toxicity and brand safety; Wall 3 enforces platform compliance and 500-code-unit bounds; Wall 4 checks sensitive topic velocity. It operates fail-closed: audits initialize as `PENDING`, and any timeout or failure blocks publication."*

#### Q8: How does the Option A Manual Safety Override maintain security?
> **Answer:** *"When a post is flagged by the safety gate, an authorized `OWNER` or `ADMIN` can override it by submitting a mandatory rationale ($\ge 10$ characters) and risk acknowledgment. The system freezes the operator's role snapshot and issues a single-use UUID token. When the scheduler claims the override, it executes an atomic CAS update (`consumed_at = NOW() WHERE one_time_token = :token AND consumed_at IS NULL`). If `affected_rows !== 1`, consumption fails."*

#### Q9: How do you prevent AI bot loops in community replies?
> **Answer:** *"In `EngagementIngestProcessor`, we enforce a triple loop breaker: we check if the author ID matches our authenticated account, compare username snapshots case-insensitively, and enforce an invariant ceiling of $N \le 2$ consecutive bot replies per author thread. Self-authored comments are immediately flagged as `NOT_REQUIRED`."*

#### Q10: How do you protect voice memory from being contaminated by malicious comments?
> **Answer:** *"Through our `MemoryContaminationGuard` (`sanitizeMemoryContent`). When an operator edits an AI reply and approves it as an editorial feedback exemplar, the guard inspects the diff. It verifies that only the creator's authentic words—never third-party comment text, profanity, or prompt injection payloads—are embedded into `pgvector` voice memory."*

#### Q11: How does your statistical testing in Phase 4 and Phase 5 work?
> **Answer:** *"We use Welch's two-sample $t$-test to compare performance cohorts with unequal variances and sample sizes. To eliminate false discoveries when testing dozens of cohort combinations simultaneously, we apply Benjamini-Hochberg False Discovery Rate (BH-FDR) correction controlling $q \le 0.05$ across the entire hypothesis family universe."*

#### Q12: Why do you winsorize lift in profile adaptation?
> **Answer:** *"In social media, early engagement metrics can have extreme variance (e.g., an outlier post achieving $+500\%$ lift). If fed directly into persona weight updates, it would severely skew the creator's style profile. We strictly winsorize relative lift to $[-0.50, +0.50]$ ($\pm 50\%$) and apply an exponential half-life decay ($T_{1/2} = 30$ days), ensuring steady, empirical adaptation."*

#### Q13: How is token security implemented for Meta's 60-day access tokens?
> **Answer:** *"We use versioned AES-256-GCM envelope encryption. Tokens are encrypted using a 32-byte secret key with a cryptographically random 12-byte IV and a 16-byte authentication tag. The payload is stored as `{keyVersion}:{base64(iv + tag + ciphertext)}`, which allows rotating encryption keys without invalidating existing stored tokens."*

#### Q14: How does the system handle Next.js font rendering without crashing production builds?
> **Answer:** *"Next.js 15's `next/font/google` downloads font files at build time from Google Fonts. In cloud CI/CD runners (like Vercel AWS `iad1`), shared egress IPs often get rate-limited (HTTP 429), returning HTML error pages that crash `@next/font/dist/google/loader.js` with `TypeError: Cannot read properties of null`. We resolved this by loading Google Fonts client-side via `<link rel='preconnect'>` and CSS custom variables (`--font-jakarta`), making the build 100% deterministic, offline-resilient, and independent of external CDNs."*

#### Q15: How does the Transactional Outbox Pattern work in ThreadPilot?
> **Answer:** *"To prevent distributed dual-write inconsistency between PostgreSQL and Redis, API mutation endpoints commit business entities and corresponding `EventOutbox` or `AnalyticsOutboxEvent` records inside the exact same database transaction. A dedicated background dispatcher continuously polls for pending events and delivers them to BullMQ queues with deterministic idempotency keys, guaranteeing at-least-once delivery."*

---

## 📄 22. License & Acknowledgments

### License
This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for complete details.

### Acknowledgments
- **Meta Developers**: For providing the official Threads Graph API.
- **Google DeepMind & Google AI Studio**: For Google Gemini 2.5 and `gemini-embedding-2` models.
- **Neon**: For serverless PostgreSQL with native `pgvector` support.
- **NestJS & Next.js Communities**: For the robust backend modular DI and frontend App Router architectures.

---

<div align="center">
  <sub>Built with precision by <strong>Shiv Kant Dhakre</strong>. Designed for production, resilience, and creator voice preservation.</sub>
</div>

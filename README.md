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

- **🧬 Personal Voice & Stylometric Fingerprinting**: Real-time extraction of 8 distinct stylistic metrics (post length, sentence cadence, question ratio, emoji frequency, first-person voice, technical depth, contrary hooks, and list patterns).
- **🧠 Vector Memory & Exemplar Retrieval**: Semantic similarity matching over past successful posts using Google GenAI embeddings (`gemini-embedding-2` / `gemini-embedding-001`) with cosine distance ranking in PostgreSQL.
- **🛡️ Google GenAI Interactions API**: Native `@google/genai` Interactions API (`client.interactions.create`) with `store: false` to ensure Google does not persist creator content, with built-in resilient fallback and failure classification.
- **🔒 In-Memory Token Security & OAuth 2.0 PKCE**: Access tokens are held exclusively in-memory (never persisted in `localStorage` to eliminate XSS risks), paired with HttpOnly, SameSite=Lax rotating refresh tokens and strict multi-tenant workspace isolation.
- **⚡ Asynchronous Queue Architecture**: Powered by Redis and BullMQ with live Server-Sent Events (SSE) streaming real-time job lifecycle stages (`QUEUED` → `LOADING_MEMORY` → `GENERATING` → `EVALUATING` → `PERSISTING` → `COMPLETE`).
- **🛡️ Deterministic Final Validation Gate**: Post-editing validation node ensures AI polishing never expands content past 500 characters or produces empty drafts.


---

## 🏛️ Architecture

```mermaid
flowchart TD
    subgraph Client ["Frontend (Next.js 15 + TailwindCSS)"]
        UI["Web App (Port 3000)"]
        SSE["SSE / Polling Client"]
    end

    subgraph Gateway ["API Layer (NestJS 11)"]
        API["REST API (Port 3001)"]
        Auth["Auth & Passport JWT"]
        OAuth["Threads OAuth & PKCE"]
    end

    subgraph Queue ["Message Broker & Cache"]
        Redis[("Redis / BullMQ")]
    end

    subgraph Workers ["Async Worker Service (NestJS 11)"]
        Worker["Worker Service (Port 3002)"]
        IngestProc["Ingestion Processor"]
        StyleProc["Style Extractor"]
        ContentProc["Content Generation Graph"]
    end

    subgraph Intelligence ["AI Layer (@threadpilot/ai & @threadpilot/agents)"]
        GeminiRouter["Model Router & Fallback Chain"]
        GeminiFlash["Gemini Flash (Content & Extraction)"]
        GeminiEmbed["Gemini Embeddings (768-dim)"]
    end

    subgraph Storage ["Persistence"]
        Postgres[("PostgreSQL + pgvector (Neon)")]
    end

    UI -->|REST / HTTPS| API
    UI -->|Listen Events| API
    API --> Auth
    API --> OAuth
    API -->|Dispatch Jobs| Redis
    Redis --> Worker
    Worker --> IngestProc
    Worker --> StyleProc
    Worker --> ContentProc
    StyleProc --> GeminiRouter
    ContentProc --> GeminiRouter
    GeminiRouter --> GeminiFlash
    GeminiRouter --> GeminiEmbed
    Worker --> Postgres
    API --> Postgres
```

---

## 📦 Monorepo Structure

ThreadPilot is organized as an efficient Turborepo monorepo powered by `pnpm`:

```
threadpilot/
├── apps/
│   ├── api/                 # NestJS REST API (Auth, OAuth, Workspaces, Jobs, Drafts)
│   ├── web/                 # Next.js 15 Frontend (App Router, Dashboard, Profile, Creator)
│   └── worker/              # NestJS BullMQ Worker executing LangGraph workflows
├── packages/
│   ├── agents/              # LangGraph workflows (Style extraction, Content generation)
│   ├── ai/                  # AI adapters (Google GenAI, Model Router, Resilient Fallback)
│   ├── config/              # Shared configuration schemas
│   ├── database/            # Prisma schema, migrations, and MemoryRepository (pgvector)
│   ├── observability/       # Pino logger and OpenTelemetry instrumentation
│   ├── prompts/             # Version-controlled prompt catalog & few-shot examples
│   ├── threads-client/      # Meta Threads API SDK (OAuth exchange, Ingestion, Refresh)
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

# PostgreSQL with pgvector (Neon recommended)
DATABASE_URL="postgresql://user:pass@host/neondb?sslmode=require"
DATABASE_URL_LOCAL="postgresql://user:pass@host/neondb?sslmode=require"

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

# Google Gemini AI
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL_CONTENT="gemini-3.5-flash-lite"
GEMINI_MODEL_CLASSIFICATION="gemini-3.5-flash-lite"
GEMINI_MODEL_EMBEDDING="gemini-embedding-2"
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

ThreadPilot is thoroughly verified across unit, integration, and security layers:

### 1. Package & App Unit Test Suites

Run all automated unit and negative-path test suites across the monorepo:

```bash
pnpm test
```

| Test Suite | Package / App | Coverage / Behaviors Verified |
|---|---|---|
| **Gemini Interactions API** | `@threadpilot/ai` | `ai.interactions.create()`, `store: false`, Zod output validation, fast-fail on 4xx/schema errors, exponential backoff on 429/5xx |
| **Duplicate Calibration** | `@threadpilot/agents` | Cosine similarity benchmark across true duplicates, related-but-distinct, and unrelated posts |
| **OAuth Security & Negative Paths** | `@threadpilot/threads-client` | PKCE handshake, invalid state, TTL expired state, atomic one-time state consumption (`getdel`), server-side workspace identity enforcement |
| **Worker Crash Recovery** | `@threadpilot/worker` | Idempotent skip on completed jobs, result caching recovery across process crashes, clean retry from scratch |
| **Ingestion Interruption** | `@threadpilot/worker` | Multi-page pagination termination (no cursor), mid-stream interruption retry without duplicate post creation (`socialAccountId_externalId`) |
| **Cross-Tenant Isolation** | `@threadpilot/api` | `WorkspaceScopeGuard` 403 authorization, database query scoping (`where: { workspaceId, id }`) returning 404 for drafts, style examples, memories, jobs, and notifications |

### 2. Live End-to-End Integration Audit

Verify live running services against the 29-step audit suite:

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

### 1. Dynamic Stylometric Profiler

ThreadPilot extracts key markers from your authentic Threads posts:

| Metric                  | Description                                                 |
| :---------------------- | :---------------------------------------------------------- |
| **Avg Post Length**     | Character count distribution across historical posts        |
| **Sentence Length**     | Word cadence and rhythm                                     |
| **Question Frequency**  | Frequency of rhetorical and engagement queries              |
| **Emoji Density**       | Placement and density of emojis per post                    |
| **First-Person Voice**  | Proportion of active personal narrative (`I`, `we`, `my`)   |
| **Technical Vocab**     | Density of specialized industry and domain terminology      |
| **Contrary Hooks**      | Frequency of contrarian and counter-intuitive opening lines |
| **List / Bullet Usage** | Formatting tendencies toward multi-line structured lists    |

### 2. Resilient AI Fallback Engine

To prevent workflow disruptions caused by API rate-limits (`429 RESOURCE_EXHAUSTED`) or server spikes (`503 UNAVAILABLE`), `@threadpilot/ai` includes an intelligent failover loop that automatically promotes compatible sibling models in real-time:

```
gemini-3.5-flash-lite ──(429/503)──> gemini-flash-lite-latest ──(429/503)──> gemini-3.1-flash-lite ──(429/503)──> gemini-3.7-flash
```

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue for bug reports and feature requests.

# Weirwise Engineering Architecture Audit

Date: 2026-11-05
Scope: `weirwise-rag-core` (retrieval service) and `weirwise-rag-platform` (product platform), including the Next.js frontend and the Admin Control Center.
Method: repository walk-through of the current working trees, plus the measurements already recorded in `CORE_INTEGRATION_TEST_REPORT.md`, `PLATFORM_FUNCTIONAL_TEST_REPORT.md`, `ADMIN_ROUTING_AUDIT.md`, `VOICE_LATENCY_REPORT.md`, and `FINAL_SYSTEM_READINESS_REPORT.md`. Nothing in this document was measured on production; all numbers are from the isolated QA configuration.
Branch: both repositories remain on `develop`. No merge, deployment, force-push, or history rewrite was performed.

**Readiness statement: the architecture is coherent and demonstrable end to end, but it is not production-ready.** The bottlenecks below are ranked by observed impact. Several are already fixed in the working tree and only need measurement and commit; others are open.

> **Status update (2026-11-05, after this audit was written).** The fixes described here have since been committed on `develop`:
> `68e5a26` (Core resource bounds, pooling, cache, memmap, HNSW breadth), `f600dea` (multi-KB tests), `fad5aff` (repository-relative `.env`), `863f334` (provider connection reuse), `0194339` (TTS warm-up), `97c0e48` (public rate limiting), `c8ccf24` (production secret fail-fast), `a02da44` (frontend provider scoping), `892277f` and `0737cff` (test prerequisites).
> The load campaign (B15) has been completed; see `LOAD_AND_STRESS_TEST_REPORT.md`. Remaining unmeasured work is called out in the individual reports. This document's row statuses are updated below.
> The frontend runs **Next.js 14** (installed 14.2.35), not Next.js 16.

---

## 1. System topology

```
Browser (Next.js 14.2.35, RSC + client components)
  │  JWT access token in memory, HttpOnly refresh cookie
  │
  ├── Platform API (FastAPI, 127.0.0.1:8010)
  │     ├── Auth / RBAC / workspaces / projects
  │     ├── Knowledge lifecycle (upload → extract → index → delete)
  │     ├── Assistants, publish readiness, deployments, public runtime
  │     ├── Chat orchestration (SSE) → routing engine → provider
  │     ├── Voice WS proxy → Deepgram STT, TTS proxy → Deepgram speak
  │     ├── Telemetry ingest → Redis pipeline
  │     ├── Admin: providers, credentials, routing, operations, FinOps, audit
  │     └── SQLite (QA) / PostgreSQL (intended production) via async SQLAlchemy
  │
  └── Core API (FastAPI, 127.0.0.1:8003)
        ├── X-API-Key tenancy (project → knowledge base)
        ├── Ingestion (inline or worker) → extract → chunk → embed → pgvector
        ├── Retrieval (cosine over pgvector HNSW, multi-KB in one query)
        └── PostgreSQL 16 + pgvector, Alembic migrations, HNSW index
```

Two process boundaries matter for latency: every chat turn crosses Platform → Core (HTTP) and then Platform → LLM provider; every voice turn crosses Platform → Deepgram twice (STT stream, TTS). Both are network-bound.

### 1.1 Core request path (retrieval)

1. `POST /api/v1/search` (or chat retrieval call) validates the `X-API-Key` and resolves the project.
2. The query is embedded with `gemini-embedding-001` (1536 dims) through an OpenAI-compatible endpoint. A per-process bounded TTL LRU cache serves identical query text without a provider call.
3. One embedding is reused for every attached knowledge base (`knowledge_base_ids`), instead of one embedding per KB.
4. SQL runs cosine distance over `document_chunks` with a KB filter; inside a nested transaction the session sets `SET LOCAL hnsw.ef_search` so selective filters do not under-return rows.
5. Results are ordered, capped at `top_k`, and returned with document metadata and tenant scoping.

### 1.2 Core ingestion path

1. Upload is streamed to disk with a size cap and a signature check (PDF `%PDF-`) instead of buffering the whole file in memory.
2. Text extraction supports PDF, DOCX (paragraphs + table cells), Markdown, CSV, JSON and plain text; undecodable bytes fail the document instead of indexing replacement characters.
3. Chunking is deterministic; embeddings are generated in batches with retry on transient 429/5xx.
4. Vectors are staged in a disk-backed `numpy` memmap, then inserted in batches of 500, keeping worker RSS bounded for very large documents.
5. Jobs use claim-token fencing so a restarted worker cannot double-complete a job; inline and worker modes share the same terminal-state handling.

### 1.3 Platform chat path

1. SSE endpoint authenticates the user, loads the assistant, and resolves attached knowledge.
2. Retrieval is requested from Core; citations are attached to the answer.
3. The routing engine filters providers by enabled flag, credential health, cooldown, budget and rate limit, then attempts providers in order.
4. A provider 429 places the credential on a Retry-After-bounded cooldown and the next eligible provider is tried. An admin emergency stop blocks routing entirely.
5. `done` carries provider, model, token counts and estimated cost; the ledger is written for FinOps.

### 1.4 Voice path

1. Browser opens `WS /api/v1/voice/stream?language=…` with the `wwp-voice` subprotocol; the JWT is validated before the upstream socket opens.
2. Platform proxies audio frames to Deepgram STT and transcripts back. `SpeechStarted` drives barge-in; `UtteranceEnd` triggers the chat turn.
3. The answer is sentence-chunked; each sentence is sent to `POST /voice/speak`, which streams MP3 from Deepgram with a pooled client.

---

## 2. Measured baseline (QA configuration, real providers)

| Path | Metric | Observed | Source |
|---|---|---|---|
| Core retrieval, 16-query corpus | Recall@1/3/5, Precision@1, MRR | 1.000 / 1.000 / 1.000 / 1.000 / 1.000 | `FINAL_SYSTEM_READINESS_REPORT.md` |
| Core retrieval | p50 / p95 latency | 1,204 ms / 1,575 ms | same |
| Core retrieval, 10 concurrent | p95 | 1,672 ms | same |
| Core ingestion | PDF/MD/CSV/JSON/DOCX | pass, 1536-dim vectors persisted | `CORE_INTEGRATION_TEST_REPORT.md` |
| Platform SSE chat | first delta with provider failover | ~9.8 s | `FINAL_SYSTEM_READINESS_REPORT.md` |
| Platform SSE chat | end of speech → `/chat/stream` first byte | 266 ms | `VOICE_LATENCY_REPORT.md` |
| Voice | end of speech → assistant audio | 1,683 ms | `VOICE_LATENCY_REPORT.md` |
| Voice | final transcript after speech onset | 1,763 ms | same |
| Voice | TTS first byte | 933–1,029 ms | same |
| Voice | barge-in pause after speech detected | 142 ms / 178 ms | same |
| Frontend production build | shared JS / middleware | 87.2 kB / 26.9 kB | current `npm run build` |

Retrieval quality is saturated on the synthetic corpus; that result validates the pipeline, not broad-domain quality. It is not evidence of production accuracy on customer data.

---

## 3. Bottleneck map (ranked)

Severity reflects user-visible impact under the mission priorities: speed, accuracy, reliability, security, resources, simplicity.

| # | Bottleneck | Evidence | Root cause | Status |
|---|---|---|---|---|
| B1 | First chat token under provider failover reached ~9.8 s | SSE run with Gemini 429 → OpenRouter | Sequential provider attempts; the failed attempt is paid in full before failover | Partially addressed — connection reuse committed (`863f334`); first-token latency not re-measured |
| B2 | Retrieval p50 ~1.2 s, dominated by the embedding round trip | p50 1,204 ms vs. sub-100 ms SQL | Remote embedding provider over TLS per query | Implemented (`68e5a26`); post-change latency BLOCKED by embedding quota |
| B3 | Weak cached retrieval on repeated questions | Code inspection | Cache is per-process and TTL-only; no warm start after restart | Implemented (`68e5a26`); hit rate still unmeasured |
| B4 | Telemetry ingest returns 503 without Redis | Platform log: `Redis pipeline unavailable … REDIS_URL is not configured` on every batch | Hard dependency on Redis for an optional analytics sink | Fixed — accepts and drops when unconfigured; 503 only when configured-but-unreachable |
| B5 | SQLite serializes writes in QA | Configuration, not code | QA database choice | Accepted for QA only; PostgreSQL required before production |
| B6 | Inline ingestion blocks the upload request | `ingestion_mode=inline` default | Upload response waits for extraction/embedding | Documented; worker mode is the production path |
| B7 | TTS warm-up issues a `GET /v1/speak` that Deepgram rejects with 400 | Repeated `400 Bad Request` in live logs | Warm-up probe uses a method the endpoint does not accept | Fixed (`0194339`) — HEAD warm-up; not re-timed |
| B8 | HNSW can under-return with selective KB filters | Code comment and fix | Approximate index + restrictive filter | Fixed and committed (`68e5a26`) |
| B9 | Large uploads could exhaust worker RSS | Prior audit incident | Whole-document embedding arrays held in memory | Fixed and committed (`68e5a26`) |
| B10 | Unbounded queries could exhaust the host | Prior WSL incident | No statement timeout | Fixed and committed (`68e5a26`) |
| B11 | Dev-only hard-reload logout | Browser reproduction | `NEXT_PUBLIC_API_URL` is `127.0.0.1` while the app runs on `localhost`; SameSite refresh cookie is not restored cross-site | Environment artifact; document, do not "fix" in product code |
| B12 | Admin screens expose internal vocabulary | UI review | Admin audience is operators; customer surfaces were cleaned | Accepted for admin; customer copy pass committed |
| B13 | Public runtime has no per-IP abuse control beyond widget key + origin | Code inspection | Only deployment key, origin allowlist and session token | Fixed (`97c0e48`) — per-IP and per-deployment limits |
| B14 | Provider cost/latency telemetry depends on the same process that serves chat | Code inspection | In-process ledger writes; no buffered/asynchronous sink | Open — reliability task |
| B15 | No measured soak/load numbers for Platform | Missing evidence | Stress campaign not yet run | Completed — `LOAD_AND_STRESS_TEST_REPORT.md` (0 errors, ~90 req/s) |

---

## 4. Component assessment

### 4.1 Core

Strengths: clear tenancy boundary, per-statement timeout, pooled connections with `pool_pre_ping`, deterministic chunking, multi-KB retrieval in one embedding call, explicit failure states for ingestion, and idempotent deletion cascades.

Weaknesses: retrieval latency is provider-bound; there is no reranker or hybrid lexical signal, so exact-identifier queries rely entirely on the embedding model; the quality corpus is synthetic and small; cache effectiveness is unmeasured.

### 4.2 Platform backend

Strengths: credential encryption at rest, routing cooldown and breaker behavior, admin emergency stop, publish-readiness gating, origin and widget-key enforcement on public chat, plain-language customer errors with technical detail preserved in logs, and a token/cost ledger.

Weaknesses: provider failover is sequential; telemetry has a hard Redis dependency; the QA database serializes writes; public runtime rate limiting is absent; there is no asynchronous job queue for non-ingestion work.

### 4.3 Frontend

Strengths: static rendering where possible, small shared bundle, centralized friendly-error mapping, progressive disclosure for advanced assistant controls, and plain-language copy verified in the browser.

Weaknesses: the dev cross-origin configuration hides session-restore behavior during hard navigation; admin bundles are large; no performance budget is enforced in CI.

### 4.4 Operational guardrails already in place

- `statement_timeout` and pool limits on Core PostgreSQL connections.
- Upload size cap and streaming read (bounded memory).
- Embedding cache and provider connection pool are bounded and disposable.
- No unbounded vector query exists in the code path; retrieval is always `top_k`-limited and KB-filtered.
- Test suites run with pooling disabled to avoid asyncpg cross-loop reuse.

---

## 5. Prioritized engineering plan

Ordered to match the mission priorities.

1. **Provider failover latency (B1)** — cap the time spent on a failing provider, classify retryable failures before the first token, and prefer a healthy provider when the primary is cooling. Measure first-token p50/p95 across three failover scenarios.
2. **Retrieval latency (B2/B3)** — commit and measure the pooling + cache work; record cache hit rate and p50/p95 with warm and cold cache. Do not add a reranker until the latency budget allows it.
3. **Telemetry degradation (B4)** — make a missing Redis sink non-fatal and rate-limited in logs; the frontend must not retry aggressively on 503.
4. **Voice warm-up noise (B7)** — replace the invalid GET warm-up with a method Deepgram accepts, or suppress its expected 400 from normal logs.
5. **Public runtime abuse control (B13)** — add bounded rate limiting per deployment/IP with clear 429 behavior and admin visibility.
6. **Cost/latency telemetry durability (B14)** — buffer ledger writes and flush on shutdown; never lose spend data because a request was cancelled.
7. **Load, stress and soak (B15)** — progressive ramp with the documented safety thresholds, isolated QA data, statement timeouts, and automatic stop conditions. No unbounded vector queries.
8. **Frontend budget** — record route-level bundle sizes and enforce a CI budget; keep the customer path free of technical vocabulary.

Each step must be verified before the next: type-check/build for frontend changes, `pytest` for Core, targeted API checks for Platform, and browser verification for user-visible behavior.

---

## 6. Risks and constraints carried forward

- **Critical dependency advisory:** `next@14.2.35` is installed; `npm audit --omit=dev` reports 1 critical (Next.js) and 1 high (`postcss`). The available fix is the breaking `next@16.4.5` upgrade, which has not been performed. Production is blocked on this.
- All work stays on `develop`; no merge to `main`, no deployment, no force-push, no shared-history rewrite.
- QA data, uploads, databases and artifacts stay outside Git.
- No embedding-model change, and no re-embedding of existing data, without an explicit migration, backup and approval.
- Stress tests must set explicit memory/concurrency limits, increase load progressively, and stop automatically at safety thresholds.
- Missing credentials or permissions are reported as BLOCKED, never replaced by mocks and reported as PASS.
- Secrets are never printed.

## 7. Conclusion

The architecture has a clear separation of concerns and the critical resource guardrails are now committed. Public-runtime rate limiting and the telemetry degradation behavior are in place, and the load campaign completed with zero errors. The largest remaining user-visible risk is provider failover latency, which has been structurally improved but not re-measured, followed by the unresolved critical Next.js advisory and the absence of a shared Redis-backed state for multi-worker correctness. This audit does not support a production-readiness claim; see `FINAL_ENGINEERING_READINESS_REPORT.md`.

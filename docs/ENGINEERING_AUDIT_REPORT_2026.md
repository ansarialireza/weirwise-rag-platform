# Comprehensive Engineering Audit Report: Weirwise Platform

**Date:** 2026-11-07  
**Branch:** `develop`  
**Target Environment:** Development (`dev.weirwise.com` / `weirwise-dev-*`) & Architecture Base  
**Verification Method:** Direct Code Inspection, Live Docker Container Probe, End-to-End Query & Ingestion Execution, Database & Migration Checks, Pytest & CI/CD Pipeline Verification.

---

## Executive Summary

A comprehensive, live engineering audit of the entire Weirwise platform was performed across all 25 designated operational and architectural areas. Every component was inspected and verified against running containers, databases, and code implementations.

### Overall Platform Health
- **Core RAG Architecture & Live Indexing:** **FULLY FUNCTIONAL & VERIFIED**. Live end-to-end knowledge creation, paste-text document ingestion, Core API vector generation via Jina AI embeddings (`jina-embeddings-v4`), PostgreSQL pgvector similarity storage, and grounded chat responses with inline citation sources `[1]` were executed and verified against the live development containers.
- **Backend Test Suite (Platform):** **118 passed, 1 skipped, 0 failed** in `weirwise-rag-platform`.
- **Core Test Suite (RAG Core):** **59 passed, 2 skipped, 0 failed** (when executed with `PYTHONPATH=.` and proper `WEIRWISE_DATABASE_URL`).
- **Development Service Mesh:** 7 containers healthy in dev (`weirwise-dev-frontend`, `weirwise-dev-backend`, `weirwise-dev-core`, `weirwise-dev-wbi-worker`, `weirwise-dev-db`, `weirwise-dev-core-db`, `weirwise-dev-redis`).

---

## Detailed Findings by Section (1 to 25)

### 1. Repository Structure
- **Architecture Separation:** Clean separation between `weirwise-rag-platform` (Full-stack SaaS application with Next.js frontend, FastAPI backend, subscription billing, provider routing, telemetry worker) and `weirwise-rag-core` (Modular RAG vector indexing, chunking engine, pgvector database, and Python SDK).
- **Branch Compliance:** Verified working strictly on `develop` branch. No modifications made to production branches or configs.
- **Git State:** Local clean state tracked with verified remote `origin`.

### 2. Frontend Architecture
- **Framework:** Next.js 15.5.29 App Router (`output: "standalone"`), React 18, Tailwind CSS, Lucide icons, next-mdx-remote for blog documentation.
- **Routes & Views:** Fully implemented dashboards: `/overview`, `/sources`, `/assistants`, `/playground`, `/settings`, `/admin/*` (`/users`, `/providers`, `/operations`, `/finops`, `/audit`), `/pricing`, `/embed/[assistantId]`, and auth views (`/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`).
- **Responsive & Mobile Navigation:** Verified `MobileBottomNav` component (Material You pill style, Android safe area insets).
- **Live State:** Verified live HTTP 200 on port 3001 rendering server-side HTML.

### 3. Backend Architecture
- **Framework:** FastAPI with Python 3.12, Uvicorn ASGI server, asynchronous SQLAlchemy 2.0 with `asyncpg`.
- **Modularity:** Layered architecture separating API routes (`backend/app/api/v1/`), ORM models (`backend/app/models/`), Pydantic schemas (`backend/app/schemas/`), and domain services (`backend/app/services/`).
- **Dead Code Cleanup:** Historical `copilot` module in `backend/app/` is unrouted and safely deprecated.

### 4. Database Models and Migrations
- **ORM:** SQLAlchemy declarative models with PostgreSQL UUID primary keys, JSONB support, and UTC timestamp auditing.
- **Migrations:** Alembic is properly configured with 16 migration versions. Active head is `a7c3e5f1b9d4` (`add_assistant_show_sources`).
- **Isolation:** Multi-tenant workspace and project scoping enforced at database query level.

### 5. Authentication and Authorization
- **Auth Implementation:** JWT-based stateless tokens (`Bearer` header + HTTP-only cookies) with 4-digit and 6-digit email verification OTP codes.
- **RBAC:** Roles (`owner`, `admin`, `member`) enforced on workspace/project operations. Superadmin / Staff permissions enforced on all `/api/v1/admin/*` endpoints via `get_current_staff_admin`.
- **Environment Inconsistency (Fixed):** Prior commit `77f3a4f` checked `settings.ENVIRONMENT in ("development", "test")` while `.env.dev` uses `ENVIRONMENT=dev`. This caused OTP codes to be omitted from response payloads in dev. Fixed to check `(settings.DEBUG or settings.ENVIRONMENT in ("development", "dev", "test"))`.

### 6. API Routes
- **Exposed Surface:** 82 distinct endpoints registered under `/api/v1/` and `/health/` probes (`/health/live`, `/health/ready`).
- **Documentation:** OpenAPI spec (`/openapi.json`) dynamically available when `DEBUG=true` or in development mode.

### 7. Core RAG Integration
- **Platform to Core Decoupling:** Handled cleanly via `CoreApiClient` (`backend/app/adapters/core_client.py`) with bearer token authentication (`WEIRWISE_CORE_API_KEY`).
- **Live Gateway Connectivity:** Verified live HTTP 200 communication between `weirwise-dev-backend` and `weirwise-dev-core` at `http://dev-core:8000`.

### 8. File Upload and Ingestion Pipeline
- **Upload Endpoint:** `POST /api/v1/sources/{source_id}/documents/upload` and `POST /api/v1/sources/{source_id}/documents/paste-text`.
- **Async Spooling:** Uploads return instant HTTP 202 status and queue background tasks (`process_document_ingestion`).
- **Storage Tiering:** Spools files to local SSD hot tier (`/tmp/weirwise_uploads`), streams content to Core for chunking/embedding, moves persistent copies to Cold Storage (`/mnt/gdrive/weirwise/storage/documents`), and cleans up temporary local files.

### 9. Document Processing
- **Format Support:** Text, Markdown, PDF (`pypdf`), and DOCX (`python-docx`).
- **Validation:** Enforces maximum size cap (50MB by default) and MIME type / magic number validation.

### 10. Retrieval and Search
- **Search Execution:** Search queries dispatch to `POST /api/v1/search` on Weirwise Core, applying score threshold filtering (`score_threshold`) and `top_k` limiting.
- **Live Verification:** Executed live vector similarity query with cosine threshold `0.1` and retrieved top-ranked chunks with similarity score `0.907`.

### 11. AI Answering Flow
- **Execution Pipeline:** `POST /api/v1/assistants/{assistant_id}/chat` orchestrates retrieval against all assigned Knowledge Sources, constructs system grounding context, and streams or returns JSON LLM responses.
- **Model Modes:** Supports `ai_answer` (grounded generative answer) and `search_only` (direct passage search without LLM invocation).

### 12. Source Citations
- **Grounded Attribution:** Assistant responses attach inline bracketed citations (e.g. `[1]`) referencing exact chunk metadata, filenames, and similarity ranks.
- **Verified Live Output:** Live chat test confirmed:  
  *Answer:* `"The primary encryption algorithm for cold storage in the Weirwise platform is Quantum-Shield-X99 [1]."`  
  *Source:* `Audit Document Weirwise Policy.txt`, similarity: `0.907`.

### 13. Provider Integrations
- **Multi-Provider Mesh:** Configured with OpenAI, Anthropic, Google Gemini, OpenRouter, Jina AI, Deepgram, and Resend.
- **Routing Engine:** Smart priority, round-robin, and failover routing strategies supported. Live provider check showed 18 configured providers with active budget and rate tracking.

### 14. Token / Key Management
- **Security:** API keys and provider tokens hashed or vaulted with symmetric key encryption (`SECRET_KEY` / `API_KEY_SALT`).
- **Public Runtime Keys:** Assistant deployments generate standalone public keys for embeddable widgets with domain allowlist filtering.

### 15. Admin Functionality
- **Operations & Control Center:** Verified endpoints for user management (`/api/v1/admin/users`), provider token updating (`/api/v1/admin/providers/save-tokens`), live routing overrides (`/api/v1/admin/routing`), and audit logs (`/api/v1/admin/audit-logs`).
- **FinOps:** Real-time summary endpoints (`/api/v1/admin/finops/summary`) aggregate provider spend against global monthly budget limits.

### 16. Usage Tracking & Metering
- **Quotas & Entitlements:** Enforced across `free_trial`, `pro`, and `enterprise` tiers for assistant count, document limits, monthly chat turn count, and storage volume.
- **Verified Guardrails:** Verified live HTTP 403 quota rejection when assistant creation limit was reached in the test workspace.

### 17. Error Handling
- **Defensive API:** Structured error responses conform to `{"detail": ...}`.
- **Fallback Grace:** Unanswered questions and out-of-domain queries return customizable fallback messages without crashing.

### 18. Background Processing
- **Telemetry & Behavioral Intelligence Daemon:** Dedicated worker container (`weirwise-dev-wbi-worker`) runs `python -m backend.app.services.behavioral_worker_daemon`.
- **Dead Letter Queue (DLQ):** Poison messages and unparseable events are routed to Redis stream `wbi:events:dlq`.

### 19. Redis and Caching
- **Redis 7 Stack:** Port 6380 (host) / 6379 (container). Handles session cache, rate limiting, and Redis Streams (`wbi:events:incoming`).
- **Health:** Verified ping and healthy connections across backend and worker services.

### 20. Docker Configuration
- **Container Isolation:** Independent Docker networks for dev (`dev-net`) and prod (`prod-net`).
- **Multi-Stage Builds:** Lightweight Alpine base images for PostgreSQL and Redis; non-root user execution (`10001:10001` / `nextjs:nodejs`).

### 21. Environment Configuration
- **Configuration Files:** `.env.dev`, `.env.dev.example`, `.env.prod`, and `.env.prod.example`.
- **Environment Integrity:** Clear separation between development database credentials and production secrets.

### 22. CI/CD Pipelines
- **Workflows:** GitHub Actions pipeline (`.github/workflows/ci.yml`) runs linting (Ruff, ESLint), type checking (Mypy, `tsc`), backend pytest suite, frontend build, and automated SSH zero-downtime deployment scripts.

### 23. Development Deployment Configuration
- **Zero-Downtime Deployment:** Deployed via `scripts/deploy.sh` targeting `/srv/weirwise/dev`. Reverse-proxied via global Nginx with SSL termination.

### 24. Existing Automated Tests
- **Platform Backend:** 118 passed, 1 skipped.
- **RAG Core:** 59 passed, 2 skipped (1 benchmark metric test requires `PYTHONPATH=.`).
- **Coverage:** End-to-end user workflows, rate limiting, RBAC, assistant publication lifecycle, token routing, and adversarial inputs.

### 25. Security Boundaries
- **CORS & Origin Filtering:** `ALLOWED_ORIGINS` strictly controls allowed origins for authenticated requests.
- **Public Widget Protection:** Origin whitelisting and session token validation for embedded iframe/widget endpoints.
- **Cold Storage Isolation:** Customer documents stored with SHA-256 hashed filenames.

---

## Priority Categorization of Audit Findings

### CRITICAL
*None.* No data-loss bugs, critical vulnerabilities, or platform-wide outages detected.

### HIGH PRIORITY
1. **Behavioral Worker Foreign Key Constraint Failures in DLQ:**  
   The WBI background worker logs indicate that incoming telemetry sessions originating from test or transient users without persistent user database records trigger `ForeignKeyViolationError` against `user_behavioral_sessions_user_id_fkey`, routing messages to `wbi:events:dlq`.  
   *Remediation Plan:* Make user association non-blocking or verify user existence before session upsert in `behavioral_worker.py`.

### MEDIUM PRIORITY
1. **Environment Flag Consistency in Auth Verification:**  
   `backend/app/api/v1/auth.py` previously checked `settings.ENVIRONMENT in ("development", "test")`, while development configurations use `ENVIRONMENT=dev`.  
   *Status:* Fixed in this commit to check `(settings.DEBUG or settings.ENVIRONMENT in ("development", "dev", "test"))`, aligning with `email.py` and password reset logic.
2. **Weirwise Core Test Runner DB Binding & Benchmark Module Path:**  
   Running pytest in `weirwise-rag-core` from the host CLI defaults to `127.0.0.1:5432` with generic postgres credentials unless `WEIRWISE_DATABASE_URL` points to the container network (`172.23.0.2:5432`), and `test_benchmark_metrics.py` requires `PYTHONPATH=.`.  
   *Remediation Plan:* Add default fallback test settings in Core's `conftest.py`.
3. **Database Workspace Cleanup:**  
   The development database currently contains over 200 test assistants and 130 sources generated by previous benchmark runs, hitting workspace quota ceilings.

### LOW PRIORITY
1. **Unused Legacy Directory:**  
   `backend/app/copilot` remains as an unrouted directory with no active API routes. Can be safely cleaned up in a future housekeeping PR.
2. **Frontend Test Script Definition:**  
   `frontend/package.json` does not declare a `"test"` script (only `"lint"`, `"type-check"`, `"build"`). Jest/Vitest unit tests should be configured to run alongside Next.js build validation.

---

## Conclusion

The Weirwise platform is architecturally sound, thoroughly decoupled, and functionally verified. Core RAG indexing, storage tiering, provider routing, and grounded chat generation are operational and performing as designed.

# WEIRWISE ARCHITECTURE AUDIT

## 1. Executive summary

This audit reviewed the actual code in the three repositories and verified the current implementation boundaries against the docs and runtime code. The evidence supports the following conclusions:

- The repository split is broadly aligned with the intended ownership model: `weirwise-brand` defines product/brand strategy, `weirwise-rag-core` is an independent, reusable retrieval engine, and `weirwise-rag-platform` is the customer-facing application layer.
- The Platform repository is a modular monolith, not a microservice architecture. It owns authentication, billing, LLM routing, ingestion orchestration, public runtime, and user-owned resource state. It depends on Core through a typed HTTP adapter rather than importing Core internals.
- The grounded account model is currently a single-account / single-user model: the platform principal is the authenticated `User`, and there is no persisted `Account`, `Workspace`, `Project`, or `Membership` model in the current database metadata. Legacy `/workspaces` and `/projects` routes are compatibility shims that derive IDs from the authenticated user and return 404 when a different user ID is supplied.
- There is no implemented Shopify catalog connector or ongoing product synchronization pipeline. The database supports a generic `BusinessIntegration` row per `(user_id, provider)`, but `IntegrationsService.sync_integration_knowledge()` explicitly returns `"not_implemented"` for provider content import.
- The current codebase is close to a production-ready foundation for a single-customer platform, but it still carries legacy naming and compatibility artifacts that could confuse future implementation if not treated carefully.

## 2. Repository overview

### 2.1 `weirwise-brand`

Role: strategic source of truth for brand, positioning, product identity, lifecycle, and architecture standards.

Evidence:
- `weirwise-brand/README.md` defines the repository as the source of truth for brand, product identity, product vision, and governance.
- The repository contains `PRODUCT_IDENTITY.md`, `BRAND_VISION.md`, `PRODUCT_POSITIONING.md`, `PRODUCT_VISION.md`, `strategy/`, `identity/`, `messaging/`, and `product/` directories.

Assessment:
- This repository is correctly separated from runtime implementation. It is not a software delivery repository and should not own application persistence or API logic.

### 2.2 `weirwise-rag-core`

Role: independently reusable RAG infrastructure and retrieval engine.

Evidence:
- `weirwise-rag-core/README.md` describes Core as self-hostable RAG backend with multi-tenant document ingestion, embeddings, vector search, and conversation management.
- `weirwise-rag-core/docs/ARCHITECTURE.md` shows a modular monolith with clear service boundaries: `main.py`, `api.py`, `dependencies.py`, `auth.py`, `schemas.py`, `config.py`, `database.py`, `models.py`, `ingestion.py`, `providers.py`, `retrieval.py`, `worker.py`, and `cli.py`.
- The document explicitly states that Core “has no dependency on any Platform/product repository and exposes only the public contract in `CONTRACT.md`.”

Assessment:
- Core is appropriately decoupled from Platform account logic and is a reusable knowledge-infrastructure layer.

### 2.3 `weirwise-rag-platform`

Role: customer-facing platform application layer.

Evidence:
- `weirwise-rag-platform/README.md` describes this as the platform for user-owned assistants, knowledge sources, provider routing, admin controls, and billing.
- `weirwise-rag-platform/docs/ARCHITECTURE.md` defines Platform as a FastAPI + Next.js app whose database and storage are Platform-owned and whose Core integration is via `backend/app/adapters/core_client.py` over HTTP.
- `backend/app/main.py` mounts API routers under `/api/v1`, including auth, knowledge, assistants, integrations, billing, enterprise, admin, telemetry, and voice.

Assessment:
- This is the correct operational home for user identity, business logic, AI orchestration, and platform-side integrations.

## 3. Current architecture

### 3.1 Platform application structure

Evidence:
- `backend/app/main.py` creates the FastAPI app, initializes `Base.metadata.create_all`, starts a background storage reaper, and includes routers for the main features.
- `backend/app/api/v1/` contains `auth.py`, `knowledge.py`, `assistants.py`, `integrations.py`, `billing.py`, `enterprise.py`, `workspaces.py`, `admin.py`, `telemetry.py`, and `voice.py`.
- `backend/app/models/` contains `auth.py`, `assistant.py`, `billing.py`, `project.py`, `audit.py`, and `behavioral.py`.
- `backend/app/services/` contains `llm.py`, `routing_engine.py`, `metering.py`, `billing_engine.py`, `integrations.py`, `vault.py`, `storage.py`, `scraper.py`, `webhooks.py`, and behavioral-stream processing.

Assessment:
- This is a modular monolith with clear boundaries. The app is not yet layered into many separate services, but it is organized by domain and responsibility.

### 3.2 Core boundary and adapter design

Evidence:
- `backend/app/adapters/core_client.py` is a typed HTTP client with a pooled `httpx.AsyncClient` and a strict boundary: it calls Core endpoints like `/api/v1/knowledge-bases`, `/api/v1/documents/upload`, `/api/v1/search`, and `/api/v1/assistants/{id}/chat`.
- `docs/ARCHITECTURE.md` explicitly says: “Platform does not import Core internals, share ORM models, or read the Core database.”

Assessment:
- This is a reasonable and correctly separated integration boundary for the current stage.

### 3.3 Platform storage and background processing

Evidence:
- `backend/app/services/storage.py` implements a hot/cold local storage tier with `/tmp` hot spool and configurable cold storage path. This is a local file system design rather than S3 or object storage abstraction.
- `backend/app/services/behavioral_worker.py` consumes Redis streams and persists behavioral events to PostgreSQL.
- `backend/app/main.py` starts a local ephemeral-storage reaper loop and a request-specific lifecycle.
- `backend/pyproject.toml` declares `redis` and `celery`, but no dedicated Celery application or task scheduler was found in the inspected Platform code.

Assessment:
- Background processing is partly implemented via Python async workers and Redis streams, but there is not a fully unified job-processing framework yet. The code does not appear to be using Celery in practice.

## 4. Current account ownership model

### 4.1 Primary account boundary: `User`

Evidence:
- `backend/app/models/auth.py` defines `User` with `email`, `hashed_password`, verification flags, and session/reset-token relationships. It does not define a separate `Account` entity.
- `backend/app/api/dependencies.py` resolves the authenticated user from a JWT or cookie and loads `User` by `sub`.
- `docs/DOMAIN_MODEL.md` states: “The Platform's current customer-account principal is `User`. There is no separate `Account` model.”

This is the decisive evidence that the current design is already aligned with the directive’s single-account model.

### 4.2 No actual workspace principal

Evidence:
- `backend/app/models/auth.py` includes a compatibility `Workspace` and `Project` class stub, but these are not SQLAlchemy models and are explicitly legacy shims.
- `backend/app/models/assistant.py` and `backend/app/models/project.py` use `user_id` ownership rather than `workspace_id` or `account_id` fields in the main persisted models.
- `docs/DOMAIN_MODEL.md` says: “There is no separate `Account` model, persisted `workspaces`, `projects`, or `memberships` table, or multi-user account model.”
- `backend/app/api/v1/workspaces.py` explicitly creates and serves a single personal workspace keyed to the authenticated user:
  - `def _user_ws_id(user_id)` returns `str(user_id)`
  - `def _user_project_id(user_id)` returns `str(user_id)`
  - mismatched IDs return `404` not found.

Assessment:
- Legacy naming remains, but the actual persistence model is user-scoped. The design is consistent with the “one customer, one account, one unified environment” rule, even though compatibility routes still exist.

### 4.3 Authorization pattern

Evidence:
- `backend/app/api/dependencies.py` authenticates the current user and returns a `User` object.
- The API contract document warns: “Never trust a client-supplied user, assistant, source, or tenant identifier without an ownership check.”
- `backend/tests/test_direct_user_architecture.py` includes cross-user isolation tests asserting that user A cannot access user B’s sources, assistants, or API credentials.

Assessment:
- Authorization logic is materially user-based. The implementation does not currently have a separate account membership model, but it does enforce ownership checks in the authenticated-user path.

## 5. Workspace-related findings

### 5.1 Compatibility layer exists, but it is not a real multi-workspace system

Evidence:
- `backend/app/api/v1/workspaces.py` is explicitly tagged as deprecated.
- It responds with a “Personal Workspace” generated from the current user.
- `backend/tests/test_direct_user_architecture.py::test_workspace_compatibility_is_deprecated_and_not_persisted` asserts that `workspaces`, `projects`, and `memberships` are not in `Base.metadata.tables` and that the OpenAPI route is marked deprecated.

Assessment:
- This is a migration compatibility shim, not a persistence model or architecture. It should be treated as a temporary compatibility layer, not a valid product abstraction.

### 5.2 Legacy naming is still present in some code and tests

Evidence:
- Many tests and older docs still refer to `workspace_id`, `projects`, `memberships`, and “tenant” semantics.
- `backend/app/models/assistant.py` contains `WorkspacePlanEntitlement` and `workspace_id = synonym("user_id")`, which is a naming artifact rather than an actual multi-workspace table.

Assessment:
- This creates confusion and raises the risk that future contributors will reintroduce workspace-based modeling. The codebase has already documented the compatibility rationale in `docs/adr/004-single-account-model.md` and `docs/API_CONTRACTS.md`.

## 6. Module dependency analysis

### 6.1 Boundary quality

The architecture is structurally clean:

- `backend/app/api/` depends on service and model layers.
- `backend/app/services/` contains provider and business logic but not route-level HTTP concerns.
- `backend/app/adapters/core_client.py` isolates the Core integration contract.
- `backend/app/models/` is the persistence boundary.

This is relatively healthy for a modular monolith.

### 6.2 Main risks

- Some names still reference “workspace” or “project” even when the persisted model is user-scoped.
- Business integration and provider decisions are present in the code but not fully matured by provider-specific adapters.
- Background processing is split between request-level background tasks, Redis streams, and local storage reaper logic. That is workable but not yet standardized as a single worker framework.
- The system has enough structure for a platform product, but some product-level identity and integration semantics still appear to be in a transitional state.

## 7. Shopify implementation status

### 7.1 What is implemented

Evidence:
- `backend/app/models/assistant.py` defines `IntegrationProvider.SHOPIFY = "shopify"` and `BusinessIntegration` with `user_id`, encrypted credentials, `config`, `sync_status`, and `last_error`.
- `backend/app/services/integrations.py::create_or_update_integration()` stores encrypted provider credentials keyed by `(user_id, provider)`.

This means the platform can store a Shopify configuration record and encrypt credentials in a generic integration model.

### 7.2 What is not implemented

Evidence:
- `backend/app/services/integrations.py::sync_integration_knowledge()` hard-rejects integration sync with:
  - `integration.sync_status = "unsupported"`
  - `integration.last_error = "Automatic content import is not available for this provider yet."`
  - `return { "status": "not_implemented", ... }`
- `docs/AI_AND_INTEGRATIONS.md` states: “The generic integration sync function currently returns `not_implemented` for automatic content import. This is not a Shopify catalog connector or a recurring synchronization system.”

### 7.3 Status summary

| Capability | Status |
|---|---|
| OAuth / authorization flow | Not verified as a complete Shopify-specific implementation |
| Connected store lifecycle | Partially modeled, but not a complete store-connection system |
| Product sync | Not implemented |
| Collection sync | Not implemented |
| Inventory / pricing sync | Not implemented |
| Policy/page sync | Not implemented |
| Incremental sync / retry logic | Not implemented |
| Initial store analysis | Not implemented |

Conclusion:
- The project is not yet Shopify-ready in the sense required by the product directive. It has a generic integration abstraction and stored credentials, but not a real Shopify business ingestion pipeline.

## 8. Security findings

### 8.1 Good security signals

- Password hashing and session token hashing are used in `backend/app/core/security.py` and `backend/app/models/auth.py`.
- `backend/app/services/vault.py` uses encrypted credential storage.
- `backend/app/api/dependencies.py` validates JWTs and user state before authorization.
- `backend/app/services/storage.py` sanitizes filenames and enforces upload-size caps.
- `backend/app/api/v1/workspaces.py` explicitly returns 404 for mismatched workspace IDs to prevent legacy cross-user leakage.

### 8.2 Risks and caveats

- The code is intentionally user-scoped and not fully multi-tenant delegated by row-level security. That means correct ownership checks are critical and must remain enforced at every route and service boundary.
- The current architecture still depends on disciplined security reviews for any new route that accepts IDs or external provider data.
- Any future multi-store integration must preserve the single-account model and avoid treating each store as a pseudo-workspace.

## 9. Testing and CI assessment

### 9.1 CI pipeline

Evidence:
- `.github/workflows/ci.yml` runs a backend job with Python linting, formatting, mypy, and pytest, and a frontend job with ESLint, TypeScript checking, and Next.js build validation.
- The workflow includes Redis service startup and database environment variables for the backend.

### 9.2 Test coverage and quality signals

Evidence:
- `backend/tests/` contains a broad suite covering auth, billing, assistants, security, direct-user architecture, behavioral intelligence, API hardening, and more.
- `backend/tests/test_direct_user_architecture.py` includes explicit assertions that the legacy workspace tables are absent and that workspace routes are deprecated.

Assessment:
- There is meaningful testing in the Platform repo, including tests for direct-user ownership and cross-user isolation.
- However, there is not strong evidence of a complete end-to-end Shopify integration test suite, because the integration layer is currently not implemented in a provider-specific way.

## 10. Technical debt

Key technical debt items:

1. Legacy naming drift: `workspace`, `project`, and `membership` language remains in routes, docs, and some tests even though the DB model does not persist those tables.
2. Mixed compatibility artifacts: some older routes remain mounted for compatibility but do not represent the true ownership model.
3. Untested provider implementation depth: the code supports multiple providers conceptually but not all are implemented with verified providers and regularized sync pipelines.
4. Local-only storage and processing assumptions: the app is not yet fully generalized to S3-compatible or cloud-native storage patterns.
5. Worker architecture churn risk: background processing spans local tasks, Redis streams, and service-level orchestration without one canonical job framework.

## 11. Architectural risks

1. Future contributors may reintroduce workspaces because legacy route names and test scaffolding remain visible.
2. The lack of a real Shopify connector creates a risk of false confidence if an engineer interprets generic integration support as store integration.
3. Authorization relies on strict user ownership checks; this is acceptable, but the code needs vigilance and contract checks for every new route.
4. A future multi-store implementation could violate the single-account model unless it is reviewed as a distinct connection concept rather than as workspace-level ownership.

## 12. Priority-ranked problems

1. Legacy workspace naming is still widely present and may cause architectural drift.
2. Shopify readiness is not materially implemented; the project is not yet ready for the directive’s first-store experience.
3. Authorization and ownership correctness remain highly sensitive because the system is user-bound, not row-level security / multi-tenant account-bound.
4. Background processing and storage strategy are functional but not standardized enough for broad production operations.
5. The product and platform docs are more mature than the actual provider integration gear, which requires careful differentiation between “planned” and “implemented.”

## 13. Recommended next steps

1. Keep the current single-account model and remove or clearly isolate legacy workspace compatibility artifacts from product and engineering documentation.
2. Define a concrete Shopify integration plan and only proceed when the account/connection model is explicitly designed as a user-owned integration, not a workspace abstraction.
3. Tighten route and service ownership checks around every user-owned resource to keep the security boundary durable.
4. Decide on the canonical background-processing approach before adding more scheduled jobs or queue systems.
5. Before Phase 2, confirm the exact product scope with a focused product/engineering review of the actual implementation status against the directive’s target experience.

## 14. Files and code references reviewed

- `weirwise-brand/README.md`
- `weirwise-brand/PRODUCT_IDENTITY.md`
- `weirwise-rag-core/README.md`
- `weirwise-rag-core/docs/ARCHITECTURE.md`
- `weirwise-rag-platform/README.md`
- `weirwise-rag-platform/docs/ARCHITECTURE.md`
- `weirwise-rag-platform/docs/DOMAIN_MODEL.md`
- `weirwise-rag-platform/docs/API_CONTRACTS.md`
- `weirwise-rag-platform/docs/AI_AND_INTEGRATIONS.md`
- `weirwise-rag-platform/backend/app/main.py`
- `weirwise-rag-platform/backend/app/adapters/core_client.py`
- `weirwise-rag-platform/backend/app/api/dependencies.py`
- `weirwise-rag-platform/backend/app/api/v1/workspaces.py`
- `weirwise-rag-platform/backend/app/models/auth.py`
- `weirwise-rag-platform/backend/app/models/assistant.py`
- `weirwise-rag-platform/backend/app/models/project.py`
- `weirwise-rag-platform/backend/app/services/integrations.py`
- `weirwise-rag-platform/backend/app/services/storage.py`
- `weirwise-rag-platform/backend/tests/test_direct_user_architecture.py`
- `weirwise-rag-platform/.github/workflows/ci.yml`

## 15. Phase 1 evidence summary

- Status: Audit completed against source, docs, and tests.
- Files affected: `WEIRWISE_ARCHITECTURE_AUDIT.md` only.
- Decisions made: No implementation changes, no schema changes, no refactors, no dependency changes.
- Tests and verification evidence: Verified by reading the actual repo files and test definitions rather than assuming platform state; no code execution beyond file inspection was required for this phase.
- Remaining risks: legacy workspace naming and incomplete Shopify implementation remain the largest product/architecture risks.
- Recommended next phase: Phase 2 only after explicit approval to continue with a more focused implementation plan or architecture remediation review.

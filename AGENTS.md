# Agent Engineering Instructions

## Purpose and architecture

Weirwise Platform is the product application: a FastAPI backend, a Next.js 15 / React / TypeScript frontend, its own application database and background services, and operational tooling. This repository and its software are licensed under MIT; preserve the license and copyright notices. The hosted service may be commercial while its source remains MIT-licensed. Its integration with Weirwise Core must use Core's public REST API through the existing adapter and documented contracts. Never import Core internal modules, share ORM models, access Core's database directly, or collapse the separate service/database boundaries. Keep Core release/version compatibility explicit and traceable when changing the integration.

Preserve tenant isolation, authentication and authorization checks, secure session behavior, encrypted credential handling, and safe public runtime behavior. Maintain backend/frontend API compatibility. Follow the established frontend component, localization, responsive layout, accessibility, and design-token conventions. Ordinary customer experiences should describe knowledge and assistant behavior in plain language; progressively disclose RAG, embeddings, chunking, vector search, prompts, and retrieval tuning only in developer or advanced contexts.

Consult `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/DEVELOPMENT.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACTS.md`, `docs/DOMAIN_MODEL.md`, `docs/DATA_AND_MIGRATIONS.md`, `docs/AI_AND_INTEGRATIONS.md`, `docs/FRONTEND_ARCHITECTURE.md`, `docs/TESTING.md`, and `docs/adr/001-architecture-boundaries-and-core-decoupling.md`, plus backend `pyproject.toml`, frontend `package.json`, and `.github/workflows/ci.yml`. These local instructions and docs are sufficient to work in Platform without access to Brand. When documents conflict, inspect current code and active accepted ADRs; do not treat roadmap material or aspirational ADR decisions as implemented behavior.

The product model is one customer account and one unified management space. In the current
implementation, the authenticated `User` is the account principal; do not introduce a separate
`Account`, workspace, project, or membership entity without a concrete requirement and an approved
design. Customer-owned Platform records are authorized from the authenticated user. There is no
persisted `workspaces`, `projects`, or `memberships` table and no database row-level security.
Workspace-named auxiliary rows and legacy routes are compatibility artifacts, not product
capabilities. Do not trust browser-selected identifiers for ownership.
The Platform's own Core REST adapter is the only service boundary to Core. For product scope,
distinguish the current internal Weirwise assistant from the future self-serve business platform.

## Working practices

Inspect relevant implementation, tests, docs, configuration, and Git status before editing. Plan multi-file, architectural, database, security, authentication, deployment, and API changes before implementation. Keep work focused. Add or update tests for meaningful behavior changes, covering tenant boundaries, permissions, API contracts, and frontend behavior as appropriate. Follow the configured Ruff, Mypy, Pytest, TypeScript, and Next.js conventions. Do not run migrations against unspecified or shared databases.

Codex is explicitly authorized to commit and push changes to `develop` without further approval, including pushes that automatically deploy to development. Create and use feature branches and worktrees when useful. Merging into `main`, pushing directly to `main`, or triggering production deployment always requires explicit user approval. Never perform production deployment without that approval; never assume GitHub environment approval is configured. Do not change deployment scripts without a dedicated implementation plan and review. Keep Platform and Core release versions compatible and record the chosen versions/commits for release work.

Keep changes focused and independently reviewable; tests do not replace inspection of the actual diff. A push to `develop` can automatically deploy to development, so record the actual deployed commit/result after an authorized push. Cross-repository governance in Brand may be consulted when available, but this repository's instructions, tests, and local docs define the minimum workflow and do not require Brand to be present.

## Verification

Run relevant checks when authorized and feasible, and report exact commands and actual results. Never claim verification without evidence. Documented commands include:

- Backend (from `backend/`): `ruff check .`, `ruff format --check .`, `mypy app`, `pytest -v tests`
- Frontend (from `frontend/`): `npm run lint`, `npm run type-check`, `npm run build`
- CI uses Python 3.12, Node 20 and Redis; Redis-dependent tests may skip when Redis is unavailable. Report skips and missing infrastructure clearly.

Pull requests must include the independent QA report and actual check evidence required by `.github/pull_request_template.md`.

## Security and data handling

Never expose secrets or inspect secret values unnecessarily. Never commit credentials, private keys, tokens, customer data, or production configuration. Use `.env.example` as the configuration reference; keep actual `.env*` files private. Preserve credential encryption and masking; never log or return raw secrets. Treat tenant IDs and user-controlled object IDs as authorization boundaries and validate access on every relevant request.

Keep runtime data, uploads, generated databases, caches, build output, and mutable artifacts outside tracked source directories. This includes `data/`, `uploads/`, `var/`, local `*.db`/SQLite files, artifacts/reports, `node_modules/`, `.next/`, and deployment state. Preserve ignore rules. Do not repurpose real customer records as test fixtures.

Inspect before modifying. Preserve existing functionality. Never shut down Windows; if a shutdown timer is pending, cancel it with `shutdown /a`.

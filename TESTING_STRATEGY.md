# Weirwise Platform Testing Strategy

## Purpose and boundaries

Tests protect the Platform modular monolith and its HTTP boundary to Core. Platform tests must not
import Core internals, share its database, or use real customer records. A successful test suite
covers only the behavior it executes; it is not evidence of complete coverage or production
readiness.

## Test ownership and categories

| Area | Test category and owning location |
|---|---|
| Identity and sessions | Auth API and lifecycle tests in `backend/tests/test_auth.py`, plus token/security regressions. |
| Resource ownership and authorization | API tests in `test_direct_user_architecture.py`, `test_api_quality_hardening.py`, `test_security_regressions.py`, and `test_security_and_lifecycle_hardening.py`. |
| Knowledge and ingestion | Service/API lifecycle tests in `test_e2e_workflow.py`, `test_assistant_source_display.py`, `test_paste_text_regression.py`, and security lifecycle tests. |
| Assistant configuration and publishing | Assistant API and public-runtime contract tests in `test_assistants_extended.py`, `test_assistant_source_display.py`, and `test_business_platform_suite.py`. |
| Integrations | Credential persistence, account scoping, webhook, and API contract tests. Provider-specific Shopify OAuth and catalog synchronization are not implemented and therefore do not have provider integration coverage. |
| Billing, usage, and routing | Unit/service and API tests in `test_billing*.py`, `test_admin_routing_hardening.py`, and routing suites. |
| Redis-dependent behavior | Redis stream/rate-limit tests use the shared `requires_redis` marker in `backend/tests/conftest.py`; the CI job provides Redis. |
| Platform-to-Core boundary | Mocked contract tests run in the normal suite. `test_live_platform_core_integration.py` is opt-in and requires a separately configured Core service/database and provider credentials. |
| Frontend API journeys | Node built-in test runner tests the API client's registration/verification/login/session, assistant setup/publish readiness/publish, and safe error translation in `frontend/tests/`. |
| Browser/UI journeys | No browser component or end-to-end suite is currently part of CI. The existing repository Playwright audit script is a separate manual harness and is not run by the normal test commands. |

## Account isolation is mandatory

Tests for each new customer-owned route or job must use at least two independently registered
users and verify the denied operation, not merely the successful owner's path. Include:

- foreign-resource reads and lists;
- updates and deletions;
- assistant-to-source links and search/retrieval using foreign source IDs;
- integration listing, sync, and deletion;
- background-job owner context, including legacy records with nullable direct owner fields;
- unauthenticated access and explicit staff/admin authorization.

The current regression suite exercises these boundaries in
`backend/tests/test_direct_user_architecture.py` and
`backend/tests/test_security_and_lifecycle_hardening.py`. Platform derives ownership from the
authenticated `User`; request payload IDs are not proof of ownership. Core remains a separate
service and the Platform must authorize its stored Core references before sending requests.

## Local commands

### Backend

Run from `backend/` with the repository's backend development dependencies installed:

```text
python -m ruff check .
python -m ruff format --check .
python -m mypy app
python -m pytest -v --tb=short tests
```

Focused ownership and lifecycle regression set:

```text
python -m pytest -q tests/test_direct_user_architecture.py tests/test_security_and_lifecycle_hardening.py tests/test_billing.py tests/test_admin_routing_hardening.py tests/test_assistant_source_display.py
```

Migration graph/syntax check (run from the repository root; this does not connect to or alter a
database):

```text
alembic -c backend/alembic.ini heads
python -c 'import ast, pathlib; [ast.parse(path.read_text(encoding="utf-8"), filename=str(path)) for path in pathlib.Path("backend/alembic/versions").glob("*.py")]'
```

The graph must have one head. These checks do **not** apply migrations or validate upgrade/downgrade
behavior against PostgreSQL.

### Frontend

Run from `frontend/`:

```text
npm ci
npm run lint
npm test
npm run type-check
npm run build
```

`npm test` uses Node's built-in test runner and the already-installed TypeScript compiler to test
API-client behavior. It adds no runtime or development dependency. It is not a DOM, component, or
browser test.

## Test data and required environment

- The normal backend test setup creates a unique SQLite database under the operating system's
  temporary directory, then disposes it at session end. Tests using `tmp_path` also keep generated
  files outside the repository. Do not set `WEIRWISE_TEST_DATABASE_URL` unless it points to an
  explicitly disposable test database; never point tests at a shared, staging, or production
  database.
- Normal API/unit tests do not require Core credentials or a live provider. Redis-dependent tests
  run only when `REDIS_URL` is configured and reachable; otherwise those marked tests skip.
- CI sets `SECRET_KEY`, `ENVIRONMENT`, and a dummy `WEIRWISE_CORE_API_KEY` for the test process and
  starts a disposable Redis service. It does not configure live Shopify, Core, payment, or LLM
  credentials.
- `RUN_LIVE_CORE_TESTS=1` opts into the live cross-service test. That test additionally needs Core
  PostgreSQL, Core availability, and a valid `JINA_API_KEY` or `WEIRWISE_EMBEDDING_API_KEY`. Do not
  use production credentials or data.
- Migration checks are static only. Exercise migrations against an explicitly disposable database
  in a separately approved database-validation task; do not run them against an unidentified
  database.

## CI execution and deployment boundaries

`.github/workflows/ci.yml` runs for pull requests and pushes to `develop` or `main`. Path filters
select backend and frontend jobs; the `main` ref forces both quality jobs. The backend job runs
Ruff lint/format, Mypy, the Alembic graph/syntax check, and pytest with coverage. The frontend job
runs ESLint, API-client tests, TypeScript checking, and the Next.js production build.

The workflow also contains Docker validation and automated deployment jobs: Docker builds are
configured on `main`; pushes to `develop` can deploy to the development environment, and pushes to
`main` can deploy to production. Do not push merely to test CI. Review the workflow and required
environment approvals before any authorized deployment-related action. No remote GitHub Actions
run or deployed status was checked for this local change.

## Known limitations

- Backend SQLite tests use `Base.metadata.create_all`; they do not prove PostgreSQL dialect
  behavior or that a migration safely upgrades a deployed schema.
- The live Core/Jina integration is opt-in and not part of routine CI. Contract fakes do not replace
  verification against a deployed compatible Core version.
- Redis-marked tests may skip locally when Redis is unavailable.
- Frontend tests exercise API-client request/response behavior but do not mount React components or
  drive a browser. Login form UI, onboarding pages, assistant-editor interactions, loading states,
  and responsive/accessibility behavior still need a separately provisioned browser test strategy.
- There is no customer-facing Shopify connection/store-selection UI or working Shopify OAuth/catalog
  synchronization in the current implementation, so those journeys cannot yet be tested end to end.
- Coverage is reported by CI but no minimum threshold is enforced; no complete-coverage claim is
  made.

## Verification evidence for this Phase 4 change

Record only checks actually run for the current worktree:

- Focused backend ownership/lifecycle command: **50 passed**.
- Full backend command, `python -m pytest -v --tb=short --cov=app --cov-report=term-missing tests`:
  **144 passed, 1 skipped** in 99.25 seconds; measured coverage was **63%**. The single skip was
  the opt-in live Core/Jina integration test. One existing Starlette/httpx deprecation warning was
  reported. Coverage is informational; no threshold is enforced.
- Backend `python -m ruff check .`, `python -m ruff format --check .`, and `python -m mypy app`:
  **passed**.
- From repository root, `alembic -c backend/alembic.ini heads` reported one head
  (`f8a9b0c1d2e3`); AST parsing of all migration files and `git diff --check` **passed**. No
  migration was applied.
- Frontend `npm test`: **3 passed**; `npm run lint` and `npm run type-check`: **passed**. `npm run
  build` exited successfully and generated all listed routes, but Next.js emitted a Windows
  standalone-tracing warning (`ENOENT` while copying a dashboard client-reference manifest). The
  same warning reproduced on a second local build; Linux CI behavior remains unverified.
- GitHub Actions was not run or queried remotely. The worktree remains uncommitted and no deployment
  was triggered.

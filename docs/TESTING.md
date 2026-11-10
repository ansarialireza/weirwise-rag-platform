# Platform Testing Strategy

Tests should verify behavior at the owning boundary and preserve the separate Platform/Core
contracts. The test suite is under `backend/tests/` and repository-level `tests/`; frontend checks
are configured in `frontend/package.json` and CI.

| Level | Platform use |
|---|---|
| Unit | Pure domain/service behavior with provider, storage, and network collaborators isolated. |
| Integration | SQLAlchemy persistence, migrations, Redis rate limits/streams, and Core adapter behavior against disposable services or controlled fakes. |
| Contract | Pydantic request/response behavior, OpenAPI routes, public runtime scopes, and Platform-to-Core REST compatibility. |
| End-to-end | Authenticated user journeys, assistant publishing/chat, public embed behavior, and voice UI where the required services are available. |
| Regression | A focused test for every fixed defect, especially ownership, migration, stream termination, or integration failure paths. |

## Local checks

From `backend/`:

```text
ruff check .
ruff format --check .
mypy app
pytest -v tests
```

From `frontend/`:

```text
npm run lint
npm run type-check
npm run build
```

CI uses Python 3.12, Node 20, and Redis. Report infrastructure-dependent skips and failures
explicitly. Do not run tests against a shared or production database, use real customer data, or
include live provider credentials. Keep test databases, uploads, reports, and generated artifacts
outside the repository.

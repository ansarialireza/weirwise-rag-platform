# Platform Development Guide

> Read [`ARCHITECTURE.md`](ARCHITECTURE.md), [`API_CONTRACTS.md`](API_CONTRACTS.md), and
> [`AGENTS.md`](../AGENTS.md) before changing behavior. Platform and Core are separate services
> with separate databases; use Core's public REST API only.

## Requirements

- Python 3.11 or newer (CI currently uses Python 3.12).
- Node.js 20 recommended (CI uses Node 20).
- PostgreSQL for PostgreSQL-specific behavior; SQLite is available for some local/test workflows.
- Redis for Redis-backed rate limiting and the separate behavioral-intelligence stream worker.

## Environment and local state

The backend settings load `backend/.env`; use `.env.example` as the template. Configure an
explicit disposable local database and storage paths outside the repository before running the
application, tests, or migrations. Configure `WEIRWISE_CORE_BASE_URL` and the Core API key only
when exercising Core integration; never commit actual credentials.

## Run the application

From the repository root, install the backend in the environment using the repository's existing
dependency files, then start:

```text
uvicorn backend.app.main:app --reload
```

From `frontend/`, install the dependencies and start the UI:

```text
npm install
npm run dev
```

The API's local OpenAPI page is enabled only in development, dev, or test environments. The API
process initializes SQLAlchemy metadata at startup. This is not a replacement for reviewing or
applying the repository's Alembic revisions; see [`DATA_AND_MIGRATIONS.md`](DATA_AND_MIGRATIONS.md).

## Background processing

Knowledge ingestion requests are persisted as `ProcessingJob` rows in the same database transaction
as their documents. The API lifespan runs a database-backed worker that claims jobs, heartbeats active
work, and recovers interrupted jobs after restarts; indexing is forwarded to Core over HTTP. Terminal
failures can be retried from the document API. A separate Redis Streams behavioral-intelligence daemon
is implemented in `backend/app/services/behavioral_worker_daemon.py`. Celery is declared as a backend
dependency, but document ingestion is not wired to Celery or an external broker.

## Validation

Use the exact backend and frontend commands in [`TESTING.md`](TESTING.md). Use disposable services
and data only. Do not deploy, migrate a shared database, or commit generated databases, uploads,
build output, logs, or reports.

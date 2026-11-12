# ADR 003: Platform Persistence and Worker Architecture

## Status
Accepted as target architecture; implementation is partial and differs from this decision.

## Context
The Platform requires transactional persistence for SaaS domain records (Workspaces, Projects, Memberships, Assistants, Deployments, Credentials, Audit Trails) and asynchronous execution for document ingestion, pre-processing, sanitization, and health synchronization.

## Decision
1. **Primary Database:** PostgreSQL managed with SQLAlchemy 2.0 async sessions; Alembic is the intended schema migration mechanism.
2. **Object Storage:** An object-storage abstraction is a target for uploaded document blobs; the current application uses configured local hot/cold filesystem paths and no S3 adapter was found.
3. **Queue & Worker:** General document ingestion uses transactional `ProcessingJob` rows and an API-lifecycle database worker with atomic claims, heartbeats, and bounded stale-job recovery. It is not an external broker; terminal ingestion failures require a manual retry. Shopify catalog sync uses a separate database-backed integration state queue. Redis Streams are used by a separate behavioral-intelligence worker; Celery remains unwired.

## Current implementation note (2026-11-10)

The FastAPI lifespan also calls `Base.metadata.create_all`, while Alembic configuration and revision
files exist. This dual schema lifecycle must be reconciled before relying on migration-only
production upgrades. This ADR records the desired direction and must not be used as evidence that
Celery, MinIO/S3, an external job broker, or production migrations are active. The database-backed
ingestion queue is implemented, but deployment still depends on the Platform database and API worker
being available.

## Consequences
- Clean operational boundary using standard enterprise technologies.
- Fully compatible with self-hosted on-premise container configurations and multi-tenant SaaS clouds.

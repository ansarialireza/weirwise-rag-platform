# ADR 003: Platform Persistence and Worker Architecture

## Status
Accepted as target architecture; implementation is partial and differs from this decision.

## Context
The Platform requires transactional persistence for SaaS domain records (Workspaces, Projects, Memberships, Assistants, Deployments, Credentials, Audit Trails) and asynchronous execution for document ingestion, pre-processing, sanitization, and health synchronization.

## Decision
1. **Primary Database:** PostgreSQL managed with SQLAlchemy 2.0 async sessions; Alembic is the intended schema migration mechanism.
2. **Object Storage:** An object-storage abstraction is a target for uploaded document blobs; the current application uses configured local hot/cold filesystem paths and no S3 adapter was found.
3. **Queue & Worker:** A durable background-task system is a target for ingestion and synchronization. The current document ingestion path uses FastAPI `BackgroundTasks` in the API process. Redis Streams are used by a separate behavioral-intelligence worker; Celery is declared as a dependency but no Celery task wiring was found.

## Current implementation note (2026-11-10)

The FastAPI lifespan also calls `Base.metadata.create_all`, while Alembic configuration and revision
files exist. This dual schema lifecycle must be reconciled before relying on migration-only
production upgrades. This ADR records the desired direction and must not be used as evidence that
Celery, MinIO/S3, a durable ingestion queue, or production migrations are active.

## Consequences
- Clean operational boundary using standard enterprise technologies.
- Fully compatible with self-hosted on-premise container configurations and multi-tenant SaaS clouds.

# ADR 003: Platform Persistence and Worker Architecture

## Status
Accepted

## Context
The Platform requires transactional persistence for SaaS domain records (Workspaces, Projects, Memberships, Assistants, Deployments, Credentials, Audit Trails) and asynchronous execution for document ingestion, pre-processing, sanitization, and health synchronization.

## Decision
1. **Primary Database:** PostgreSQL 16 managed with SQLAlchemy 2.0 (asyncio support) and Alembic for schema migrations.
2. **Object Storage:** S3-compatible object storage (MinIO for local dev, AWS S3 / Cloudflare R2 for production) for uploaded document blobs.
3. **Queue & Worker:** Celery with Redis for background task distribution, document conversion, and scheduled crawls.

## Consequences
- Clean operational boundary using standard enterprise technologies.
- Fully compatible with self-hosted on-premise container configurations and multi-tenant SaaS clouds.

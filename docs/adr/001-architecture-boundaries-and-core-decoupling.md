# ADR 001: Architecture Boundaries and Core Decoupling

## Status
Accepted

## Context
Weirwise Platform is designed as an independent SaaS product that empowers businesses to configure, test, and deploy AI assistants grounded in business data. An existing repository, `weirwise-core` (located in `../weirwise`), provides retrieval-augmented generation (RAG) capabilities, vector storage, and document chunking.

We needed to decide whether to:
1. Extend `weirwise-core` directly with SaaS features (tenants, billing, projects, UI).
2. Wrap or fork `weirwise-core` in an internal monorepo package.
3. Build `Weirwise Platform` as an autonomous SaaS orchestration layer consuming `weirwise-core` via its verified public REST API.

## Decision
We chose Option 3: **Strict Decoupling via Public API**.

- Weirwise Platform maintains its own application database (Platform PostgreSQL) for user management, workspaces, project scopes, assistant personalities, conversation history, audit logs, and API credentials.
- Platform communicates with Weirwise Core strictly over HTTP/REST using Core's v1.0.0 API contracts with `X-API-Key` authentication.
- Direct database cross-access, shared ORM models, or internal module imports between Platform and Core are strictly prohibited.

## Consequences
- **Positive:**
  - Independent scaling, deployment, and version lifecycle.
  - Zero risk of regressing Core's vector search performance or database constraints.
  - Allows future self-hosted deployments to plug into different Core instances or cloud-hosted Core endpoints.
- **Trade-off:**
  - Requires maintaining an integration client adapter in the Platform and synchronizing state (e.g., knowledge base IDs) over HTTP.

# ADR 001: Architecture Boundaries and Core Decoupling

## Status
Accepted

## Context
Weirwise Platform is designed as an independent SaaS product that empowers businesses to configure, test, and deploy AI assistants grounded in business data. The independently reusable repository `weirwise-rag-core` (located at `../weirwise-rag-core`)
provides retrieval-augmented generation (RAG), vector storage, and document indexing.

We needed to decide whether to:
1. Extend Core directly with Platform authentication, billing, user interface, and business workflows.
2. Wrap or fork Core as an internal package.
3. Keep Platform as an independent application that consumes Core through its public REST API.

## Decision
We chose Option 3: **Strict Decoupling via Public API**.

- Platform maintains its own application database for user accounts, assistants, knowledge-source metadata, conversations, audit/usage, billing, and API credentials. The persisted Platform model is user-scoped; it has no `workspaces` principal or `memberships` table. Workspace-named auxiliary records are keyed to users.
- Platform communicates with Core strictly over HTTP/REST using Core's public API contract and a Core `X-API-Key`, through `backend/app/adapters/core_client.py`.
- Direct database cross-access, shared ORM models, or internal module imports between Platform and Core are strictly prohibited.

## Consequences
- **Positive:**
  - Independent scaling, deployment, and version lifecycle.
  - Zero risk of regressing Core's vector search performance or database constraints.
  - Allows future self-hosted deployments to plug into different Core instances or cloud-hosted Core endpoints.
- **Trade-off:**
  - Requires maintaining an integration client adapter in the Platform and synchronizing state (e.g., knowledge base IDs) over HTTP.

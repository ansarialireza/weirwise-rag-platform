# AI Providers and Integration Boundaries

## Request and retrieval path

Platform owns assistant state, conversation state, prompts, and provider orchestration. For
grounding, `backend/app/adapters/core_client.py` calls Core's public REST API using
`WEIRWISE_CORE_BASE_URL` and `WEIRWISE_CORE_API_KEY`. The adapter owns HTTP transport, timeouts,
connection reuse, and Core error translation.

An assistant can link multiple Platform `KnowledgeSource` records. The runtime searches each linked
Core knowledge base, merges/ranks returned passages, and uses those passages as context for
Platform-side answer generation. Platform does not import Core Python modules, share ORM classes, or
access Core's database. Core's REST contract is documented in Core's `CONTRACT.md`.

## Provider orchestration

- `backend/app/services/llm.py` constructs grounded prompts, calls supported provider APIs, supports
  streaming, records token/cost/latency information, and returns an extractive answer when provider
  generation is unavailable. If no grounding passages are available, the configured fallback is
  used.
- `backend/app/services/routing_engine.py` selects from administrator-managed provider accounts and
  encrypted credentials according to current account, credential health, limits, and routing
  controls. The routing state and event records are Platform-owned and keyed to the authenticated
  user rather than a workspace fallback.
- Provider-specific HTTP behavior belongs behind the LLM service, not in route handlers or frontend
  code. Do not put credentials in prompts, browser bundles, API responses, logs, or test fixtures.
- Provider support in code does not establish that a provider is enabled, provisioned, or available
  in a given environment. A workspace-labelled BYOK record model is user-keyed; runtime use of
  that model as customer BYOK was not verified. Do not document model names, prices, or BYOK as
  available product contracts without checking current configuration and product scope.

## Business integrations

`backend/app/services/integrations.py` stores integration credentials encrypted through the vault.
Shopify's OAuth authorization-code flow validates signed user/shop-bound state and callback HMAC and
timestamp, requests expiring offline tokens, and encrypts credentials at rest. Configure
`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_REDIRECT_URI`, and `SHOPIFY_FRONTEND_RETURN_URL` on
the server; never expose these values to the frontend.

An authenticated manual sync reads active Shopify products through the Admin GraphQL API, refreshes
expiring offline credentials, and indexes a catalog snapshot through Core's public REST adapter as
a user-owned `shopify_catalog` source. A completed sync replaces the previous indexed snapshot only
after the new one is ready. Sync requests are persisted as a database-backed queue state on the
integration and claimed by an application worker using row-level locking. If a process stops during
a sync, the worker requeues it after 15 minutes without a heartbeat. This lightweight queue does
not provide an external broker, job history, or automatic retries for terminal failures. Other
real providers still return `not_implemented` for content import.

Connections are scoped to the authenticated user and unique by
`(user_id, provider, connection_key)`. Older clients without a key use `default`; Shopify can derive
the key from its configured shop domain. Reconnecting the same key updates that connection, while
different keys permit multiple stores under one customer account. This is connection persistence
and snapshot synchronization only: webhook-driven/recurring or incremental sync, revocation on
uninstall, automatic retries for terminal sync failures, and automatic store analysis remain
unimplemented. The merchant must manually sync products and link the resulting source to an
assistant.

Authenticated `DELETE /integrations/{id}` rejects a Shopify connection while a sync is queued or
running. Otherwise it removes the local integration credentials and associated Platform/Core
catalog data. It does not uninstall the app or revoke Shopify's grant; the merchant must uninstall
Weirwise from Shopify Admin to revoke that access.

### Simulated provider journeys

`DEMO_INTEGRATIONS_ENABLED` defaults to `false`; production and staging configuration rejects it
when enabled. In a local/test environment, the flag exposes clearly labeled demo Shopify and Google
Drive journeys backed only by static synthetic fixtures. Their signed, short-lived OAuth state is
bound to the authenticated user and provider. The callback stores demo-only identifiers; it does not
contact Shopify or Google, create external grants, or represent a real account connection. The demo
Shopify connection uses a separate connection key so it cannot overwrite a real store with the same
fixture domain.

Demo Shopify uses the catalog snapshot renderer and queue worker. Demo Google Drive exposes a
folder/file browser and imports only allowlisted fixture files through the durable document-ingestion
queue. Re-syncing replaces removed/changed fixture documents, and disconnect removes the demo
connection and its imported Platform/Core knowledge. Real Google Drive OAuth and import remain
unimplemented. Keep this mode off outside isolated development/test use and never describe its
connection or data as a live provider integration.

When adding an integration:

1. Keep provider-specific authorization, token refresh, data mapping, pagination, retries, and
   revocation inside a dedicated adapter/service.
2. Store only the minimum credential material needed and never return decrypted secrets.
3. Define user ownership and required permissions at each route.
4. Make synchronization status/error behavior explicit and idempotent; do not report success or
   counts until the external operation has completed.
5. Test provider behavior with fakes and contract fixtures; keep live credentials out of CI.

Voice is a separate server-mediated Deepgram integration in `backend/app/api/v1/voice.py`; its
credentials remain server-side. Payment integrations and provider pools are also separate from the
Core retrieval contract.

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
  controls. The routing state and event records are Platform-owned.
- Provider-specific HTTP behavior belongs behind the LLM service, not in route handlers or frontend
  code. Do not put credentials in prompts, browser bundles, API responses, logs, or test fixtures.
- Provider support in code does not establish that a provider is enabled, provisioned, or available
  in a given environment. A workspace-labelled BYOK record model is user-keyed; runtime use of
  that model as customer BYOK was not verified. Do not document model names, prices, or BYOK as
  available product contracts without checking current configuration and product scope.

## Business integrations

`backend/app/services/integrations.py` stores integration credentials encrypted through the vault.
The generic integration sync function currently returns `not_implemented` for automatic content
import. This is not a Shopify catalog connector or a recurring synchronization system.

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

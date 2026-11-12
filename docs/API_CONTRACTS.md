# Platform API and Internal Contract Conventions

> **Status:** Current route overview, checked against `backend/app/main.py` and `backend/app/api/`
> on November 10, 2026. For exact request/response fields and status codes, the route declarations,
> Pydantic schemas, and environment-specific OpenAPI document are authoritative.

## 1. API surface

The application mounts these route groups under `/api/v1` unless noted:

| Route module | Responsibility |
|---|---|
| `auth.py` | Registration, login, refresh, logout, email verification, and password reset. |
| `knowledge.py` | Knowledge-source CRUD, file/text ingestion, safe crawl discovery/ingestion, and direct search. |
| `assistants.py` | Assistant configuration and lifecycle, authenticated chat/streaming, deployments, conversations, evaluations, feedback, and analytics. |
| `public_runtime.py` | Published assistant configuration/chat and public feedback/handoff flows under `/public`. |
| `integrations.py` | Business integration credential/configuration operations. |
| `voice.py` | Voice status and authenticated speech relay operations. |
| `billing.py`, `enterprise.py`, `workspaces.py`, `admin.py`, `telemetry.py` | User/account-scoped billing and enterprise routes, deprecated workspace/project compatibility shims, staff administration, and telemetry. |
| `health.py` | Health routes mounted at the application root. |

Important public runtime paths include:

- `GET /api/v1/public/assistants/{assistant_id}/config`
- `POST /api/v1/public/assistants/{assistant_id}/chat`

Other routes and their exact fields are intentionally not duplicated here. Inspect the active route
module and generated OpenAPI schema before relying on an endpoint or documenting a new contract.

## 2. Authentication and authorization boundaries

- Dashboard routes use a signed access token supplied as a Bearer token or the `access_token`
  cookie. Authentication resolves a `User`; protected queries must then enforce that user's
  ownership of each resource.
- Platform-issued `X-API-Key` credentials are associated with a user and have scopes. They are not
  workspace-issued keys.
- Public runtime supports published share access, an active `X-Widget-Key` deployment key with
  origin/domain checks, and user-owned `X-API-Key` access with endpoint-specific scopes.
- Widget origin checks are not a replacement for authorization on protected routes. Never trust a
  client-supplied user, assistant, source, or tenant identifier without an ownership check.
- Platform authentication and authorization are separate from Core's `X-API-Key` tenant
  authentication. Platform calls Core through `backend/app/adapters/core_client.py`; it does not
  pass Platform dashboard credentials through to Core.

## 3. Legacy workspace/project compatibility surface

The router in `backend/app/api/v1/workspaces.py` remains mounted for compatibility with older
clients. Its operations are marked deprecated in OpenAPI. They synthesize one account context from
the authenticated user's ID and do not create persisted Workspace, Project, or Membership records.
Every supplied workspace/project path ID must match that authenticated user's ID; mismatches return
not found. The accepted account model and rationale are recorded in
[`ADR 004`](adr/004-single-account-model.md). The legacy response schemas and route behavior remain
for compatibility, but:

- New frontend and API clients must use direct user-owned resources such as `/sources`,
  `/assistants`, `/billing`, and `/api-credentials`.
- Do not add workspace creation, selection, switching, membership, or workspace-administration
  behavior.
- Do not remove or change the legacy responses until actual consumers and a compatibility/deprecation
  plan have been reviewed.
- OpenAPI deprecation is a compatibility signal, not proof that all external clients have migrated.

## 4. Integration connection identity

Integration requests may supply `connection_key`. If omitted, the account/provider uses the
`default` connection identity; Shopify requests may derive it from `config.shop_domain` or
`config.shop_url`. The key identifies a connection within the authenticated user's account and is
not authorization evidence. Connection records support multiple stores.

Shopify OAuth starts at authenticated `POST /integrations/shopify/oauth/start` with
`shop_domain`; the response contains an authorization URL. Shopify returns to
`GET /integrations/shopify/oauth/callback`, which validates the signed state, HMAC, timestamp, and
shop before persisting encrypted credentials and redirecting to the configured frontend settings
URL. The callback never returns credentials. Authenticated `POST /integrations/{id}/sync` queues a
manual Shopify catalog snapshot and returns `202 Accepted` with `status: "queued"`; other providers
still return `not_implemented` for content import. The integration's `sync_status`, `last_error`,
and `last_synced_at` fields report the task result.
Authenticated `DELETE /integrations/{id}` returns `409 Conflict` while a Shopify sync is queued or
running; otherwise it removes the local integration and imported catalog data. It does not revoke
the app grant in Shopify; merchants must uninstall the app in Shopify Admin to do so.

Local/test-only demo flows are gated by `DEMO_INTEGRATIONS_ENABLED` (default `false`, rejected in
production/staging). Authenticated `GET /integrations/mock/capabilities` reports whether the
synthetic demo providers are available. `POST /integrations/mock/{provider}/oauth/start` and
`/oauth/callback` use a short-lived, signed, user/provider-bound state. They never contact an
external provider. The callback stores demo-only connection data and the UI labels it simulated.

For a demo Google Drive connection, authenticated
`GET /integrations/{id}/google-drive/items?parent_id=...` browses the fixed fixture tree.
`POST /integrations/{id}/sync` accepts `{"file_ids": [...]}`; IDs must belong to the fixture
allowlist, and an empty list removes all previously imported demo files. The worker queues each
selected file through the normal document-ingestion pipeline. Real Google Drive OAuth/import
remains unimplemented; do not treat demo records or data as real external connections.

## 5. Request, response, and error conventions

- Define request and response models in `backend/app/schemas/`; route handlers should not expose
  SQLAlchemy models as an accidental public contract.
- Validate inputs at the route/schema boundary. Use explicit response models and HTTP status codes.
- Preserve ownership checks on reads, writes, deletes, background-task dispatch, and public
  conversation continuation.
- Keep error responses useful to clients without returning provider secrets, raw credentials,
  internal prompts, or sensitive implementation details.
- Treat streamed chat as a separate public contract from ordinary JSON chat; document event framing,
  terminal behavior, and persistence when it changes.
- Keep internal service interfaces narrow and typed. Adapters translate external API errors into
  Platform-owned exceptions; callers should not depend on another repository's internal classes.

## 6. Compatibility and tests

Changes to paths, authentication modes, scopes, payload fields, defaults, status codes, error shapes,
stream events, or Core REST usage are compatibility-sensitive. Before changing one:

1. Inspect the calling frontend, SDK/adapter, route, schema, and tests.
2. Record the intended compatibility behavior and any migration/deprecation plan.
3. Add contract tests at the affected boundary. Mock external providers/Core for unit tests; use
   isolated services for integration tests.
4. Update this document only for stable conventions; keep exact schemas in code/OpenAPI.

Core REST compatibility is defined by the Core repository's `CONTRACT.md`. Platform product version
labels do not change Core's API or package release version.

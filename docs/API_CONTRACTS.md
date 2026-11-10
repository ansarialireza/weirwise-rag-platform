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
| `billing.py`, `enterprise.py`, `workspaces.py`, `admin.py`, `telemetry.py` | Billing, enterprise, compatibility, staff administration, and telemetry routes. |
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

## 3. Request, response, and error conventions

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

## 4. Compatibility and tests

Changes to paths, authentication modes, scopes, payload fields, defaults, status codes, error shapes,
stream events, or Core REST usage are compatibility-sensitive. Before changing one:

1. Inspect the calling frontend, SDK/adapter, route, schema, and tests.
2. Record the intended compatibility behavior and any migration/deprecation plan.
3. Add contract tests at the affected boundary. Mock external providers/Core for unit tests; use
   isolated services for integration tests.
4. Update this document only for stable conventions; keep exact schemas in code/OpenAPI.

Core REST compatibility is defined by the Core repository's `CONTRACT.md`. Platform product version
labels do not change Core's API or package release version.

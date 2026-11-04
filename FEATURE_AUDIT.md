# Weirwise Platform Feature Audit

Audit date: 2026-11-04
Branch: `develop`
Baseline commit: `8baa63a`

This document is the evidence-based capability matrix requested before implementation. Each row is classified as **IMPLEMENTED**, **PARTIAL**, **MISSING**, or **FUTURE**, with the primary code evidence. "Missing" means the capability does not exist or cannot work through the product surface. "Future" means it is intentionally out of scope for this pass (external payment/business systems, etc.).

Priority legend: **P0** = required for the product to work end to end; **P1** = important but not blocking the core journey; **P2** = polish/scale.

---

## 1. Authentication, tenancy, projects

| Capability | Status | Evidence | Priority / Gap |
| --- | --- | --- | --- |
| Email/password registration and login | IMPLEMENTED | `backend/app/api/v1/auth.py`; JWT cookies plus bearer tokens | — |
| Email verification (OTP) | IMPLEMENTED | `auth.py`, `services/email.py`; tests in `test_auth.py` | — |
| Password reset | IMPLEMENTED | `auth.py` forgot/reset endpoints | — |
| Persistent session / refresh | IMPLEMENTED | `auth.py` refresh + logout; `frontend/src/lib/api.ts` retry | — |
| Workspaces + memberships + roles | IMPLEMENTED | `models/auth.py`, `api/v1/workspaces.py`; last-owner protection | — |
| Automatic personal workspace/project on signup | IMPLEMENTED | `auth.py` registration bootstrap | — |
| Project CRUD | PARTIAL | `workspaces.py:287-350` supports create/list/get | No rename/archive/delete (P2) |
| Workspace switching in UI | MISSING | No workspace context in `frontend/src/app/(dashboard)` or sidebar | P1: UI always resolves the first/default workspace |
| Frontend tenancy resolution | BROKEN | `frontend/src/lib/api.ts:197-310` calls flat `/sources`, `/assistants`, `/api-credentials` that do not exist | P0: every dashboard page fails |
| Workspace members UI | MISSING | Backend only | P2 |

## 2. Knowledge sources and ingestion

| Capability | Status | Evidence | Priority / Gap |
| --- | --- | --- | --- |
| Create file collection / website source | IMPLEMENTED | `knowledge.py:186-238` | — |
| Multi-file upload, 202 async ingestion | IMPLEMENTED | `knowledge.py:271-336` | — |
| Local hot tier + cold storage move | IMPLEMENTED | `tasks/ingestion.py:78-93`, `services/storage.py` | — |
| Core KB creation + document indexing | IMPLEMENTED | `tasks/ingestion.py:53-93`, `adapters/core_client.py` | — |
| Document status polling | IMPLEMENTED | `knowledge.py:339-360`; UI polls in `sources/page.tsx` | — |
| Document delete | PARTIAL | `knowledge.py:363-391` deletes DB row + local file only | P0: vectors remain in Core and are still retrievable |
| Source/collection delete | MISSING | No `DELETE /sources/{id}` | P0: cannot remove a collection or its Core KB |
| Retry failed ingestion | MISSING | No endpoint; failed docs stuck | P1 |
| Ingestion failure surfacing | PARTIAL | `error_message` stored; UI never displays it | P1 |
| Website crawler discovery + ingest | IMPLEMENTED | `knowledge.py:86-180`, `services/scraper.py` | — |
| Sitemap crawl, SSRF guard | IMPLEMENTED | `scraper.py`; `test_security_regressions.py` | — |
| Source rename/settings update | PARTIAL | Schema exists (`knowledge.py` import of update request absent) | P2 |
| Tiered storage reaper | IMPLEMENTED | `main.py:31-45`, `services/storage.py` | — |

## 3. Retrieval and answering

| Capability | Status | Evidence | Priority / Gap |
| --- | --- | --- | --- |
| Core vector search with threshold/top-k | IMPLEMENTED | `assistants.py:605-641`, `public_runtime.py:185-234` | — |
| Multi-source retrieval + dedup + citations | IMPLEMENTED | same | — |
| Grounded LLM answer generation | MISSING | Both chat endpoints concatenate raw passages: `assistants.py:676-680`, `public_runtime.py:236-244` | P0: product promise "AI answer" is not met |
| Provider credential pool / admin key management | IMPLEMENTED | `api/v1/admin.py`, `services/vault.py`, `services/token_manager.py` | — |
| Intelligent routing / failover / health | PARTIAL | `services/routing_engine.py` exists but was never called by any request path | P0: wire real generation through it |
| Credential priority semantics | BROKEN | `routing_engine.py:84-137` uses higher number = higher priority; `token_manager.py:162,222` assigns lower number = higher priority | P0: contradictory ordering |
| Retry/failover on provider errors | PARTIAL | `routing_engine.record_failure` exists; no execution loop | P0 |
| Token/cost ledger | PARTIAL | `routing_engine.record_success` writes `TokenCostLedger`; unused | P0: ledger must reflect real calls |
| No-provider fallback | PARTIAL | Returns raw context block | P0: needs a clean extractive fallback, no fabricated assistant-voice text |
| Search-only engine mode | IMPLEMENTED | `assistants.py:643-673` | — |
| Knowledge-gap analytics / unanswered queries | IMPLEMENTED | `assistants.py:428-474` | — |
| Golden evaluations | PARTIAL | CRUD + run service (`services/evaluations.py`) | Evaluation scoring quality not verified (P2) |

## 4. Assistants and publishing

| Capability | Status | Evidence | Priority / Gap |
| --- | --- | --- | --- |
| Create/list/get/update assistant (draft) | IMPLEMENTED | `assistants.py:75-224` | — |
| Attach/detach sources | IMPLEMENTED | same | — |
| Publish-readiness validation | IMPLEMENTED | `assistants.py:230-272` | — |
| Publish immutable snapshot | IMPLEMENTED | `assistants.py:275-344` | — |
| Unpublish | IMPLEMENTED | `assistants.py:347-364` | — |
| Delete assistant | MISSING | No endpoint | P1 |
| Studio playground chat | PARTIAL | `assistants.py:556-715`; quota checked but only usage event recorded at the end, no LLM | P0 |
| Conversation history | IMPLEMENTED | `assistants.py:370-422` | — |
| Frontend assistant detail loads | BROKEN | Requires `params.projectId` that does not exist in route (`assistants/[assistantId]/page.tsx:31-58`) | P0 |
| Frontend playground loads | BROKEN | Requires `params.projectId` (`playground/page.tsx:32-59`) | P0 |
| Frontend create-assistant redirect | BROKEN | Pushes `/dashboard/assistants/...`; route is `/assistants/...` (`assistants/page.tsx:110`) | P0 |
| Assistant list/detail contract | BROKEN | Frontend expects `answer`/`citations` and `ready`/`errors`; backend returns `content`/`sources` and `is_ready`/`issues` | P0 |

## 5. Public runtime, widget, API access

| Capability | Status | Evidence | Priority / Gap |
| --- | --- | --- | --- |
| Published-only public access | IMPLEMENTED | `public_runtime.py:40-59` | — |
| Widget public key validation | IMPLEMENTED | `public_runtime.py:61-72` | — |
| Allowed-domain enforcement | BROKEN | Substring check `if domain in request_origin` (`public_runtime.py:75-86`) allows `evil-mycompany.com.attacker.net` | P0 |
| Public config endpoint | IMPLEMENTED | `public_runtime.py:91-129` | — |
| Public chat with citations | PARTIAL | Retrieval works; answer fabricated (`public_runtime.py:236-244`) | P0 |
| Anonymous session identity | PARTIAL | `session_token` stored if supplied; never generated/returned | P0 |
| Feedback ownership | BROKEN | Any caller knowing a message UUID can submit/modify feedback (`public_runtime.py:291-330`) | P0 |
| Human handoff ownership | BROKEN | Any caller knowing a conversation UUID can escalate it (`public_runtime.py:333-377`) | P0 |
| Embed widget | PARTIAL | Calls authenticated studio chat (`app/embed/[assistantId]/page.tsx:37`), no widget key in snippet | P0 |
| Deployment management | PARTIAL | Create/list only; no update/deactivate (P2) | P1 |
| API credentials | IMPLEMENTED | Backend create-only; UI absent | P2 |

## 6. Admin, AI operations, billing

| Capability | Status | Evidence | Priority / Gap |
| --- | --- | --- | --- |
| Admin RBAC + staff provisioning | IMPLEMENTED | `api/v1/admin.py`, `models/admin.py` | — |
| Provider CRUD + credential CRUD | IMPLEMENTED | `admin.py` | — |
| Token validation against providers | IMPLEMENTED | `services/token_manager.py:40-92` | — |
| Manual/automatic mode, emergency stop | IMPLEMENTED | `models/admin.py`, `admin.py` | — |
| FinOps summary / ledger views | PARTIAL | `admin.py`; ledger never populated by requests | P0 (fixed by routing) |
| Plan listing + workspace billing status | IMPLEMENTED | `billing.py` | — |
| Plan change | PARTIAL | Updates workspace tier only; `WorkspacePlanEntitlement` keeps old limits (`billing.py:120-178`) | P0: change appears to succeed but quotas do not change |
| Usage aggregation | PARTIAL | `subscription.py:80-101` sums all-time events, no billing-period filter | P1 |
| Quota enforcement | IMPLEMENTED | `metering.py`, `subscription.py` | — |
| Document limit derived as `max_assistants * 50` | PARTIAL | Inconsistent with entitlement/document count naming | P1: centralize |
| Payment processing / invoices / Stripe | FUTURE | `FinancialInvoice` model only; no gateway | FUTURE: do not invent payments |
| Overage billing | PARTIAL | Config + flag; no invoicing | FUTURE |

## 7. Integrations and webhooks

| Capability | Status | Evidence | Priority / Gap |
| --- | --- | --- | --- |
| Encrypted integration credentials | IMPLEMENTED | `services/integrations.py` | — |
| Integration CRUD | IMPLEMENTED | `api/v1/integrations.py` | — |
| Integration sync | FAKE | Returns fabricated counts (15/25/10) with no external call (`services/integrations.py:67-106`) | P0: must not pretend; return explicit unsupported |
| Shopify / Zendesk / Gorgias / Drive / Notion connectors | FUTURE | No API client implementations | FUTURE |
| Outgoing webhooks + HMAC | IMPLEMENTED | `services/webhooks.py`, `integrations.py` | — |
| Webhook retry/dead-letter | PARTIAL | Failure counter only | P2 |

## 8. Cross-cutting security

| Capability | Status | Evidence | Priority / Gap |
| --- | --- | --- | --- |
| Tenant isolation on all project resources | IMPLEMENTED | `verify_project_access` / `verify_project_membership`; tests | — |
| SSRF-safe crawling and webhook targets | IMPLEMENTED | `services/scraper.py` | — |
| Filename traversal defense | IMPLEMENTED | `services/storage.py: sanitize_filename` | — |
| Secret encryption at rest | IMPLEMENTED | `services/vault.py` (Fernet, SHA-256 dedup) | — |
| Widget origin restriction | BROKEN | Substring match | P0 |
| Public feedback/handoff authorization | BROKEN | No session ownership | P0 |
| API key auth for external clients | PARTIAL | Keys can be issued but no middleware consumes them | P1 (FUTURE auth surface) |
| Rate limiting | MISSING | No per-key/IP throttling | P2 |

## 9. Data / deployment integrity

| Capability | Status | Evidence | Priority / Gap |
| --- | --- | --- | --- |
| Fresh-database migrations | BROKEN | Head migration `c1d2e3f4a5b6` drops `projects`, `memberships`, `workspaces` (`backend/alembic/versions/c1d2e3f4a5b6_eradicate_workspaces_and_projects.py:19-75`), which the reverted backend still requires | P0: neutralize |
| Runtime table creation | IMPLEMENTED | `main.py:52-53` `create_all` | — |
| Tests | PARTIAL | 12 environmental failures (Redis + live Core) on baseline; no test for new flows | P1 |
| Docs accuracy | PARTIAL | `README.md` correctly says chat is retrieval-only; `docs/PRODUCT_READINESS_MATRIX.md` contradicts code | P2 |

---

## Implementation decisions for this pass

P0/P1 work implemented on `develop`:

1. **Real grounded answering** through the existing admin credential pool and routing engine, with failover, cost ledger, and an extractive fallback when no provider is configured. Both studio and public chat use the same service.
2. **Knowledge lifecycle completion**: collection deletion (Core KB + local files + rows), document deletion purges vectors in Core, failed-ingestion retry, and per-document error display.
3. **Public runtime security**: exact hostname matching with wildcard subdomains, anonymous session tokens returned to clients, and session ownership checks on feedback and handoff.
4. **Billing correctness**: usage filtered to the current billing period, entitlements synchronized on plan change, centralized document-limit derivation.
5. **Integration honesty**: sync endpoint returns a clear "not implemented" response instead of fabricated counts.
6. **Migration safety**: the destructive head migration becomes a no-op; no schema change is required for the new work.
7. **Frontend restoration**: automatic workspace/project resolution, correct backend routes and payloads, working assistant detail/playground, public-embed path, collection deletion and ingestion retry UI.

Explicitly deferred (FUTURE): payment gateway/invoicing, real Shopify/Zendesk/Gorgias/Drive/Notion connectors, FAQs, workspace switching UI, API-key-authenticated public API, automatic assistant/API-key lifecycle UI, source rename.

---

## Verification (2026-11-04)

Commands were run from `backend/` with `PYTHONPATH=..` and from `frontend/`.

| Check | Command | Result |
| --- | --- | --- |
| Backend suite | `python -m pytest tests -q` | 71 tests: 59 passed, 12 failed |
| New hardening suite | `python -m pytest tests/test_security_and_lifecycle_hardening.py -v` | 8 passed |
| Ruff lint | `python -m ruff check .` | All checks passed |
| Ruff formatting | `python -m ruff format --check .` | 84 files already formatted |
| Frontend type check | `npm run type-check` | Passed |
| Frontend lint | `npm run lint` | No warnings or errors |
| Frontend production build | `npm run build` | Passed |

The 12 backend failures are environmental, not behavioral regressions. They require services that are not configured in this workspace:

- `test_behavioral_intelligence.py` (3), `test_wbi_final_gate.py` (7), `test_wbi_remediation.py` (1): `REDIS_URL is not configured`, so telemetry ingestion correctly returns HTTP 503 and the stream producer raises `RedisUnavailableException`.
- `test_live_platform_core_integration.py` (1): requires a live Weirwise Core service, PostgreSQL, and Jina credentials.

`mypy` is not installed in this environment, so the CI `mypy app` step was not executed locally. The runtime-generated test database and uploads stayed outside the repository (`tempfile` and the existing `var/` convention).


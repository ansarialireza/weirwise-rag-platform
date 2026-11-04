# Post-Redesign QA Report

Date: 2026-11-04
Branch: `develop`
Redesign baseline: `8d0139a53e2d9a3426747a2f600f04377090097c`

## Scope and environment

Repositories inspected: `weirwise-rag-platform` (FastAPI + Next.js) and `weirwise-rag-core` (FastAPI + PostgreSQL/pgvector).

Runtime used for every live check:

| Component | Endpoint | Notes |
|---|---|---|
| Platform API | `127.0.0.1:8010` | SQLite QA DB `platform_qa.db`, `REDIS_URL=redis://127.0.0.1:6379/0` |
| Platform frontend | `127.0.0.1:3000` | Next.js dev server; production build also verified |
| Core API | `127.0.0.1:8002` | X-API-Key auth, PostgreSQL + pgvector (`weirwise_test`) |
| Redis / MinIO | 6379 / 9000-9001 | Docker containers; Redis now wired into Platform telemetry |
| Deepgram | live HTTPS/WSS | Real TTS and real streaming STT used; key read from `backend/.env`, never printed |

Real services were used for integration work: Deepgram STT/TTS, live PostgreSQL/pgvector, Core HTTP API, Redis. External LLM providers were not configured with keys in this environment, so LLM failover behaviour was exercised with the provider HTTP call boundary patched in the routing unit suite (marked simulated in the tables below).

## Overall health

**Yellow.** The redesigned admin control center, provider/token routing, voice relay, Core ingestion/retrieval, and the main product routes work end to end. Four security hardening gaps and one performance defect (admin audit layout shift) remain; retrieval-quality measurement is blocked by the external embedding provider returning HTTP 451.

| Suite | Result | Type |
|---|---|---|
| Admin provider routing engine (Phase 4) | **38/38** | Unit, provider HTTP simulated |
| Live admin control center (Phase 4) | **40/40** | Live, real Deepgram key + real vault + real DB |
| Admin UI browser workflow (Phase 5) | **36/36** | Live browser, real backend |
| Frontend route walkthrough (Phase 7) | **41/41** | Live browser, real backend |
| Security probes (Phase 6) | **43/47** | Live; 4 findings are the expected failures |
| Backend pytest | **70/71** | Real DB; 1 external Jina 451 failure |
| Core pytest | **39/41** | Real PostgreSQL/pgvector; 2 external Jina 451 failures |
| Frontend typecheck / production build | **Pass / Pass** | tsc clean; `next build` succeeded |

## What was verified

### Admin control center and routing

- Provider CRUD, credential pools, live token validation, encrypted storage, per-token disable/enable, delete, masked prefixes, budgets, priorities, weights, RPM limits.
- New observability endpoints: credential metadata `PATCH`, 30-day usage, routing event log, routing explain. All are backed by real aggregates (cost ledger + terminal routing events).
- Automatic token switching for streaming and non-streaming LLM paths, plus voice connect/speak success recording. Non-streaming failover previously stopped after one credential; it now retries up to 3 eligible credentials per provider.
- Routing strategies exposed and distinguished: priority, round robin (sorted by served count), least recently used, least loaded, weighted, lowest cost.
- Migration `d8e9f0a1b2c3` verified forward, backward, and forward again on a fresh PostgreSQL database. Single Alembic head confirmed.

### Voice

- Real Deepgram WSS relay, browser capture, interim/final transcripts, assistant SSE, sentence-chunked TTS, playback, barge-in, and multi-turn session continuity.
- Measured E2E latency and stage breakdown are in `VOICE_LATENCY_REPORT.md`.

### Core integration

- Real Postgres/pgvector ingestion through Platform → Core, chunk creation, deletion, and concurrent search.
- Retrieval quality metrics are reported but explicitly invalid as a real-quality signal because Jina returns HTTP 451; the environment falls back to pseudo-embeddings.
- Details in `CORE_INTEGRATION_TEST_REPORT.md`.

### Security

- Admin authorization, tenant isolation, JWT tampering, vault encryption, token masking, CORS, input validation, upload restrictions, Core API-key enforcement, and WebSocket authentication all passed.
- Findings and recommendations are in `SECURITY_AUDIT.md`.

## Defects found and disposition

| ID | Severity | Defect | Disposition |
|---|---|---|---|
| QA-01 | High | Telemetry batch endpoint returned 503 because `REDIS_URL` was not configured for the running backend, producing console errors on nearly every product route | Fixed operationally: backend restarted with Redis configured; endpoint now returns 202 |
| QA-02 | Medium | No rate limiting/lockout on `POST /auth/login` (8 consecutive failures all returned 401) | Open — documented in `SECURITY_AUDIT.md` |
| QA-03 | Medium | Missing `X-Content-Type-Options`, `X-Frame-Options`/CSP, and HSTS headers | Open — documented in `SECURITY_AUDIT.md` |
| QA-04 | Medium | URL crawler follows redirects before validating the redirect destination (blind SSRF window) | Open — documented in `SECURITY_AUDIT.md` |
| QA-05 | Medium | Admin audit page has a 0.6314 cumulative layout shift as the table hydrates | Open — performance finding |
| QA-06 | Low | Uploads buffer the whole file (up to 50 MB per file) in memory before writing | Open — documented in `SECURITY_AUDIT.md` |
| QA-07 | Low | Access token also stored in `localStorage` for API calls (HttpOnly cookies are set as well) | Open — XSS blast-radius finding |

## Frontend measurement summary

Warm navigation (desktop Chromium, dev server):

| Route | LCP | CLS | DOMContentLoaded |
|---|---:|---:|---:|
| `/overview` | 2264 ms | 0 | 296 ms |
| `/sources` | 1072 ms | 0.0002 | 106 ms |
| `/assistants` | 1480 ms | 0 | 137 ms |
| `/assistants/{id}` | 868 ms | 0 | 118 ms |
| `/playground` | 1772 ms | 0 | 166 ms |
| `/admin` | 1740 ms | 0 | 148 ms |
| `/admin/users` | 1496 ms | 0.0012 | 184 ms |
| `/admin/operations` | 984 ms | 0 | 133 ms |
| `/admin/finops` | 1268 ms | 0.0001 | 156 ms |
| `/admin/audit` | 808 ms | **0.6314** | 107 ms |

Mobile viewport 390 px: no page-level horizontal overflow on `/overview`, `/sources`, `/playground`, or `/admin/providers`.

## Limitations

- No OpenAI/Anthropic/OpenRouter credentials were configured; live LLM calls fell back to extractive answers. LLM credential failover was validated at the provider-call boundary with simulated HTTP responses, not against real paid endpoints.
- Jina embeddings return HTTP 451 from this network. All vectors in the QA environment are deterministic pseudo-embeddings; retrieval quality numbers are therefore infrastructure checks, not model-quality checks.
- Browser voice tests used Chrome's fake media device with synthesized speech audio. Real microphone hardware, acoustic echo cancellation under physical playback, and native Persian audio were not exercised here.
- The QA database was created via metadata bootstrap rather than Alembic, so `alembic current` has no stamped revision; migration correctness was verified separately on a fresh PostgreSQL database.

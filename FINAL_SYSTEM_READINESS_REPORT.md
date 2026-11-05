# Weirwise Final System Readiness Report

Date: 2026-11-05
Audit type: evidence-based functional audit (real services, real providers, isolated QA data).
Repositories: `weirwise-rag-platform` (`develop`, audit commit `de740c9`) and `weirwise-rag-core` (`develop`, fix `6ae346a`).
Deployment status: not merged to `main`, not deployed to production, no force-push.

**Readiness statement: Weirwise is functionally demonstrable end to end in the audited QA configuration, but it is not production-ready.** This conclusion is based on functional behavior and observed state, not on builds, read-only checks or UI presence. The gaps below are concrete and reproducible.

## 1. What genuinely works

### Core retrieval (verified in `weirwise-rag-core`, service on `127.0.0.1:8003`, PostgreSQL 16 + pgvector, real Gemini embeddings)

- 103/110 checks PASS: auth and tenancy isolation, ingestion (text/Markdown/CSV/JSON/PDF), chunking, 1536-d vector persistence, deduplication, concurrency, deletion cascades, error handling.
- Retrieval quality on the 16-query synthetic corpus: **Recall@1/3/5 = 1.000, Precision@1 = 1.000, MRR = 1.000**; latency p50 1,204 ms, p95 1,575 ms; 10 concurrent searches p95 1,672 ms.
- Real embedding and chat provider calls; no mocks on functional paths.
- Ingestion reliability fix `6ae346a` (retry transient 429/5xx, terminal job states) verified live.

### Platform and Core integration (QA `platform_qa.db` + Core `weirwise_test`)

- Knowledge create → upload → process → Core indexing → vector search → document/source deletion verified against real Core and PostgreSQL (`ready` + `core_doc_id`, 1 chunk at 1536 dims, `shipping.md` rank 1 score 0.704; deletions remove Core docs/KB and vectors).
- Grounded assistant answer with citations: "Standard shipping takes 2 to 3 business days inside the EU [1]." (retrieval score 0.6097, citation `browser_audit_policy.md`).
- Honest refusal for out-of-KB questions (no fabricated fact observed).
- SSE streaming verified: `meta → delta×16 → done`, provider/model/token/cost in `done`; first delta ~9.8 s under provider failover.
- Multi-turn context re-verified twice with explicit conversation ids (pronoun/"the refund itself" resolution correct).
- Publishing: readiness, publish/unpublish/republish, deployment key and domain allowlist; public chat enforces origin (403) and widget key (401).
- Voice: authenticated WebSocket (`wwp-voice` + JWT), real browser `MediaRecorder` WebM/Opus, real Deepgram transcript, retrieval-grounded spoken answer with citation, streamed TTS, barge-in (one `finalize`, second turn answered), continued session. Key never reaches the browser.

### Admin control center

- 45/47 admin HTTP checks, 19/19 routing-engine checks, 3/3 batch-token checks PASS.
- RBAC: unauthenticated 401, non-admin 403.
- Credentials: live validation, Fernet encryption at rest, masked listing, no plaintext in SQLite, dedupe, enable/disable, delete, audit trail.
- Routing: priority, round-robin, weighted, LRU, least-loaded, lowest-cost; budget/RPM/cooldown/breaker/model allow-list gates; emergency stop; real 429 and 401 failover; streaming and non-streaming failover.
- Accounting: exactly one ledger row per successful routed call, no billed failures; FinOps, credential usage, provider spend and admin metrics all reconcile with DB (E2E D1–D3).

### End-to-end scenarios

A (knowledge → grounded answer), B (publishing/public runtime), C (admin failure → recovery with a real provider call), D (admin ↔ product consistency), E (voice) all completed: **15 PASS / 2 PARTIAL / 0 FAIL / 0 BLOCKED**. One product defect was found and fixed: publish 500 when multiple deployment rows existed (`de740c9`).

## 2. What fails or is partial (genuine product gaps)

### Core

| ID | Severity | Gap |
| --- | --- | --- |
| CORE-01 | Medium | No KB update endpoint (`PATCH`/`PUT` 405). |
| CORE-02 | Medium | Deleting a KB leaves all uploaded files on disk (11/11 orphans in test). |
| CORE-03 | Medium | Binary files (PNG, DOCX) accepted and mis-decoded as UTF-8 text; only fail incidentally at DB insert. |
| CORE-05 | Medium | Refusals still return citations; no relevance gate before grounding. |
| CORE-06 | Medium | Multi-turn retrieval ignores conversation context (raw follow-up embedded). |
| CORE-08 | Medium | Upload buffers the whole file in RAM before size validation (+53.6 MB RSS for 51 MB). |
| CORE-04/07/09 | Low | Blank documents report `completed` with 0 chunks; PDF page numbers dropped; duplicate upload returns 202. |

### Platform

| Gap | Classification | Impact |
| --- | --- | --- |
| Public config ignores invalid widget key/origin (chat enforces) | PARTIAL | Branding disclosure only; undocumented asymmetry |
| `is_grounded` = "citations attached", not answer attribution | PARTIAL | Honest refusals can be labelled grounded (E2E-A4) |
| `core_kb_id` only populated after first ingestion | PARTIAL | Source looks unprovisioned until then |
| Follow-up retrieval drifted once before passing on re-runs | PARTIAL | Context feature is retrieval/model-sensitive |
| Telemetry batch returns 503 (no `REDIS_URL`) | BLOCKED (environment) | No local event ingestion |
| Cross-origin refresh in local split-origin stack | PARTIAL (setup) | Page reload requires re-login; same-origin production not tested here |

### Admin

| Gap | Classification | Impact |
| --- | --- | --- |
| No provider DELETE route (405) | PARTIAL | Stale provider accounts require DB cleanup |
| `routing/explain` does not auto-recover cooled credentials | PARTIAL | Explain can say `no_healthy_credentials` after cooldown while selection would succeed |
| Billed-cost reconciliation absent (`billed=0`, `cost_source=estimated`) | BLOCKED | Cannot compare estimate to provider invoice |

## 3. Blocked and never tested

| Item | Status | Reason |
| --- | --- | --- |
| Provider invoice/billed cost | BLOCKED | No billing API access/credentials; only estimated cost available |
| Core ~180 KB document ingestion (J03) | BLOCKED | Gemini quota exhausted; 43 KB completed in 7.4 s |
| Jina embedding integration tests | BLOCKED | Provider returns HTTP 451 from this network |
| Physical microphone, device switching, human barge-in | NOT TESTED | Voice used disclosed synthesized audio into a virtual mic |
| Separate third-party page loading the embed snippet | NOT TESTED | Public runtime verified at API level with real Origin/key and in-product widget only |
| Multi-worker routing/state consistency | NOT TESTED | Routing state and engine are in-process; no multi-process test |
| Load, soak, concurrency beyond the Core harness | NOT TESTED | Functional audit scope |
| Hallucination rate at scale | NOT TESTED | Only spot-check honesty/grounding |

## 4. Bottlenecks

1. **First-token latency ~9.8–11 s** in audited runs because the Gemini key hit quota 429 and requests failed over to OpenRouter. The failover works, but the user-visible wait is dominated by provider selection/retry, not retrieval (Core search ~1.2 s p50) or TTS (1.09 s first byte).
2. **Single-process routing state**: budgets, RPM counters, cooldowns and breakers live in process memory; correctness under multiple workers/replicas is unproven.
3. **FinOps UI is pull-based**: operators see stale totals until they press Refresh (observed $0.0025 → $0.0029 after refresh).
4. **Relaxed grounding signal**: downstream analytics and UI trust `is_grounded`, which over-reports.
5. **Public config endpoint** does unnecessary work for invalid keys instead of failing closed (branding-only exposure).

## 5. Security gaps and observations

- Credentials are Fernet-encrypted, masked, live-validated and never returned in responses; plaintext was not found in the QA SQLite files. This is a strength.
- The browser never receives provider keys; voice and TTS are proxied through an authenticated relay, and WS rejects missing/invalid tokens and disallowed origins at the handshake.
- Cross-tenant isolation held in Core (404) and Platform (404 project access).
- Remaining concerns: public config tolerates invalid keys/origins (by design, but undocumented); Core chat returns citations on refusal; binary upload handling is sloppy; upload memory is unbounded relative to file size; no evidence of multi-worker counter correctness; no external penetration test or rate-limit abuse test was performed in this audit.
- No secrets were printed or committed during the audit.

## 6. Delivery integrity

- Platform: exactly one verified fix was committed and pushed on `develop` (`de740c9`, publish with multiple deployments). All other audit changes are test artifacts/reports, not product code.
- Core: ingestion reliability fix `6ae346a` was already committed and verified; the Core audit report is untracked (not committed).
- The pre-existing **91-commit Platform delta between `main` and `develop` remains unreviewed and untouched**; this audit added one commit on top of it (now 92 ahead) and performed no merge, rebase, release or production deployment.

## 7. Recommended remaining work (priority order)

1. Add a relevance gate for citations and make grounding reflect answer attribution; return no sources on refusal.
2. Fix Core defects CORE-02 (orphan files), CORE-03 (binary rejection), CORE-08 (streamed upload cap), CORE-06 (conversation-aware query rewrite), CORE-01 (KB update).
3. Make routing state durable/shared (Redis/DB) and verify under multiple workers; add provider delete and true cooldown recovery in `routing/explain`.
4. Implement provider billing reconciliation so "estimated vs billed" can be validated.
5. Decide and document public config key/origin semantics (or enforce them).
6. Re-run the voice scenario with a physical microphone and a human barge-in; re-run the embed snippet in an independent third-party page.
7. Add regression tests for multi-turn follow-ups, publish idempotency with multiple deployments, and console-visible SSE contract (`meta/delta/done`).
8. Provision Redis for telemetry in every environment, then verify event ingestion and dashboards.

## 8. Report index

| Report | Location |
| --- | --- |
| Core functional test | `C:\Users\Alireza\GitHub\weirwise-rag-core\CORE_FUNCTIONAL_TEST_REPORT.md` |
| Platform functional test | `PLATFORM_FUNCTIONAL_TEST_REPORT.md` |
| Admin functional test | `ADMIN_FUNCTIONAL_TEST_REPORT.md` |
| End-to-end test | `END_TO_END_TEST_REPORT.md` |
| Raw evidence | `artifacts/audit/*_results.json` (both repositories) |

## 9. Final verdict

- **Genuinely works:** Core retrieval/ingestion, Platform knowledge→answer, streaming, multi-turn, publishing enforcement on chat, Admin routing/failover/accounting, and authenticated voice with barge-in.
- **Genuinely does not work or is partial:** Core KB/file hygiene, binary upload validation, buffered uploads, refusal-citation behavior, follow-up retrieval consistency, provider deletion, explain/cooldown observability, grounding semantics, public-config strictness.
- **Blocked:** billed-cost reconciliation, one large-document ingestion case, Jina provider tests.
- **Never tested:** physical voice hardware, third-party embed page, multi-worker routing, load/soak, hallucination rate at scale.

Weirwise is a credible functional product in the audited paths, but it should not be called production-ready until the security/data-hygiene gaps, routing-state durability and observability items above are resolved and the 91-commit delta is reviewed.

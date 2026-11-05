# Weirwise Platform Functional Test Report

Date: 2026-11-05
Scope: Platform backend, Core integration, customer-facing product surfaces (Knowledge, Assistants, Playground, Publishing, Voice).
Branch: `develop` (audit fix `de740c9`). No merge to `main`, no deployment.

## 1. Environment and data

| Item | Value |
| --- | --- |
| Platform backend | `http://127.0.0.1:8010` (uvicorn, `backend/.env` exported, `DATABASE_URL=sqlite+aiosqlite:///./platform_qa.db`) |
| Platform database | `platform_qa.db` (isolated QA DB) |
| Core | `http://127.0.0.1:8002`, PostgreSQL 16 + pgvector, `weirwise_test` |
| Frontend | `http://localhost:3000` (Next.js dev server) |
| QA identity | dedicated `super_admin` QA account; synthetic corpus `browser_audit_policy.md` |
| Provider credentials | authorized Deepgram and OpenRouter/Gemini keys from the QA env; keys never printed or exposed to the browser |
| Safety | no production data, no customer documents, no unbounded vector queries, no destructive ops outside tests |

Retrieval used real embeddings through Core. No pseudo-embedding semantic claims are made.

## 2. Method

1. API-level functional tests against the real backend and real Core (`artifacts/audit/platform_integration.py`, rechecks, `platform_stream_context.py`).
2. State verification in SQLite (`platform_qa.db`) and PostgreSQL (`documents`, `document_chunks`), not just HTTP status.
3. Real provider calls for answer generation, citations, streaming and voice; mocks were not substituted for integrations.
4. Browser verification of Playground, publishing and voice using the real UI with the memory-only access token.
5. Every FAIL was re-run after the environment was corrected; results below reflect the verified state, with the earlier failure documented.

## 3. Results by capability

### 3.1 Authentication, workspace and project isolation

| ID | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| P01 | QA login | 200 + JWT | 200 `qa-audit-…@example.com` | PASS |
| P02 | Create isolated QA project | 201 + id | 201 `9ddd814b-…` | PASS |
| P22 | Other user reads audit project | 403/404 | 404 "Project not found or access denied." | PASS |
| AD01–AD05 | Admin RBAC | unauth 401 / non-admin 403 | 401 and 403 with explicit detail | PASS |

### 3.2 Knowledge: create → upload → process → index → search → delete

| ID | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| P04 | Bulk upload 4 markdown docs | 202 accepted | 202, 4 documents | PASS |
| P05 | Documents reach ready | 4 ready | 4/4 `ready` | PASS |
| R21 | Ingestion completes with Core doc id | `ready` + `core_doc_id` | `ready`, `core_doc_id=bd4e071d-…` | PASS |
| R22 | Source exposes `core_kb_id` after first ingestion | present | `core_kb_id=588c4d6b-…` | PASS |
| R23 | Core stores completed document and vector | ≥1 chunk, dim 1536 | docs=1 completed=1 chunks=1 dim=1536 | PASS |
| R24 | Core retrieval over Platform KB | `shipping.md` rank 1 | 200, `shipping.md`, score 0.704 | PASS |
| P23/R25 | Delete document removes Core doc + vectors | 204, Core 404, 0 chunks | 204, Core 404, 0 chunks | PASS |
| P24/R26 | Delete source removes Core KB + vectors | 204, Core 404, 0/0 | 204, Core 404, 0 docs, 0 chunks | PASS |

Notes:
- `core_kb_id` is populated lazily at first document ingestion, not at source creation (R15). The source remains usable and the id appears after ingestion. This is a design/observability nuance, not a data-loss issue.
- The earlier run (`platform_integration_results.json`) reported documents `ready` while Core held 0 documents and retrieval returned 422. Root cause was a backend started without `backend/.env`, so the Platform Core client pointed at `localhost:8001` instead of the audited Core at `8002`. After the environment was corrected, ingestion, vector persistence, retrieval and deletion were re-verified end to end (R21–R26 all PASS). No product defect is claimed from that run.

### 3.3 Assistants and grounded Q&A

| ID | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| P08/P09 | Create assistant, bind source, reload config | persisted | name/threshold 0.5/top_k 4 persisted | PASS |
| P10 | Factual question (real LLM) | 2–3 business days + citation | "Standard shipping takes 2 to 3 business days inside the EU [1]." sources shipping.md, refunds.md; scores 0.682/0.557 | PASS |
| P11 | Unsupported question honesty | explicit no-answer | "I do not have enough verified information…" grounded=False sources=0 | PASS |
| P13 | Conversation history persists/ordered | alternating roles | 6 messages user/assistant alternating | PASS |
| S01/S02 | Streaming SSE contract | delta tokens then done | 200 `text/event-stream`; `meta, meta, 16×delta, done`; first delta 9,765 ms; grounded, OpenRouter `openai/gpt-4o-mini`, 228 in / 16 out tokens, $0.0000438 | PASS |
| S03/S04 | Multi-turn context | follow-ups resolve "that"/"the refund itself" | "Does that include weekends?" answered about shipping; "how long does the refund itself take…" answered "within 5 business days after the return arrives…" | PASS |
| P12 | Earlier multi-turn run | context used | drifted to `support.md` / support hours | PARTIAL (superseded) |

`P12` failed once during the first integration run (retrieval drift on an implicit follow-up). With an explicit `conversation_id`, two independent follow-ups (`S03`, `S04`) resolved pronouns correctly. The feature works, but follow-up retrieval remains model/retrieval-sensitive and should be pinned by a regression test.

Grounding-label nuance: `is_grounded` is computed as `bool(citations)`, i.e. "chunks passed the similarity threshold", not "the answer was attributed to a passage". An honest refusal can therefore be labelled grounded if a threshold-passing but irrelevant passage was retrieved (E2E-A4). This is a semantics/telemetry weakness, not a fabricated answer.

### 3.4 Playground (browser)

- Real UI at `/playground`, authenticated with the QA `super_admin` account.
- Assistant selector listed `Unpublished Probe` and `Audit Support Assistant`; selection switched the bound assistant and the welcome surface.
- Grounded question answered with a citation card ("1 source") in the browser; responses stream through `/chat/stream`.
- Voice conversation demonstrated end to end in the same UI (section 3.6).

### 3.5 Publishing and embedded widget

| ID | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| B1 | Publish readiness | ready, >=1 indexed doc | `is_ready=true`, 1 source, 1 indexed document | PASS |
| P16/P17 | Publish + deployment | 200 published, public key + domain allowlist | 200, key present, `https://qa-audit.example` | PASS |
| B2/P18 | Config for allowed origin | 200, no prompts/secrets | 200, 10 branding fields, domains `http://localhost:3000` | PASS |
| B4 | Embedded widget Q&A | grounded + citations | "Refunds are processed within 5 business days… [1]" citations `browser_audit_policy.md` | PASS |
| B5/B6 | Public chat origin/key enforcement | 403 / 401 | 403 "Origin domain is not permitted…"; 401 "Invalid widget public key." | PASS |
| B7 | Unpublish blocks, republish restores | 200 / 403 / 200 / published | exactly that | PASS |
| B3/P19/P20 | Public **config** origin/key enforcement | 401/403 | 200 default branding regardless of key/origin | PARTIAL (by design) |

The config endpoint is a public branding document; it intentionally returns default theme data when the key/origin cannot be resolved. Enforcement happens on `/chat` and was verified (B5/B6). The risk is limited to branding disclosure, not answer access, but the asymmetry is undocumented and easy to mistake for an auth bypass.

Defect found and fixed during the audit: publishing an assistant that had more than one `deployments` row raised `MultipleResultsFound` from `scalar_one_or_none()` and returned HTTP 500. Fixed in `backend/app/api/v1/assistants.py:380` by selecting the first deployment (`.scalars().first()`); publish → unpublish → republish was re-verified (B7) and the fix is committed as `de740c9`.

### 3.6 Voice

| ID | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| V01/V02 | Voice status + auth | 200 available / 401 | available=True, nova-3, aura-asteria-en | PASS |
| V03 | TTS synthesis | audio/mpeg > 1 KB | 200, 12,382 bytes, first byte 1,093 ms, total 1,122 ms | PASS |
| V04–V06 | WS rejects missing/invalid token, bad origin | rejection | rejected at handshake (HTTP 403 before accept; server closes 4401/4403) | PASS (assertion expected a WS close code) |
| V07/V09 | Authenticated WS + reconnect after stop | accepted | subprotocol `wwp-voice` accepted; reconnect accepted | PASS |
| E2E-E | Real browser voice turn | transcript → retrieval → grounded answer → streamed TTS, barge-in, continue | transcripts exact; answer "Standard shipping takes 2 to 3 business days inside the EU [1]."; TTS played; second question while reply playing produced "Refunds are processed within 5 business days… [1]" | PASS |
| V08/V11 | Raw PCM relay probe | transcript | no results without encoding/sample_rate | NOT A DEFECT (probe artifact) |

Voice details:
- The browser never receives the Deepgram key; audio goes browser → authenticated relay → Deepgram, transcripts/citations come back over the same socket, TTS through `/voice/speak`.
- Browser path was exercised with the real `MediaRecorder` (`audio/webm;codecs=opus`): 534 audio frames, 100 Deepgram messages, exactly one `finalize` frame at barge-in.
- Barge-in: the second synthesized question was played into the mic 1.0 s after reply TTS started; the hook sent `finalize`, the second question was transcribed and answered, and the second `/chat/stream` (200) ran while the first reply audio was still playing. The continued session worked.
- V08/V11 sent raw linear PCM without `encoding`/`sample_rate`; the relay does not declare them, so Deepgram returned no results. The real browser sends WebM/Opus, which Deepgram auto-detects. This was a probe artifact, not a product failure.
- Not tested: physical microphone hardware and device switching. The voice E2E used a synthesized voice fed into a virtual microphone (explicitly disclosed, not reported as a physical-device test).

### 3.7 Telemetry and operations

- `POST /telemetry/events:batch` returns 503 in this environment because `REDIS_URL` is not configured. This is an observability blocker in the local stack, not a knowledge/chat failure. It is reported as BLOCKED for this environment rather than PASS.
- Usage/cost is recorded per successful routed LLM call; see the Admin report for ledger/FinOps consistency.

## 4. Performance observations

| Measurement | Value |
| --- | --- |
| Core retrieval (search, QA) | 200 with top hit 0.704; E2E citation score 0.6097 |
| Chat first SSE delta | 9,765 ms (Gemini quota 429 → OpenRouter failover on this key set) |
| Full grounded answer | ~10–11 s in the audited runs |
| TTS first byte / total (12 KB) | 1,093 ms / 1,122 ms |
| Voice first transcript | ~4 s after the spoken prompt ended |

The dominant latency is LLM/provider selection (Gemini quota exhaustion then failover), not retrieval or TTS. This is a readiness bottleneck: user-perceived first token is ~10 s with the current credential pool.

## 5. Defects, partials, blocked and not tested

| Item | Classification | Detail |
| --- | --- | --- |
| Publish 500 with multiple deployments | FIXED | committed `de740c9`; re-verified |
| Public config ignores key/origin | PARTIAL | chat enforces; config returns default branding |
| `is_grounded` = citations attached | PARTIAL | refusals can be labelled grounded |
| `core_kb_id` populated only after first ingestion | PARTIAL | source looks unprovisioned until then |
| Follow-up retrieval drift (one run) | PARTIAL | passed twice on re-run with explicit conversation id |
| Telemetry 503 (no Redis) | BLOCKED (environment) | events not ingested locally |
| Cross-origin session refresh | PARTIAL (local setup) | memory-only token + refresh cookie on `127.0.0.1:8010` from `localhost:3000`; page reload requires re-login in this split-origin dev stack. Same-origin production (nginx) not tested here. |
| Physical mic / device switching | NOT TESTED | synthetic mic used |
| Load, soak, concurrency | NOT TESTED | out of scope for this functional audit |

## 6. Artifacts

- `artifacts/audit/platform_integration_results.json` (first run, environment failure recorded)
- `artifacts/audit/platform_recheck_results.json`, `platform_recheck2_results.json`, `platform_recheck3_results.json` (re-verification)
- `artifacts/audit/platform_stream_context_results.json` (SSE + multi-turn)
- `artifacts/audit/voice_probe_results.json`, `voice_stt_results.json`, `e2e_voice_results.json`
- `artifacts/audit/e2e_results.json`
- Backend log: `C:\Users\Alireza\AppData\Local\Temp\qoder-cli\C--Users-Alireza-GitHub\2c3cb4ee-d5ed-4beb-99ea-7a3ba3e65a77\tasks\b256j1f33.output`

## 7. Verdict

The audited Platform capabilities work end to end against real Core, real embeddings, real LLM and real Deepgram: knowledge ingestion/retrieval, grounded assistant answers with citations, streaming, multi-turn, publishing with origin/key enforcement on chat, and authenticated voice with barge-in. Remaining gaps are documented above; none of them were replaced by mocks or reported as PASS.

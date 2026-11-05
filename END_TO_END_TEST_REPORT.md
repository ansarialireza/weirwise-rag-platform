# Weirwise End-to-End Test Report

Date: 2026-11-05
Scenarios: A (knowledge → grounded answer), B (publishing/widget), C (admin routing failure), D (admin ↔ product consistency), E (voice session).
Environment: platform `127.0.0.1:8010` on isolated `platform_qa.db`, Core `127.0.0.1:8002` (pgvector), Next.js UI `localhost:3000`, real Deepgram/OpenRouter/Gemini credentials, synthetic QA corpus `browser_audit_policy.md`.
Branch: `develop`; no production deployment or merge.

## Summary

| Scenario | Tests | PASS | PARTIAL | FAIL | BLOCKED |
| --- | --- | --- | --- | --- | --- |
| A Knowledge → grounded answer | 4 | 3 | 1 | 0 | 0 |
| B Publishing / public widget | 7 | 6 | 1 | 0 | 0 |
| C Admin routing failure and recovery | 2 | 2 | 0 | 0 | 0 |
| D Admin ↔ product consistency | 3 | 3 | 0 | 0 | 0 |
| E Voice end-to-end | 1 composite | 1 | 0 | 0 | 0 |
| **Total** | **17** | **15** | **2** | **0** | **0** |

Artifacts: `artifacts/audit/e2e_results.json`, `artifacts/audit/e2e_voice_results.json`, plus the platform/admin result files referenced in their reports.

## A. Knowledge → grounded answer

| ID | Test | Evidence | Status |
| --- | --- | --- | --- |
| A1 | Published assistant bound to a ready, Core-indexed source | assistant `published`; source `ready`, `core_kb_id=761b2aa5-…`; document `browser_audit_policy.md`, `core_doc_id=a2e35a3a-…` | PASS |
| A2 | Core stores indexed chunks | 2 chunk rows, 1 distinct embedding dimension | PASS |
| A3 | Factual question answered from KB | 200, grounded, "Standard shipping takes 2 to 3 business days inside the EU [1].", citation `browser_audit_policy.md`, score 0.6097 | PASS |
| A4 | Unsupported question honesty | 200, text: "The provided context does not contain information regarding the extended warranty period for industrial water pumps." `is_grounded=True`, citation attached | PARTIAL |

A4 is honest text, but the grounding flag and citation come from a threshold-passing passage that is irrelevant to the question. `is_grounded` currently means "citations attached", not "answer attributed". No fabricated fact was observed.

## B. Publishing and public runtime

| ID | Test | Evidence | Status |
| --- | --- | --- | --- |
| B1 | Publish readiness | `is_ready=true`, 1 knowledge source, 1 indexed document | PASS |
| B2 | Public config, allowed origin + valid key | 200, 10 branding fields (`primary_color`, `welcome_message`, `position`, …), no prompts or credentials | PASS |
| B3 | Public config with invalid key | 200 default branding (config ignores unresolvable keys) | PARTIAL |
| B4 | Public chat with valid key and allowed origin | 200 grounded answer "Refunds are processed within 5 business days…", citations `browser_audit_policy.md` | PASS |
| B5 | Public chat, disallowed origin | 403 "Origin domain is not permitted by this assistant deployment policy." | PASS |
| B6 | Public chat, invalid widget key | 401 "Invalid widget public key." | PASS |
| B7 | Unpublish / public chat / republish | unpublish 200 → public chat 403 → republish 200 → status `published` | PASS |

B7 initially failed with HTTP 500 because the assistant had multiple deployment rows (`scalar_one_or_none()` raised `MultipleResultsFound`). Fixed in `backend/app/api/v1/assistants.py` (first deployment) and re-verified; commit `de740c9` on `develop`.

B3 is by design (config is the public branding document; `/chat` enforces key and origin), but the asymmetry is undocumented.

Not tested: loading the generated embed snippet (`embed.js`/public key) into a separate third-party HTML page in an independent browser context. The public runtime contract was verified with real HTTP requests carrying the real `Origin` header and widget key, plus the in-product widget UI. The separate-page embed itself is **NOT TESTED**.

## C. Admin-controlled routing failure and recovery

| ID | Test | Evidence | Status |
| --- | --- | --- | --- |
| C1 | Emergency stop degrades product chat without a provider call | admin settings patch 200 (`emergency_stop=1`); product chat 200 with graceful degraded text; routing events `gemini:no_credential`, `openrouter:no_credential`; `admin_llm_ledger` empty | PASS |
| C2 | Stop removed → real provider routing and accounting | product chat 200 grounded; success event `openrouter / openai/gpt-4o-mini / priority / OpenRouter QA key`; exactly one ledger row (249 tokens, $0.00004455) | PASS |

This scenario used a real OpenRouter call after recovery, not a mock, and proved that the kill switch suppresses provider traffic and billing while still answering safely.

## D. Admin ↔ product consistency

| ID | Test | Evidence | Status |
| --- | --- | --- | --- |
| D1 | FinOps equals ledger after product traffic | FinOps cost 0.002899 vs ledger 0.0028993; tokens 8,149 vs 8,149; 37 rows; by-provider Gemini 2,882 / OpenRouter 5,267 | PASS |
| D2 | Product assistant config equals DB | API and DB both model `Auto`, threshold 0.5, top_k 4, status `published` | PASS |
| D3 | Admin metrics equal product row counts | API (3,3,4,3) equals DB (3,3,4,3) for users/workspaces/assistants/documents | PASS |

Browser spot check: `/admin/finops` initially displayed stale totals and updated to $0.0029 after `Refresh`, matching API/DB. Admin navigation (Overview, Users, Providers, Operations, FinOps, Audit Trail) rendered with real API data.

## E. Voice session (start → transcribe → retrieve → answer → audio → interrupt → continue)

Method: real Next.js Playground, real backend relay and real Deepgram; microphone was simulated by feeding Deepgram-synthesized prompts into the browser's real `MediaRecorder` (`audio/webm;codecs=opus`) via a virtual audio stream. This is a simulated microphone, not a physical device, and is disclosed as such.

| Step | Evidence |
| --- | --- |
| Session start | authenticated WS (`wwp-voice` + JWT) accepted; 534 audio frames sent; recorder mime `audio/webm;codecs=opus` |
| Turn 1 transcript | "Hi, How many business days does standard delivery take", final + `UtteranceEnd` at t+31.9 s from session start |
| Retrieval + answer | `POST /assistants/4005a895…/chat/stream` 200 (`text/event-stream`); rendered answer: **"Standard shipping takes 2 to 3 business days inside the EU [1]."** with 1 source |
| Streamed TTS | `POST /voice/speak` 200 → `audio/mpeg` played via blob (`GET blob:… 206`) |
| Barge-in | second question played into the mic 1.0 s after reply TTS started; app sent exactly one `finalize`; transcript "How long does refund processing take?" was accepted and a second `/chat/stream` (200) started while the first reply audio was playing |
| Continued answer | **"Refunds are processed within 5 business days after the return arrives at our warehouse [1]."** with 1 source; second `/voice/speak` 200 and blob playback |
| Result | PASS |

Additional evidence: the browser never receives the Deepgram key. WS requests without credentials, with an invalid token, or with a disallowed origin are rejected at the handshake. The first attempt after >30 min idle failed with WS 403 because the memory-only access token had expired and refresh is not usable in this split-origin dev setup; after re-login the session worked. This auth-lifecycle behavior is documented in the Platform report and is not counted as a voice-relay failure.

Caveats:
- The "Hi," prefix in the first transcript is the app's local greeting clip captured by the synthetic mic; a human would not have it inside their question.
- Pure silence produces no MediaRecorder frames (Opus DTX), so Deepgram never finalized; an inaudible keepalive tone was added to model an always-live microphone.
- Physical microphone and human barge-in were not tested.

## Cross-scenario observations

1. The single fixed defect (publish 500) was found by B7 in this E2E pass; it is committed as `de740c9` and pushed to `develop` only.
2. Provider failover is functional but slow: the audited runs hit Gemini quota 429 and failed over to OpenRouter, producing ~10 s first-token latency. This affects Scenario A and E user experience.
3. Grounding semantics (`is_grounded` = citations attached) and the public config key/origin laxity are the two product-level partials that should be addressed before relying on these signals operationally.
4. The 91-commit pre-existing `develop` delta remains unreviewed; this audit added exactly one commit and did not merge, rebase, release or deploy anything.

## Verdict

All five scenarios completed against real integrations. Fifteen of seventeen assertions passed; the two partials are honest-refusal citation labelling (A4) and public-config key/origin behaviour (B3). No scenario required a mock to be reported as a pass. Voice barge-in and continuation were demonstrated with disclosed simulated audio input; the physical-device path remains untested.

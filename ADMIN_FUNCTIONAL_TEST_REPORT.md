# Weirwise Admin Control Center Functional Test Report

Date: 2026-11-05
Scope: Admin authentication/authorization, provider and credential lifecycle, routing strategies and failover, budgets/quotas/breakers, cost/usage accounting, admin-to-product consistency.
Environment: backend `http://127.0.0.1:8010`, `platform_qa.db` (isolated QA), real Deepgram/OpenRouter/Gemini credentials, browser `/admin` pages for UI spot checks.
Branch: `develop`; no production access.

## 1. Method

- 47 HTTP tests against the real admin API with DB verification after each mutation (`artifacts/audit/admin_audit.py` → `admin_audit_results.json`).
- 19 deterministic routing-engine tests exercising strategy selection and gates with controlled credentials/spend (`artifacts/audit/admin_routing_selection.py`).
- 3 batch token-save tests (`artifacts/audit/admin_save_tokens.py`) with response/DB checks and no-secret-echo assertions.
- Real provider failures were induced or observed where safe (invalid key validation, 429 quota, upstream 401, restored key recovery); simulated controls (budget, RPM, cooldown, breaker) were applied through the admin API or QA DB metadata, never reported as live provider behavior.
- All test resources were created by the audit and removed afterward; QA data was not deleted without ownership checks.

## 2. Authorization

| ID | Test | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| AD01 | Unauthenticated admin listing | 401 | 401 | PASS |
| AD02 | Non-admin admin listing | 403 | 403 "Super Admin or Platform Staff privileges required" | PASS |
| AD03 | Non-admin provider creation | 403 | 403 with required roles | PASS |
| AD04/AD05 | Admin identity / non-admin probe | super_admin / 403 | role=super_admin; 403 | PASS |

## 3. Provider accounts

| ID | Test | Actual | Status |
| --- | --- | --- | --- |
| AD06 | Duplicate provider | 400 "Provider account already exists." | PASS |
| AD07 | Invalid routing strategy | 422 literal_error | PASS |
| AD08/AD09 | Create + persist | 201, DB row enabled/priority/budget | PASS |
| AD10 | Listing secret-free | no secret fields in response | PASS |
| AD11 | Metadata update persists | display name and budget updated | PASS |
| AD12 | Null update | 422 | PASS |
| AD13 | Provider deletion endpoint | **405 — no DELETE route** | PARTIAL |

The Admin UI exposes provider creation/update/enable/disable, but there is no provider deletion endpoint; cleanup currently requires direct DB access. This is an operational gap (stale provider accounts cannot be removed through the product).

## 4. Credential lifecycle

| ID | Test | Actual | Status |
| --- | --- | --- | --- |
| AD14 | Invalid key live validation | 422, no secret echo, row count unchanged | PASS |
| AD15 | Credential for unknown provider | 404 | PASS |
| AD16 | Valid key accepted after live validation | 201, prefix masked, healthy | PASS |
| AD17 | Encryption at rest | Fernet ciphertext true, hash match, prefix only | PASS |
| AD18 | Plaintext scan of SQLite files | plaintext key absent | PASS |
| AD19 | Listing masked | prefix + metadata only | PASS |
| AD20 | Duplicate credential | 409 | PASS |
| AD21/AD22 | Metadata update / empty update | persisted / 422 | PASS |
| AD23/AD24 | Disable + routing exclusion | disabled, not routable | PASS |
| AD25 | Re-enable with live validation | healthy after real validation | PASS |
| AD46 | Audit trail | add/activate/deactivate/delete/metadata events, no secret leak | PASS |
| AD47 | Delete credential | 204, gone, repeat 404 | PASS |
| AD48 | Batch token save (2 tokens: 1 valid, 1 invalid) | 200, 1 active healthy + 1 inactive invalid, no full token in response | PASS |

Credentials are validated against the live provider, encrypted with a Fernet key, and never returned in clear text. The frontend only ever sees prefixes.

## 5. Routing engine

| ID | Strategy/gate | Actual | Status |
| --- | --- | --- | --- |
| RS01 | priority | stable first choice | PASS |
| RS02 | round_robin | alternating 1/2/1/2, both served | PASS |
| RS03 | weighted | 20/20 to weight-20 credential | PASS |
| RS04 | least_recently_used | selects idle credential | PASS |
| RS05 | least_loaded | selects in-flight-free credential | PASS |
| RS06 | lowest_cost | selects lower-spend credential | PASS |
| RS07 | per-credential budget | skips over-budget credential | PASS |
| RS08/AD35/AD36 | provider global budget | `global_budget_exceeded`, not resolvable | PASS |
| RS09 | disabled provider | `provider_disabled` | PASS |
| RS10/AD30 | model allow-list | `model_not_allowed:gpt-4o` | PASS |
| RS11 | per-credential RPM | second request spills to next credential | PASS |
| RS12/RS13 | cooldown exclusion + auto-recovery | excluded while cooling; healthy after expiry | PASS |
| RS14 | retry-after + breaker policy | 429 → rate_limited/120 s; errors → failed + opens breaker | PASS |
| RS18 | no active credentials | `no_active_credentials` | PASS |
| RS19 | failover exclusion | attempt 2 excludes attempt 1 | PASS |
| AD07 | invalid strategy rejected | 422 | PASS |

`GET /admin/routing/explain` is read-only: during an active cooldown it reports `no_healthy_credentials` and does not itself mutate health, while the selection path (`select_credential`) does auto-recover after cooldown expiry (AD38 PARTIAL). The behavior is safe but makes "why is this unavailable?" harder to answer from the explain endpoint alone.

## 6. Live failure handling and recovery

| ID | Scenario | Actual | Status |
| --- | --- | --- | --- |
| AD33 | Non-streaming cross-provider failover on Gemini 429 | OpenRouter success, 2 citations, 1 ledger row, Gemini failure recorded | PASS |
| AD34 | Streaming failover | SSE `meta` shows OpenRouter, 17 deltas, grounded done | PASS |
| AD32 | Emergency stop | settings persisted; chat 200 with graceful degradation; events `no_credential`; no ledger row | PASS |
| AD37 | Consecutive real provider errors | 2 provider_error events, health failed, cooldown set | PASS |
| AD39 | Real upstream 401 | classified as auth failure, breaker opens | PASS |
| AD40 | Restore key | credential healthy and call succeeds again | PASS |
| RS17 | Emergency stop at engine level | `emergency_stop` | PASS |

The emergency stop is a real, effective kill switch: during the stop, chat still returns a degraded answer without any provider call, and no billed ledger row is written. Recovery restores real routing and billing.

## 7. Usage, cost and reconciliation

| ID | Test | Actual | Status |
| --- | --- | --- | --- |
| AD41 | Ledger integrity | 0 duplicate rows, failures unbilled, successes all billed | PASS |
| AD42 | Credential usage vs ledger | (2801 tokens, 243, $0.000566) equals SQL | PASS |
| AD43 | FinOps summary vs ledger | $0.002497 equals ledger; by-provider/by-model match | PASS |
| AD44 | Metrics vs DB | API (3,3,4,3,5926) equals DB | PASS |
| AD45 | Provider spend counter | $0.0005658 vs ledger $0.000566 | PASS |
| RS15/RS16 | Success accounting / speech without ledger | ledger row + spend updated; ASR success no ledger row | PASS |
| E2E-D1 | FinOps after product traffic | cost 0.002899 vs ledger 0.0028993; tokens 8,149 both; 37 rows | PASS |
| E2E-D2 | Product assistant config vs DB | model/threshold/top_k/status equal | PASS |
| E2E-D3 | Admin metrics vs product rows | users/workspaces/assistants/documents (3,3,4,3) equal | PASS |

UI spot check: the FinOps page initially showed stale totals ($0.0025 / 3,044 provider tokens); after `Refresh` it showed $0.0029 with the current provider split (Gemini 2,882 / OpenRouter 5,267), matching the API and ledger. The page is correct but not live-push; an operator must refresh.

`cost_source` remains `estimated` and `billed` is 0: provider invoice/billing reconciliation is not implemented or not reachable, so "estimated vs billed" is only available as estimated. This is reported as BLOCKED, not PASS.

## 8. Findings summary

| Classification | Items |
| --- | --- |
| PASS | 45/47 admin HTTP tests, 19/19 routing-engine tests, 3/3 batch-token tests, emergency stop, controlled 429/401 failover, breaker, cooldown, budgets, RPM, ledger/FinOps/metrics consistency, credential encryption/masking/deletion, RBAC |
| PARTIAL | No provider DELETE route (AD13); explain does not auto-recover cooled credentials (AD38); FinOps requires manual refresh |
| BLOCKED | Provider invoice/billed-cost reconciliation (no billing integration/credentials) |
| NOT TESTED | Multi-worker/process routing-state consistency (routing state and engine are in-process); provider-side dashboard reconciliation; load/concurrency |

## 9. Artifacts

- `artifacts/audit/admin_audit_results.json` (47 tests)
- `artifacts/audit/admin_routing_selection_results.json` (19 tests)
- `artifacts/audit/admin_save_tokens_results.json` (3 tests)
- `artifacts/audit/e2e_results.json` (C1/C2/D1–D3 cross-checks)
- Backend log: `C:\Users\Alireza\AppData\Local\Temp\qoder-cli\C--Users-Alireza-GitHub\2c3cb4ee-d5ed-4beb-99ea-7a3ba3e65a77\tasks\b256j1f33.output`

## 10. Verdict

The Admin Control Center is functionally operational against the real backend: RBAC holds, credentials are live-validated and encrypted, every routing strategy and safeguard behaves as specified under controlled conditions, real provider failures are classified and failed over, and cost/usage surfaces reconcile with the ledger and database. The gaps that remain are the missing provider delete endpoint, explain/cooldown observability, and the absence of billed-cost reconciliation.

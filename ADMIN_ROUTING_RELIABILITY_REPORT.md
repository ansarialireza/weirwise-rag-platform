# Weirwise Admin Routing Reliability Report

Date: 2026-11-05
Scope: admin credential vault, provider accounts, credential pools, routing engine, failover, cooldowns, shared account limits, budgets, emergency stop, and FinOps ledger.
Evidence base: `ADMIN_ROUTING_AUDIT.md` (2026-11-04), the previous reliability pass, and the §12 hardening verified by `backend/tests/test_admin_routing_hardening.py` on 2026-11-05.

---

## 1. Architecture

```
Admin UI
  └─ admin JWT → server-side admin dependency (401 unauthenticated, 403 non-admin)
       └─ Provider account (enabled, manual/automatic, emergency stop,
       │                    account-wide RPM / TPM / concurrency)
            └─ Credential pool (Fernet ciphertext, masked prefix, priority, weight,
                 budget, warning threshold, RPM, TPM, max concurrency, health,
                 cooldown)
                 └─ IntelligentRoutingEngine.select_credential()
                      ├─ account-wide limit check (shared by every token)
                      ├─ filters: provider enabled, credential active, health,
                      │           cooldown, budget, model, excluded ids
                      ├─ per-token RPM / TPM / concurrency check
                      ├─ atomic reservation of concurrency slot + rate windows
                      ├─ strategies: priority | round_robin | least_recently_used |
                      │              least_loaded | weighted | lowest_cost
                      └─ RoutingEvent (outcome, strategy, reason, latency, failover,
                                       error_category, retry_after)
                           └─ provider call → success event / failure record
                                └─ CostLedger (estimated; billed kept separate)
```

Credentials are encrypted at rest with Fernet; API responses expose only a masked prefix. Live validation is required before an invalid token can be enabled. Routing events carry provider, masked prefix, strategy, reason, category and latency — no secrets.

## 2. Shared-quota protection

Provider accounts now carry three optional account-wide limits shared by every token:

| Limit | Field | Behavior |
|---|---|---|
| Requests/minute | `account_rate_limit_rpm` | Checked before token selection; once exhausted, no token is selected |
| Tokens/minute | `account_rate_limit_tpm` | Checked with the request's estimated input tokens |
| Concurrent requests | `account_max_concurrency` | Slots reserved atomically and released when the provider call finishes |

A fourth per-token limit, `max_concurrency`, bounds parallel calls for a single token. Together these mean rotating to another token cannot exceed an account-level provider quota: the account window is charged once per attempt regardless of which token serves it.

`0` means “not configured”, so existing pools keep working without new limits.

## 3. Failure recovery matrix

| Failure | Classification | Credential effect | Retry behavior |
|---|---|---|---|
| 429 / rate limit | `rate_limit` | `rate_limited`, jittered cooldown ≥ Retry-After | Retry another token after bound |
| 401 / 403 | `auth` | `failed`, token disabled pending admin review | Move to next provider |
| 402 / quota / billing | `quota` | `exhausted`; cooldown if a reset window is known, otherwise disabled | Move to next provider |
| Invalid request / unknown model | `invalid_request` | No health change, no penalty | Abort retries for the request |
| Timeout / 408 / 504 | `timeout` | Degraded; breaker after threshold | Bounded jittered retry |
| 5xx / connection / 503 | `provider` / `connection` | Degraded; breaker after threshold | Bounded jittered retry |
| Empty stream | `empty_response` | Degraded | Bounded jittered retry |
| Manual mode | — | No automatic health mutation | No token rotation |

Retries use exponential backoff with jitter (base 0.2 s, capped at 2 s; rate-limit delays capped at 5 s). Invalid requests are never retried and never penalize a token. Auth, quota and invalid-request failures are explicitly non-retryable.

## 4. Verified behavior

| Requirement | Result | Evidence |
|---|---|---|
| Provider/credential create, list, update, delete | Pass for credentials (create/list/update/delete) | Live admin suite |
| Provider account delete | **Gap** | Code check: no `DELETE` route exists for provider accounts; only credentials, subscription tiers and routing strategies have delete routes |
| Secure storage | Pass | DB ciphertext `gAAAAA...`; decrypt round-trip; no plaintext in QA SQLite |
| Live validation before save | Pass | Real Deepgram key validated; invalid key produced 0 valid / 1 inactive |
| Enable requires validation | Pass | Invalid token → 422; UI did not flip |
| Per-token enable/disable | Pass | Disabled pool blocked speech with 502; re-enable restored it |
| Metadata persistence | Pass | Label, priority, weight, budget, threshold, RPM persisted |
| Six strategies | Pass | Each selected a different credential with a distinct reason |
| 401/403/429/timeout classification | Pass | `_error_category` mapping verified |
| Retry-After cooldown | Pass | Numeric Retry-After accepted; invalid ignored |
| Circuit breaker | Pass | Failure threshold opens the breaker and excludes the credential |
| Bounded failover | Pass | Maximum 3 attempts per provider, excluded ids tracked per request |
| Emergency stop | Pass | Selection blocked and audited |
| Budgets | Pass (pre-flight) | Global and per-credential budgets block selection |
| RPM limiter | Pass | Exhausted token rotates to the next credential |
| Exactly one ledger row per success | Pass (application layer) | Streaming failover produced one additional row, not duplicates |
| Estimated vs billed | Partial | `cost_source=estimated`; billed stays 0 until invoices are imported |
| Admin observability | Pass | Routing history, usage, health, last success/failure, secret-free event trail |
| Public abuse-control visibility | Added | `/admin/stats` now reports public rate-limit state and tracked-key counts |
| Multi-token registration | Pass | 3 tokens parsed; 2 active, 1 rejected |
| Validation before activation | Pass | Invalid token stored inactive by bulk import; direct add returns 422 before persistence |
| Manual vs automatic mode | Pass | Mode switch persists; manual mode pins the primary and does not rotate |
| 429 detection + cooldown | Pass | `rate_limited` health and cooldown ≥ Retry-After |
| Shared account RPM | Pass | Third request blocked after two account-wide reservations across two tokens |
| Shared account TPM | Pass | Second 80-token request blocked by a 100-token account budget |
| Concurrency limits | Pass | Account/token slot blocked a parallel request until release |
| Retry policy | Pass | Backoff bounds and failure classification verified |
| Provider outage | Pass | `no_credential` event recorded |
| RBAC on new endpoints | Pass | Non-admin receives 403 on overview and health-check |
| Secret safety | Pass | Plaintext token absent from credential, overview and health-check responses |
| Usage/cost accuracy | Pass | One ledger row, exact spend, reserved-token accounting (90 reserved + 20 output = 110 TPM) |

### Test totals

| Suite | Result |
|---|---|
| §12 routing hardening suite | 18/18 |
| Full backend suite (2026-11-05) | 95 passed, 12 skipped |
| Routing engine unit suite (earlier audit) | 38/38 |
| Live admin control center (earlier audit) | 40/40 |
| Admin UI browser workflow (earlier audit) | 36/36 |

The §12 suite uses the real routing engine, real vault, real SQLite database and the real admin API. Provider HTTP calls are simulated at the boundary; other LLM providers were not exercised against paid vendor endpoints. Earlier suites used the real Deepgram credential.

### Admin observability added

- `GET /admin/routing/overview?window_hours=1..168` aggregates per-provider and per-credential requests, successes, failures, 429 events, failovers, latency, tokens, cost, live RPM/TPM utilization, in-flight requests, remaining token quota, cooldowns, and account-wide utilization.
- `POST /admin/providers/{id}/health-check` probes every active token without exposing plaintext, disables revoked tokens, cools down rate-limited tokens, and leaves transient timeouts untouched.
- Admin console: account-limit inputs, per-token TPM/concurrency editing, a 24-hour routing overview with limit warnings, and a health-check action with per-token results.

## 5. Failover behavior

- The engine filters unusable credentials, then tries eligible ones in strategy order.
- A 429 places the credential into a `Retry-After`-bounded, jittered cooldown and the next credential is tried after a bounded delay.
- Auth failures disable the token; quota exhaustion cools it down or disables it; invalid requests abort without penalizing the token.
- Both streaming and non-streaming paths stop after three attempts per provider; there is no unbounded retry loop and no retry storm.
- Commit `863f334` reuses one keep-alive provider client across attempts and providers. This removes repeated TLS setup from the retry path, but the latency effect has **not** been re-measured. The recorded 9.8 s first-token failover result predates both this change and quota exhaustion.

## 6. Accounting integrity

- A successful routed call writes exactly one `CostLedger` row, including after a streaming failover.
- Failed calls are not billed in the local ledger.
- Estimated cost is computed locally and labelled; billed cost is a separate field and remains zero until provider invoices are imported.
- Token windows account for the input estimate reserved during selection plus the delta and generated output, avoiding double counting.
- Budget checks are pre-flight and do not reserve budget, so a concurrent burst can overshoot a configured limit before the ledger updates. This is an application-level limitation, not a provider-billing observation.

## 7. Gaps and risks

| ID | Severity | Gap | Effect |
|---|---|---|---|
| A-01 | Low | Disabled/empty provider pool blocks environment-key fallback | Voice can be disabled by an empty pool even when an environment key exists; intentional precedence, but must be documented in the UI |
| A-02 | Medium | Budget enforcement is not atomic | Concurrent requests can overshoot a hard budget |
| A-03 | Medium | Provider accounts cannot be deleted via the API (route absent) | Stale providers require database cleanup |
| A-04 | Medium | `routing/explain` does not auto-recover cooled credentials | Explain can report `no_healthy_credentials` while selection would succeed |
| A-05 | Medium | Routing state, budgets and breakers are in-process | Current deployment uses one uvicorn worker, so counters are accurate for it; multi-worker/replica correctness is unproven without Redis |
| A-06 | Low | Only Deepgram was a real credential | LLM failover validated at the HTTP boundary, not against paid vendors |
| A-07 | BLOCKED | Billed-cost reconciliation | No provider billing API/invoices available |
| A-08 | Low | FinOps UI is pull-based | Operators see stale totals until refresh (observed $0.0025 → $0.0029) |
| A-09 | Low | Voice selection does not hold a concurrency slot for the socket lifetime | Account RPM/TPM still apply at selection; long-lived voice sockets are not counted as in-flight |

## 8. Recommended work

1. Add provider-account deletion with referential cleanup and an audit entry.
2. Make `routing/explain` apply the same cooldown recovery as selection.
3. Add budget reservation or post-call reconciliation for hard caps.
4. Move routing state and rate windows to Redis and verify with at least two workers.
5. Hold a concurrency reservation for the lifetime of voice websockets.
6. Re-run failover timing with two real LLM credentials and record first-token p50/p95 before and after `863f334`.
7. Import provider invoices to validate estimated vs billed cost.

## 9. Conclusion

In the current single-process deployment the routing engine now enforces per-token and account-wide RPM, TPM and concurrency limits, distinguishes failure classes with appropriate recovery, keeps revoked tokens out of rotation, and exposes secret-free observability. The 18-scenario hardening suite and the full backend suite pass, and lint, format, mypy and the frontend production build are green. Hard budget guarantees and multi-instance correctness remain open and are not claimed.

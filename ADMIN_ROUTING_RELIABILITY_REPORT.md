# Weirwise Admin Routing Reliability Report

Date: 2026-11-05
Scope: admin credential vault, provider accounts, credential pools, routing engine, failover, cooldowns, budgets, emergency stop, and FinOps ledger.
Evidence base: `ADMIN_ROUTING_AUDIT.md` (2026-11-04) plus a current code check of the provider/credential routes and the routing call path.

---

## 1. Architecture

```
Admin UI
  └─ admin JWT → server-side admin dependency (401 unauthenticated, 403 non-admin)
       └─ Provider account (enabled, manual/automatic, emergency stop)
            └─ Credential pool (Fernet ciphertext, masked prefix, priority, weight,
                 budget, warning threshold, RPM limit, health, cooldown)
                 └─ IntelligentRoutingEngine.select_credential()
                      ├─ filters: provider enabled, credential active, health,
                      │           cooldown, budget, RPM, excluded ids
                      ├─ strategies: priority | round_robin | least_recently_used |
                      │              least_loaded | weighted | lowest_cost
                      └─ RoutingEvent (outcome, strategy, reason, latency, failover)
                           └─ provider call → success event / failure record
                                └─ CostLedger (estimated; billed kept separate)
```

Credentials are encrypted at rest with Fernet; API responses expose only a masked prefix. Live validation is required before an invalid token can be enabled. Routing events carry provider, masked prefix, strategy, reason, category and latency — no secrets.

## 2. Verified behavior

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

### Test totals from the audit

| Suite | Result |
|---|---|
| Routing engine unit suite | 38/38 |
| Live admin control center | 40/40 |
| Admin UI browser workflow | 36/36 |

These suites used the real routing engine, real database, real vault and real Deepgram credential. Other LLM providers were simulated at the HTTP boundary; that limitation is stated below.

## 3. Failover behavior

- The engine filters unusable credentials, then tries eligible ones in strategy order.
- A 429 places the credential into a `Retry-After`-bounded cooldown and the next credential is tried.
- Auth failures exclude the credential for the request; a configured breaker excludes it across requests until it recovers.
- Both streaming and non-streaming paths stop after three attempts per provider; there is no unbounded retry loop.
- Commit `863f334` now reuses one keep-alive provider client across attempts and providers. This removes repeated TLS setup from the retry path, but the latency effect has **not** been re-measured. The recorded 9.8 s first-token failover result predates both this change and quota exhaustion.

## 4. Accounting integrity

- A successful routed call writes exactly one `CostLedger` row, including after a streaming failover.
- Failed calls are not billed in the local ledger.
- Estimated cost is computed locally and labelled; billed cost is a separate field and remains zero until provider invoices are imported.
- Budget checks are pre-flight and do not reserve budget, so a concurrent burst can overshoot a configured limit before the ledger updates. This is an application-level limitation, not a provider-billing observation.

## 5. Gaps and risks

| ID | Severity | Gap | Effect |
|---|---|---|---|
| A-01 | Low | Disabled/empty provider pool blocks environment-key fallback | Voice can be disabled by an empty pool even when an environment key exists; intentional precedence, but must be documented in the UI |
| A-02 | Medium | Budget enforcement is not atomic | Concurrent requests can overshoot a hard budget |
| A-03 | Medium | Provider accounts cannot be deleted via the API (route absent) | Stale providers require database cleanup |
| A-04 | Medium | `routing/explain` does not auto-recover cooled credentials | Explain can report `no_healthy_credentials` while selection would succeed |
| A-05 | Medium | Routing state, budgets, RPM and breakers are in-process | Multi-worker/replica correctness is unproven; with no Redis, rate limits are per process |
| A-06 | Low | Only Deepgram was a real credential | LLM failover was validated at the HTTP boundary, not against paid vendors |
| A-07 | BLOCKED | Billed-cost reconciliation | No provider billing API/invoices available |
| A-08 | Low | FinOps UI is pull-based | Operators see stale totals until refresh (observed $0.0025 → $0.0029) |

## 6. Recommended work

1. Add provider-account deletion with referential cleanup and an audit entry.
2. Make `routing/explain` apply the same cooldown recovery as selection.
3. Add budget reservation or post-call reconciliation for hard caps.
4. Move routing state, RPM counters and breakers to a shared store; verify with at least two workers.
5. Re-run failover timing with two real LLM credentials and record first-token p50/p95 before and after `863f334`.
6. Import provider invoices to validate estimated vs billed cost.

## 7. Conclusion

In a single-process deployment the routing engine is reliable: bounded failover, cooldown, breaker, emergency stop, secret-safe observability and one-row-per-success accounting all passed their suites. It is not production-ready for multiple workers or hard budget guarantees, and one CRUD route (provider deletion) is missing. The failover latency improvement from connection reuse is a code-level change awaiting measurement, not a demonstrated result.

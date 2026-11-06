# Admin Routing Audit

Date: 2026-11-04
Scope: Admin Control Center, provider accounts, credential pools, routing engine, and token failover.
Evidence: live backend `127.0.0.1:8010`, live Next.js UI `127.0.0.1:3000`, real Deepgram credential,
real encrypted vault, real QA database.

## Architecture

```
Admin UI (providers page)
  └─ Authorization: admin JWT -> server-side admin dependency
       └─ Provider account (enabled, management_mode manual|automatic, emergency_stop)
            └─ Credential pool (Fernet-encrypted key, masked prefix, priority, weight,
                 budget, warning threshold, RPM limit, health state, cooldowns)
                 └─ IntelligentRoutingEngine.select_credential()
                      ├─ filters: provider enabled, credential active, health, cooldown,
                      │           budget, RPM limiter, excluded ids
                      ├─ strategies: priority | round_robin | least_recently_used |
                      │              least_loaded | weighted | lowest_cost
                      └─ writes RoutingEvent (outcome, strategy, reason, category, latency)
                           └─ LLM/voice call -> success (record_success_event) or failure
                                └─ CostLedger (cost_source = estimated | billed)
```

Secrets are encrypted with Fernet before storage. API responses expose only a masked prefix
(for example `e6eebef...36b3`). The full key is never returned by list, detail, validation, usage,
or routing-event endpoints.

## Requirement checklist

| Requirement | Status | Evidence |
|---|---|---|
| Provider CRUD | Pass | Create, list, update, delete verified live and in the browser; provider deleted from DB |
| Multiple token pools (Deepgram, Jina, LLM) | Pass | Multiple credentials per provider; pool precedence verified for Deepgram STT/TTS |
| Secure storage | Pass | DB ciphertext begins `gAAAAA...`; decrypt round-trip through the vault succeeded |
| Per-token enable/disable | Pass | Disable persisted across reload; disabled pool blocks speech with 502; re-enable restored speech |
| Live validation before save | Pass | Real Deepgram key validated against the provider; invalid token produced 0 valid / 1 inactive |
| Enable requires validation | Pass | Enabling an invalid token returned 422 and the UI did not flip to enabled |
| Token metadata | Pass | Label, priority, routing weight, monthly budget, warning threshold, RPM persisted and reloaded |
| Usage | Pass | Attempts, success rate, tokens, average latency, estimated and billed cost |
| Errors | Pass | `last_success_at`, `last_failure_at`, sanitized `last_error_reason` surfaced per credential |
| Rate-limit status | Pass | 429 sets `rate_limited` health and a cooldown derived from Retry-After |
| Last success / last failure | Pass | Timestamps written on success and failure; health probe timestamp stored |
| Health | Pass | `healthy`, `rate_limited`, `failed` states observed; cooldown auto-recovery path exists |
| Never show full token | Pass | All responses and event logs checked; only masked prefixes present |
| Failover strategies | Pass | Six strategies select different credentials and emit distinct decision reasons |
| 401/403/429/timeout classification | Pass | `_error_category`: 429 -> rate_limit, 401/403 -> auth, timeout -> timeout, otherwise provider |
| Backoff / circuit breaker / Retry-After | Pass | Retry-After drives cooldown; failure threshold opens breaker and excludes credential |
| No infinite retries | Pass | Maximum 3 attempts per provider in both streaming and non-streaming paths |
| No blind retries | Pass | Excluded credential ids are tracked per request; cooling/broken credentials skipped |
| Idempotency / duplicate billing | Pass (application layer) | Exactly one CostLedger row per successful answer, including after streaming failover |
| Manual vs automatic modes | Pass | Manual chooses highest priority and leaves health untouched; automatic records health/failover |
| Explain token selection | Pass | Explain returns mode, strategy, chosen credential, and reason; disabled provider returns a reason |
| No misleading toggle | Pass | Backend rejection is reflected in the UI; no optimistic success on 422 |
| Routing observability without secrets | Pass | Events show provider, masked prefix, strategy, reason, category, latency, failover number |
| Accurate usage/cost, estimates distinct from billed | Pass (estimated) | `cost_source = estimated` verified; billed amounts are separate fields, zero when not invoiced |
| Emergency stop and budgets | Pass | Emergency stop blocks selection and is audited; global and per-credential budgets block selection |

## Test results

| Suite | Result | Scope |
|---|---|---|
| Routing engine unit suite | **38/38** | Real routing engine and real DB; provider HTTP boundary patched |
| Live admin control center | **40/40** | Real Deepgram validation/TTS, real vault, real DB, real routing events |
| Admin UI browser workflow | **36/36** | Real backend through the Next.js UI |

### Unit coverage (38 checks)

- Manual mode: priority selection, no health mutation on failure, failure timestamp recorded.
- Automatic mode: auth-failure exclusion, next-credential failover, failover flag and attempt number,
  event recorded, key-like strings redacted from error messages.
- Rate limit: `rate_limited` health, Retry-After-bounded cooldown, cooling credential skipped.
- Circuit breaker: threshold opens breaker, broken credential excluded.
- Emergency stop: routing blocked and audited.
- Budgets: global provider budget blocks selection; per-credential budget skips that credential.
- RPM limiter: exhausted token rotates to the next credential.
- Strategies: round robin (least served), LRU (oldest), least loaded (idle), lowest cost
  (least utilization), with correct reason labels.
- Explain parity: strategy, credential label, and missing-provider reason.
- Non-streaming LLM failover: answer produced, exactly one ledger row, routing id attached,
  `cost_source = estimated`, success event, failover event.
- Streaming failover: second token retried, meta marks attempt 2, deltas concatenated, exactly one
  additional ledger row.
- Retry-After parsing: numeric value accepted, invalid value ignored.

### Live coverage (40 checks)

Settings switch to automatic, live Deepgram validation, credential registration/listing, masked prefix,
health probe timestamp, explain, live TTS (HTTP 200, 7993 bytes), routing event recording, success
latency, secret-free event trail, usage aggregates, estimated/billed separation, metadata patch and
persistence, disable/enable with validation, pool-managed voice state, disabled-pool blocking, failure
filter, purge, routing history retention after delete, usage 404 after delete, mode restoration, and
environment-key fallback after pool deletion.

### Browser coverage (36 checks)

Provider creation, reload persistence, invalid-token validation result (0 valid / 1 inactive), masked
prefix rendering, details/usage panel, metadata edit persistence, enable rejection with no UI flip,
delete with confirmation and reload, mobile viewport without overflow, and zero console errors.

## Behavioural notes

- **Pool precedence is absolute.** When a Deepgram pool exists but all its tokens are disabled,
  speech returns 502 instead of falling back to the environment key. The environment key is used again
  only after the pool is removed. This is intentional admin precedence, but operators should be told
  that an empty/disabled pool disables voice even when an environment key exists.
- **Failover is bounded.** Both streaming and non-streaming paths stop after 3 credentials per
  provider. A request never loops indefinitely, and each failed credential is excluded for that
  request before the next selection.
- **Billing rows are per successful answer.** Failover does not create duplicate ledger rows. Provider-
  side duplicate billing cannot be observed without real paid LLM credentials.
- **Budget checks are pre-flight.** They compare month-to-date spend at selection time. They do not
  reserve budget, so a burst of concurrent requests can overshoot the configured limit before the
  ledger is updated. This was not stress-tested with a real paid provider.
- **Cost estimates are labelled.** Estimated cost is computed locally; billed cost is a separate field
  and remains zero until provider invoices are imported. The UI does not present estimates as billed.

## Findings

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| A-01 | Low | Disabled/empty provider pool blocks the environment-key fallback | Document pool precedence in the admin UI, or add an explicit "fall back to environment key" option |
| A-02 | Low | Budget enforcement is not atomic under concurrency | Add a reservation or post-call reconciliation if hard budget caps are required |
| A-03 | Info | LLM failover validated at the HTTP boundary, not against real paid providers | Re-run the failover suite with at least two real LLM credentials |

## Limitations

- Deepgram was the only provider with a real credential. OpenAI, Anthropic, Gemini, OpenRouter, Jina,
  and Resend calls were simulated at the provider HTTP boundary.
- Token-validation correctness for non-Deepgram providers was not exercised against the live vendors.
- "Billed" cost accuracy depends on invoice import, which was not available in this environment.

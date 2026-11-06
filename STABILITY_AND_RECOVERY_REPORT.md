# Weirwise Stability and Recovery Report

Date: 2026-11-05
Scope: failure handling, bounded retries, degradation, data integrity, and recovery after load in the audited QA configuration.
Repositories: `weirwise-rag-platform` and `weirwise-rag-core`, both on `develop`.

This report describes what was exercised. It does not assign an RTO or RPO; no restart, failover or restore drill was performed at that level.

---

## 1. Failure-handling matrix

| Failure | Behavior | Recovery | Evidence |
|---|---|---|---|
| Login brute force | Sliding windows per account (5/15 min), per IP and global; 429 with `Retry-After` | Successful login clears failure counters; window expiry reopens access | Atomic test: 25 concurrent attempts → exactly 5 admitted; lockout and recovery tests |
| Anonymous widget flood | Per-IP (60/min chat, 240/min config) and per-deployment (600/min chat) limits | Automatic after window expiry; `Retry-After` returned | Live 245-request probe → 240×200, 5×429; chat 429 while other endpoints stayed 200 |
| Provider 429 | Credential enters `Retry-After`-bounded cooldown; next eligible credential is tried | Cooldown expiry; health recovery; explain endpoint does not auto-recover (gap) | Routing suite 38/38 |
| Provider auth failure | Credential excluded for the request; breaker can open after repeated failures | Breaker recovery / manual re-enable | Routing suite |
| Provider timeout | Classified as timeout; failover within the 3-attempt-per-provider cap | Next request selects a healthy credential | Routing suite |
| All providers unavailable | Request fails with a plain-language error; emergency stop blocks selection entirely | Admin action or cooldown expiry | Routing and admin suites |
| Redis not configured | Telemetry batches are accepted and dropped; one warning is logged | No impact on normal traffic; analytics unavailable | Code inspection and live backend log |
| Redis configured but unreachable | Telemetry returns 503; backpressure returns 429 | Retry after Redis recovers | Code inspection |
| Transient embedding 429/5xx | Ingestion retries within bounds; terminal failure state if exhausted | Document can be retried if failed | Core hardening tests; `6ae346a` |
| Worker restart mid-job | Claim-token fencing prevents double completion | Job is reclaimed or fails explicitly | Core tests (code-level) |
| Oversized upload | 413 and partial file removed | User can upload a smaller file | 4 KB vs 1 KB cap test; no `.upload-*` leftovers |
| Malformed binary upload | Rejected (signature/UTF-8) instead of indexing garbage | User receives a clear error | Core ingestion tests |
| Deleting a knowledge source | Core vectors, documents and physical files purged; platform rows removed | Irreversible by design | `test_security_and_lifecycle_hardening.py` |
| Publish with multiple deployment rows | Previously 500; fixed to select deterministically | Publishing succeeds | Platform fix `de740c9` |
| Widget from an untrusted origin | 403 before any conversation access | Allowed origin works | Origin/session tests |
| Production with default secret | Process refuses to start | Operator must set a strong secret | Startup validation test |
| Load safety thresholds | Campaign stops scheduling new requests on memory or p95 hazard | Health returns to normal immediately | Two auto-stops; recovery latency 5.5 ms |

## 2. Recovery evidence from the load campaign

| Check | Result |
|---|---|
| Health immediately after a 40-concurrency spike | `/health/live` 200, `/health/ready` 200 |
| Recovery request latency | 5.5 ms |
| Backend error log (`ERROR`/`CRITICAL`/`Traceback`) | 0 entries |
| SQLite integrity | `ok` |
| Row counts before/after | unchanged (users 5, workspaces 5, assistants 5, projects 6, documents 3) |
| Restart required | none |

The memory guard also proved fail-safe: two earlier attempts stopped before meaningful load when the configured floor was above available memory. The corrected relative floor allowed the full campaigns. Details are in `LOAD_AND_STRESS_TEST_REPORT.md`.

## 3. Test-suite state

```
weirwise-rag-platform: 74 passed, 12 skipped in 159.09s
weirwise-rag-core:     51 passed in 43.89s
```

The 12 platform skips are deliberate prerequisites and are reported as blocked coverage, not as passes:

- 11 WBI stream tests require a configured Redis instance. With Redis configured they are real integration tests; without it they would previously fail. They are now explicitly skipped with a reason.
- 1 live cross-repo test requires `RUN_LIVE_CORE_TESTS=1`, a provisioned Core PostgreSQL database and a reachable Jina provider. The provider returns HTTP 451 from this network.

Two test-only corrections were committed in this pass:

- `892277f` updates the publish-lifecycle assertion to the new plain-language readiness message.
- `0737cff` adds the explicit prerequisites above instead of letting environment-dependent tests fail indistinguishably from product regressions.

## 4. Not tested / blocked

| Area | Status | Reason |
|---|---|---|
| Process kill and cold restart under traffic | NOT TESTED | Requires a controlled restart drill; would interrupt the shared QA stack |
| Redis outage during live traffic | BLOCKED | No Redis instance in this environment |
| PostgreSQL primary failover | NOT TESTED | Single local PostgreSQL |
| Backup and restore | NOT TESTED | No backup target; QA data is disposable |
| Multi-worker state consistency | NOT TESTED | Routing/limits are per process without Redis |
| Disk-full behavior | NOT TESTED | Not safely reproducible on this host |
| Network partition / packet loss | NOT TESTED | Loopback only |
| Long soak (hours) | NOT TESTED | Campaign bounded to under a minute for host safety |
| Clock skew / token expiry edge cases | PARTIAL | Token rejection tested; time-skew behavior not |
| Billed-cost reconciliation | BLOCKED | No provider invoice access |

## 5. Observations for operators

- A disabled or empty provider pool blocks the environment-key fallback by design. Operators must be told this, or voice can appear broken despite a valid environment key.
- The public widget chat limit is per IP and per deployment; a shared corporate NAT can consume the per-IP allowance for many end users. The per-deployment limit is the primary backstop.
- Without Redis, rate limits and routing state are per process. Two workers each allow the full quota.
- The telemetry "accept and drop" behavior keeps customer traffic healthy but means analytics silently disappear when Redis is absent. The single warning is the only signal; monitoring should alert on it.

## 6. Conclusion

Failure handling is bounded and honest in the tested single-process configuration: no unbounded retries, no silent data corruption after stress, no failed requests at saturation, and explicit degradation for missing Redis. Recovery from load is immediate and data integrity holds. The untested areas — restart drills, Redis outages, database failover, backups and multi-worker consistency — are exactly the areas that matter for production operations, so this report does not support a production stability claim.

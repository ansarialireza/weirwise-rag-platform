# Weirwise Platform Optimization Report

Date: 2026-11-05
Repository: `weirwise-rag-platform`, branch `develop`
Commits covered: `863f334` (provider connection reuse), `0194339` (TTS warm-up), `97c0e48` (public rate limiting), `c8ccf24` (production secret fail-fast), `a02da44` (frontend provider scoping).
Environment: Platform API `127.0.0.1:8010` on an isolated QA SQLite database, Next.js production build on port 3000, Core on `8002`, WSL PostgreSQL 16. No Redis in this environment.

All work remains on `develop`. Nothing was merged, deployed, or force-pushed.

---

## 1. What was optimized and why

| Area | Problem | Change | Commit |
|---|---|---|---|
| LLM calls and failover | A new `httpx.AsyncClient` per attempt paid DNS/TCP/TLS setup again on every retry and every provider failover | One keep-alive client per event loop (`max_connections=40`, `max_keepalive_connections=20`, `keepalive_expiry=120 s`, connect 10 s / read 45 s / write 30 s / pool 10 s), reused across attempts and providers and closed on shutdown | `863f334` |
| TTS warm-up | The warm-up probe issued `GET /v1/speak`, which Deepgram rejects with 400, adding noise and not warming the speak path cleanly | Warm-up now sends `HEAD https://api.deepgram.com/` with the same pooled client, so the TLS connection is primed without an invalid request | `0194339` |
| Public widget traffic | Anonymous chat/config had no per-IP or per-deployment abuse control | Sliding-window limits: config 240/min per IP, chat 60/min per IP and 600/min per deployment, with `Retry-After` and a plain-language message | `97c0e48` |
| Rate-limiter memory | The limiter could grow without bound under many identifiers | Shared bounded store (20,000 keys) with time-based pruning; Redis Lua path stays atomic when Redis is configured | `97c0e48` |
| Production startup | A deployment could start with the public development JWT secret | Startup refuses production/staging when `SECRET_KEY` is the public default or shorter than 32 characters | `c8ccf24` |
| Telemetry without Redis | Every telemetry batch returned 503 when `REDIS_URL` was empty | Batches are accepted and dropped with one warning; a configured-but-unreachable Redis still returns 503, which is an honest failure | existing |
| Embed page payload | The embed route loaded the dashboard's auth, theme, i18n, telemetry and service-worker providers | Providers moved to a `(site)` route-group layout; `embed/` sits outside it and loads only the root layout | `a02da44` |

## 2. Frontend payload measurement

Measured with production builds in an isolated worktree, summing the gzip sizes of the JS chunks listed in the served embed HTML:

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Embed route initial JS (gzip) | 170,975 B | 148,163 B | **−22,812 B (−13.3%)** |
| Dashboard layout chunk | Loaded | Not loaded | removed |
| `template` chunk | Loaded | Not loaded | removed |
| Provider chunks (8,413 B + 4,328 B) | Loaded | Not loaded | removed |
| Auth refresh / telemetry calls from embed | Present | None observed | removed |

Browser verification of the embed page showed a clean console apart from a pre-existing `apple-mobile-web-app-capable` deprecation warning. The dashboard, admin, auth, pricing, blog and landing routes still load their providers through the `(site)` layout.

The recorded production build also reports 87.2 kB shared JS and 26.9 kB middleware; those figures come from `npm run build` and are not route-specific budgets. No CI performance budget is enforced yet.

## 3. Backend load evidence

Bounded progressive load against the Platform API (read-only endpoints plus login; QA SQLite; no vector queries):

| Scenario | Requests | Errors | Throughput | p95 |
|---|---:|---:|---:|---:|
| Progressive 2 → 5 → 10 → 10 concurrency | 3,000 | 0 | 88.2 req/s | 60 → 119 → 178 → 196 ms |
| Spike 20 → 30 → 40 concurrency | 2,357 | 0 | 90.7 req/s | 423 → 956 → 1,527 ms |

The spike run auto-stopped at its p95 guard (1,500 ms) during the 40-concurrency stage. Process RSS moved from 46.4 MB to 112.8 MB during the first run (+66.4 MB) and from 112.6 MB to 116.0 MB during the spike (+3.4 MB). Available system memory never fell below 1,124 MB against a 600 MB floor. Full stage tables and post-run checks are in `LOAD_AND_STRESS_TEST_REPORT.md`.

These numbers describe a single-process backend on SQLite. They are not a PostgreSQL or multi-worker capacity result.

## 4. Verification

```
cd weirwise-rag-platform
python -m pytest backend/tests -q
74 passed, 12 skipped in 159.09s

cd weirwise-rag-core
python -m pytest server/tests -q
51 passed in 43.89s
```

The 12 platform skips are explicit prerequisites, not passes: eleven require a configured Redis instance for WBI stream integration and one is the non-hermetic live Jina/PostgreSQL test, which now requires `RUN_LIVE_CORE_TESTS=1`. See `SECURITY_HARDENING_REPORT.md` and `STABILITY_AND_RECOVERY_REPORT.md` for the reason this distinction matters.

## 5. What was not measured

| Item | Status | Reason |
|---|---|---|
| LLM first-token latency before/after connection reuse | **NOT MEASURED** | Provider quota/failover conditions were not reproduced after `863f334`; the prior ~9.8 s failover figure is pre-change |
| TTS first-chunk latency after warm-up fix | **NOT MEASURED** | Voice end-to-end numbers predate `0194339` |
| Platform on PostgreSQL | **NOT TESTED** | QA runs on SQLite; platform models support PostgreSQL but no load run was performed against it |
| Multi-worker routing, budget and rate-limit correctness | **NOT TESTED** | Routing state and the in-process limiter live per process; Redis was unavailable |
| Route-level performance budget in CI | **NOT IMPLEMENTED** | Build sizes are recorded manually |
| Embed page inside a real third-party site | **NOT TESTED** | Verified in-product and at the API level with real origin/key |

## 6. Remaining work

1. Provision Redis, then verify the shared sliding-window limits and telemetry ingest under two or more workers.
2. Re-measure failover first-token latency with the pooled client and at least two real credentials.
3. Run the load campaign against PostgreSQL with a bounded pool and the same safety guards.
4. Add a CI budget for route-level JS and enforce it on the embed and dashboard entry points.
5. Reduce the admin bundle; it remains the largest route group and is loaded only for operators.

## 7. Conclusion

The Platform now reuses provider connections, warms TTS correctly, bounds anonymous traffic, fails fast on an insecure production secret, and no longer ships dashboard providers to third-party embeds. The embed payload reduction is measured (−13.3% gzip JS). Backend throughput is stable at ~90 req/s with zero errors and flat memory in the tested envelope. Claims about LLM failover latency and PostgreSQL capacity would be unsupported at this time and are explicitly left as remaining work.

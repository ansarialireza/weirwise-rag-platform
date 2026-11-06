# Weirwise Load and Stress Test Report

Date: 2026-11-05
Target: Platform API `http://127.0.0.1:8010` (single process, isolated QA SQLite database)
Host: Windows 10/11 x64, WSL PostgreSQL 16 + pgvector, no Redis, Node/Next.js build on port 3000
Load generator: closed-loop async workers (`httpx`), process/system memory sampling every 2 s (`psutil`)

No vector search, ingestion, LLM, STT or TTS calls were included in this campaign. The prior WSL exhaustion incident involved an expensive vector query; this campaign deliberately excluded it and used read-only HTTP endpoints.

---

## 1. Safety design

| Guard | Value |
|---|---|
| Concurrency model | Closed-loop workers; no unbounded queue or fan-out |
| Stages | Progressive: 2 → 5 → 10 → 10 (run A); 20 → 30 → 40 (run B) |
| Request cap | 3,000 (run A), 4,000 (run B) |
| Wall-clock cap | 75 s |
| Backend RSS growth cap | 150 MB |
| System available-memory floor | `max(600 MB, 45% of baseline)` |
| Error-rate stop | > 2% |
| p95 latency stop | > 1,500 ms |
| Data | Isolated QA database; read-only endpoints plus one login |
| Post-run checks | Health, recovery latency, backend log scan, SQLite integrity |

The harness stops scheduling new requests when any condition trips and reports the precise reason.

## 2. Run A — progressive ramp

Baseline: backend RSS 46.4 MB, system available 1,229.0 MB, floor 600 MB, login 132.2 ms.

| Concurrency | Elapsed | Requests | RPS | p50 | p95 | Errors | Status codes |
|---:|---:|---:|---:|---:|---:|---:|---|
| 2 | 6.06 s | 541 | 89.2 | 15.1 ms | 60.4 ms | 0 | 200×541 |
| 5 | 8.11 s | 658 | 81.1 | 56.9 ms | 119.4 ms | 0 | 200×658 |
| 10 | 10.09 s | 987 | 97.8 | 107.0 ms | 178.0 ms | 0 | 200×987 |
| 10 | 9.03 s | 814 | 90.1 | 121.4 ms | 196.2 ms | 0 | 200×814 |

Totals: 3,000 requests in 34.03 s, **88.2 req/s**, **0 errors**, all 200s.
Memory: peak RSS 112.8 MB (+66.4 MB from baseline), minimum available 1,126.4 MB.
Stop reason: `request_cap` (all stages completed).

The RSS increase is consistent with warm buffers, connection pools and per-request allocations; it did not approach the 150 MB growth cap.

## 3. Run B — higher-concurrency spike

Baseline: backend RSS 112.6 MB, system available 1,171.3 MB, floor 600 MB, login 178.2 ms.

| Concurrency | Elapsed | Requests | RPS | p50 | p95 | Errors | Status codes |
|---:|---:|---:|---:|---:|---:|---:|---|
| 20 | 8.22 s | 820 | 99.8 | 194.2 ms | 422.7 ms | 0 | 200×820 |
| 30 | 8.38 s | 744 | 88.8 | 228.1 ms | 955.5 ms | 0 | 200×744 |
| 40 | 8.48 s | 793 | 93.5 | 228.3 ms | **1,527.1 ms** | 0 | 200×793 |

Totals: 2,357 requests in 26.0 s, **90.7 req/s**, **0 errors**, all 200s.
Memory: peak RSS 116.0 MB (+3.4 MB), minimum available 1,124.7 MB.
Stop reason: `p95_1527ms` — the p95 guard fired during the 40-concurrency stage.

Throughput plateaued around 90–100 req/s from 20 to 40 concurrent clients while latency rose sharply, which is the expected saturation signature of a single-process backend on SQLite. No request failed, including at saturation; the guard stopped the run before latency degraded further.

## 4. Guard validation (earlier attempts)

Two earlier attempts used a fixed 1,500 MB available-memory floor while the host had only ~1,086–1,144 MB free. Both auto-stopped immediately:

| Attempt | Baseline available | Requests | Errors | Stop reason |
|---|---:|---:|---:|---|
| 1 | 1,144 MB | 325 | 0 | `available_memory_1104MB` |
| 2 | 1,086 MB | 485 | 0 | `available_memory_1083MB` |

Those runs applied little load, but they demonstrate that the memory guard stops the campaign rather than pushing the host into pressure. The floor was then corrected to the relative formula above (600 MB minimum) and the two full campaigns completed.

## 5. Post-run verification

| Check | Result |
|---|---|
| `/health/live` | 200 |
| `/health/ready` | 200 |
| Recovery latency immediately after the spike | 5.5 ms |
| Backend log scan (`ERROR`, `CRITICAL`, `Traceback`) | 0 matches |
| SQLite `PRAGMA integrity_check` | `ok` |
| SQLite row counts | users 5, workspaces 5, assistants 5, projects 6, documents 3 (unchanged) |
| Process restarts required | None |

## 6. What this campaign does not prove

| Area | Status | Reason |
|---|---|---|
| PostgreSQL capacity | NOT TESTED | Platform QA uses SQLite; PostgreSQL is the intended production store |
| Multi-worker / multi-replica | NOT TESTED | Routing state and rate limits are per process without Redis |
| Redis-backed limits and telemetry under load | NOT TESTED | No Redis in this environment |
| Vector retrieval under load | NOT RUN | Deliberately excluded after the prior resource-exhaustion incident |
| Ingestion throughput under load | NOT RUN | Requires real embedding quota |
| LLM / voice load | NOT RUN | Provider cost and quota; functional timing is covered separately |
| Soak duration | NOT RUN | Runs lasted 26–34 s, not hours |
| Network impairment / failover | NOT TESTED | Loopback only |
| Host isolation | PARTIAL | Shared Windows host with WSL; memory readings include unrelated activity |

## 7. Conclusion

Within the tested envelope the Platform is stable: ~90 req/s, zero errors, bounded and essentially flat memory, fast recovery, and intact data. The saturation point for this single-process/SQLite configuration is near 40 concurrent clients, where p95 crosses 1.5 s while p50 remains ~228 ms. The safety harness proved it can stop a campaign on both memory and latency hazards.

These results support a stability statement for the QA configuration only. They do not establish PostgreSQL or multi-worker capacity, and no soak claim is made.

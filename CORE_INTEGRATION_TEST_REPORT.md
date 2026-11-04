# Core Integration Test Report

Date: 2026-11-04
Platform: `weirwise-rag-platform` @ `develop`
Core: `weirwise-rag-core` (FastAPI, PostgreSQL 16 + pgvector)

## Environment

| Component | Value |
|---|---|
| Platform API | `127.0.0.1:8010`, QA SQLite DB |
| Core API | `127.0.0.1:8002`, `X-API-Key` auth |
| Core database | PostgreSQL 16 + pgvector, database `weirwise_test`, container `weirwise-db` |
| Embedding provider | Jina configured, but returns HTTP 451 from this network |
| Embedding fallback | Deterministic SHA-256 pseudo-embeddings, 1536 dimensions |
| Test data | 5 curated documents + 100 generated documents + 1 restart probe |

No mocks were used on the Platform → Core path. Every ingestion, search, chat, and delete below went
through the real Platform API, the real Core HTTP API, and real PostgreSQL/pgvector.

## Ingestion

| Check | Result |
|---|---|
| Platform source → Core knowledge base creation | Pass (`core_kb_id` returned) |
| Single document ingestion | Pass, 1.25 s, status `ready` |
| Chunk creation | Pass, chunk stored with `vector_dims = [1536]`, `has_vector = true` |
| 5 curated documents | Pass, 0.69 s total |
| 100 generated documents | Pass, 4.47 s total, 0 failures |
| Upload request latency (100 docs) | avg 1707.6 ms, p50 1621.8 ms, p95 2546.1 ms, p99 2620.3 ms, max 2639.2 ms |
| Chunk count after bulk ingest | 105 chunks, all 1536-dimensional |

The source status briefly reads `failed` while the asynchronous Core ingestion job is still running,
then resolves to `ready`. The ingestion itself completed successfully in 1.25 s, but the transient
status is confusing to API consumers and should be reconciled with the job state.

## Retrieval

Curated corpus: 5 documents, one query per document, `top_k = 3`.

| Metric | Value |
|---|---:|
| Recall@3 | 3/5 (0.60) |
| Precision@1 | 1/5 (0.20) |
| MRR | 0.40 |
| Search latency (n = 5) | avg 119.7 ms, p50 117.8 ms, p95 127.4 ms |

**These numbers are not a usable retrieval-quality signal.** Because Jina returns HTTP 451, every
vector in this environment is a deterministic pseudo-embedding. Similarity scores ranged from 0.0033
to 0.0254, and cosine similarity carries no semantics for these vectors. The metrics prove that the
retrieval plumbing (query embedding → pgvector search → ranking → response) works; they do not
measure model quality.

A direct demonstration of the limitation: the query *"How long does shipping take?"* returned the
Zephyr-9 satellite maintenance document as rank 1 with score 0.0202 and the answer was flagged
`is_grounded = true`. There is no relevance threshold distinguishing "retrieved" from "relevant", so
the grounding flag must not be treated as a correctness check. With real embeddings this should be
re-validated, and a minimum-score gate should be added before marking an answer grounded.

### Grounded answer behaviour

| Probe | Result | Latency |
|---|---|---:|
| Refund policy question | Grounded answer with 2 citations; top citation `handbook.md` score 0.0184 | 178 ms |
| Maintenance override question | Grounded answer with 2 citations | 196 ms |
| Streaming chat | SSE `meta` then `done`; 472 characters, 2 sources | 165 ms |
| Absent answer ("Who won the 2018 FIFA World Cup final?") | Correctly refused: "I could not find that in the handbook."; no citations; `is_grounded = false` | 113 ms |

Citation payloads contain document name, rank, score, and excerpt. The absent-answer refusal is the
strongest evidence that the grounding guard path executes, even though the true-positive path is
weakened by pseudo-embeddings.

## Load and concurrency

| Scenario | Result |
|---|---|
| 100 concurrent searches | avg 971.5 ms, p50 1000.8 ms, p95 1101.6 ms, p99 1127.1 ms, max 1140.1 ms; 0 errors; 5.57 s wall |
| 100 document upload + ingest | 0 failed; 4.47 s ingest total |
| Bulk delete of 100 documents | 3.9 s, 0 errors |
| Chunks remaining after bulk delete | 5 (the curated set, as expected) |
| Delete knowledge base | HTTP 204, 0 chunks remaining |
| Concurrent chat sessions | Not measured; chat is assistant-scoped and the generic chat probe was skipped |

100 concurrent searches against a 105-chunk corpus is a light load. The ~1 s latency is dominated by
the Core search endpoint and the single-worker PostgreSQL container, not by result size. No errors or
timeouts were observed.

## Deletion and cleanup

- Platform source delete returned 200; the source disappeared from the listing.
- Core reported 0 chunks for the deleted document and `404` for the Core document.
- Knowledge-base delete returned 204 and left 0 chunks in the test database.
- No orphaned vectors were found after the 100-document bulk delete.

## Test suites

| Suite | Result | Notes |
|---|---|---|
| Core pytest | 39/41 | Both failures are `test_jina_*` integration tests failing on external HTTP 451 |
| Platform pytest | 70/71 | One failure, `test_live_platform_to_core_jina_integration`, external HTTP 451 |
| Platform → Core live E2E probe | Pass | Ingestion, search, chat, SSE, delete |

## Findings

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| C-01 | Blocker for quality claims | Real embeddings unavailable (HTTP 451); all vectors are pseudo-embeddings | Configure a reachable embedding provider before publishing retrieval-quality numbers |
| C-02 | Medium | `is_grounded` is true for irrelevant retrievals; no relevance threshold | Require a minimum similarity/reranker score before grounding; return the refusal path otherwise |
| C-03 | Low | Source status transiently reports `failed` during async ingestion | Report `processing` until the Core job reaches a terminal state |

## Limitations

- Retrieval quality (Recall@K, Precision@K, MRR, hallucination rate) cannot be validated in this
  environment because the only configured embedding provider is blocked.
- LLM answers are extractive fallbacks, so answer fluency and hallucination were not measured against
  a real generative model.
- Concurrent chat, concurrent ingestion of distinct sources, and files larger than the generated
  corpus were not exercised.
- The Core database was a test database; no production data was read or modified.

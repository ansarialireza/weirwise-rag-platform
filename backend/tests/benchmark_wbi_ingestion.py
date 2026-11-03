"""High-throughput stress-testing and latency benchmark for WBI Redis Streams Ingestion."""

import asyncio
import statistics
import time
import uuid
from datetime import UTC, datetime

import httpx

API_URL = "http://127.0.0.1:8000/api/v1/telemetry/events:batch"
TOTAL_BATCHES = 100
BATCH_SIZE = 25  # 25 events per request -> 2,500 total events
CONCURRENCY = 10


def generate_batch_payload(batch_idx: int) -> dict:
    session_id = f"bench_sess_{batch_idx % 20}_{uuid.uuid4().hex[:6]}"
    events = []
    for i in range(BATCH_SIZE):
        events.append(
            {
                "event_id": str(uuid.uuid4()),
                "category": "workflow",
                "event_name": "benchmark.action.stress",
                "component_id": f"btn-bench-{i}",
                "route": "/workspaces/bench/projects/test",
                "duration_ms": 120,
                "timestamp": datetime.now(UTC).isoformat(),
                "properties": {"batch_idx": batch_idx, "item_idx": i},
                "schema_version": "1.0",
            }
        )
    return {
        "session_id": session_id,
        "device_context": {
            "device_category": "desktop",
            "operating_system": "Linux",
            "browser": "Chrome",
            "screen_width": 2560,
            "screen_height": 1440,
            "access_environment": "web_app",
        },
        "geographic_context": {
            "country_code": "DE",
            "country_name": "Germany",
            "timezone": "Europe/Berlin",
        },
        "events": events,
    }


async def worker(queue: asyncio.Queue, latencies: list, status_codes: list):
    async with httpx.AsyncClient(timeout=10.0) as client:
        while not queue.empty():
            payload = await queue.get()
            t0 = time.perf_counter()
            try:
                resp = await client.post(API_URL, json=payload)
                t1 = time.perf_counter()
                latencies.append((t1 - t0) * 1000.0)
                status_codes.append(resp.status_code)
            except Exception:
                status_codes.append(500)
            finally:
                queue.task_done()


async def run_benchmark():
    total_events = TOTAL_BATCHES * BATCH_SIZE
    print(f"Starting WBI Ingestion Benchmark: {TOTAL_BATCHES} batches of {BATCH_SIZE} events ({total_events} events)")
    print(f"Target concurrency: {CONCURRENCY} workers")

    queue = asyncio.Queue()
    for i in range(TOTAL_BATCHES):
        queue.put_nowait(generate_batch_payload(i))

    latencies = []
    status_codes = []

    start_time = time.perf_counter()
    workers = [asyncio.create_task(worker(queue, latencies, status_codes)) for _ in range(CONCURRENCY)]
    await queue.join()
    for w in workers:
        w.cancel()
    total_time = time.perf_counter() - start_time

    success_count = sum(1 for c in status_codes if c == 202)
    total_events = success_count * BATCH_SIZE
    throughput_events_sec = total_events / total_time
    throughput_batches_sec = success_count / total_time

    latencies.sort()
    p50 = statistics.median(latencies)
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0
    p99 = latencies[int(len(latencies) * 0.99)] if latencies else 0

    print("\n--- BENCHMARK RESULTS ---")
    print(f"Total Time: {total_time:.3f} s")
    print(f"Successful Batches: {success_count}/{TOTAL_BATCHES} (HTTP 202)")
    print(f"Total Ingested Events: {total_events}")
    print(f"Throughput (Events/sec): {throughput_events_sec:.1f} events/sec")
    print(f"Throughput (Batches/sec): {throughput_batches_sec:.1f} batches/sec")
    print(f"Latency P50: {p50:.2f} ms")
    print(f"Latency P95: {p95:.2f} ms")
    print(f"Latency P99: {p99:.2f} ms")


if __name__ == "__main__":
    asyncio.run(run_benchmark())

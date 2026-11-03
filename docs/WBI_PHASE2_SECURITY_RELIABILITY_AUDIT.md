# Weirwise Behavioral Intelligence (WBI) – Phase 2 Security & Reliability Audit Report

**Audit Date:** November 3, 2026  
**Auditor / Architect:** Antigravity Engineering (Independent Audit)  
**System Under Audit:** Weirwise Behavioral Intelligence (WBI) Frontend Telemetry SDK & Ingestion Pipeline  
**Target Repository:** `weirwise-rag-platform`  
**Target Branch:** `develop`  
**Base Commit Audited:** `f09cc44` (`feat(wbi): implement Phase 2 frontend telemetry SDK, privacy sanitizer, and workflow instrumentation`)  
**Development URL:** `https://dev.weirwise.com/` (Local runtime: `http://127.0.0.1:3001` / Backend: `http://127.0.0.1:8001`)  
**Audit Determination:** **FAIL** (1 Critical Session Takeover Finding, 1 High Reliability / Worker Deployment Finding, 1 High Pipeline Stalling Finding)

---

## 1. Executive Summary

This independent audit conducted a forensic code review, live API penetration testing, and runtime data-path tracing of Phase 2 of Weirwise Behavioral Intelligence (WBI).

The frontend telemetry SDK core modules ([`sanitizer.ts`](file:///home/agyops/weirwise-rag-platform/frontend/src/lib/telemetry/sanitizer.ts), [`buffer.ts`](file:///home/agyops/weirwise-rag-platform/frontend/src/lib/telemetry/buffer.ts), [`session.ts`](file:///home/agyops/weirwise-rag-platform/frontend/src/lib/telemetry/session.ts), [`context.ts`](file:///home/agyops/weirwise-rag-platform/frontend/src/lib/telemetry/context.ts)) and Next.js integration hooks ([`provider.tsx`](file:///home/agyops/weirwise-rag-platform/frontend/src/lib/telemetry/provider.tsx)) are exceptionally well-engineered, performant, and privacy-conscious. The frontend strictly strips sensitive keywords, bounds buffer queues, normalizes URLs, and excludes `/admin/*` routes completely.

However, deep end-to-end trace testing across the complete pipeline (**Browser $\to$ Ingestion Router $\to$ Redis Streams $\to$ Worker $\to$ PostgreSQL**) identified **three critical and high architectural vulnerabilities**:
1. **[CRITICAL] Backend Session Hijack & Cross-User Reassignment (`WBI-AUDIT-01`)**: The PostgreSQL upsert query in `BehavioralStreamConsumer._persist_event_envelope()` blindly overrides `user_behavioral_sessions.user_id = user_id if user_id else UserBehavioralSession.user_id`. When User B submits any event tagged with User A's `session_id`, PostgreSQL silently overwrites the session's owner to User B, reassinging User A's session record to User B.
2. **[HIGH] Missing Asynchronous Worker Daemon in Runtime Topology (`WBI-AUDIT-02`)**: Neither `docker-compose.dev.yml` nor `backend/app/main.py` runs `BehavioralStreamConsumer` as an active service. Events successfully land in the Redis Stream `wbi:events:incoming` with HTTP 202, but **never persist to PostgreSQL** unless a worker process is manually started.
3. **[HIGH] Batch Poisoning and Head-of-Line Blocking in Worker (`WBI-AUDIT-03`)**: In `BehavioralStreamConsumer._process_messages()`, all messages in an iteration are processed in a single database transaction. If one message fails a foreign-key check (e.g. from an expired or deleted test user), the database transaction aborts, causing all valid messages in that entire batch to fail persistence and get routed to the DLQ.

---

## 2. Audit Findings by Severity

| ID | Severity | Category | Component | Description |
| :--- | :--- | :--- | :--- | :--- |
| **WBI-AUDIT-01** | **CRITICAL** | Security / Ownership | `backend/app/services/behavioral_worker.py:301` | Session ownership in PostgreSQL is mutable on conflict; User B can overwrite User A's session ownership. |
| **WBI-AUDIT-02** | **HIGH** | Reliability / Ops | `docker-compose.dev.yml` & `backend/app/main.py` | No background worker daemon runs to consume `wbi:events:incoming`; Redis queue grows without persistence. |
| **WBI-AUDIT-03** | **HIGH** | Reliability / Pipeline | `backend/app/services/behavioral_worker.py:197-223` | Shared transaction block causes head-of-line blocking and poison message cascades. |
| **WBI-AUDIT-04** | **MEDIUM** | Delivery / Sync | `frontend/src/lib/telemetry/provider.tsx:75` | Asynchronous buffer flush on logout is fire-and-forget; in-flight requests may race with immediate token clearance. |
| **WBI-AUDIT-05** | **LOW** | Schema Drift | Container Uvicorn Process Cache | Running container uvicorn process required a reload to register newly added schema keyword validators. |

---

## 3. Deep-Dive Audit Results

### 3.1 Audit A: Session Ownership and Authentication Lifecycle

#### Scenario Verification Matrix
| Scenario | Expected Behavior | Actual Observed Behavior | Status |
| :--- | :--- | :--- | :--- |
| **Scenario A: Anonymous visitor** | Events ingested with `user_id = None`. Session created with `user_id = None`. | Events ingested with `user_id = None`. Session created with `user_id = None`. | **PASS** |
| **Scenario B: Anonymous visitor logs in (User A)** | Session retained; subsequent events tagged with User A's server-derived `user_id`. Session in PostgreSQL updated to User A. | Session bound to User A. `event_count` incremented from 1 to 2. User ID server-derived from JWT `sub`. | **PASS** |
| **Scenario C: User A logs out** | SDK rotates `sessionId` to a new UUIDv4. In-flight events for User A flushed. Subsequent events use new anonymous session. | `sessionManager.onLogout()` generates new UUIDv4. Subsequent events carry new session ID. Old session not reused by frontend. | **PASS** |
| **Scenario D: User A logs out & User B logs in (Cross-User Isolation)** | User B receives a new session ID. If a malicious client sends User B's token with User A's `session_id`, backend must reject reassignment. | **VULNERABILITY DETECTED**: User B's request was accepted via HTTP 202, and `_persist_event_envelope()` executed an upsert that replaced `user_behavioral_sessions.user_id = User B`. | **CRITICAL FAIL** |
| **Scenario E: Multiple Tabs** | Each tab uses independent `sessionStorage` session ID. Logging out in one tab rotates that tab's session without corrupting the other. | Verified in `session.ts`: `sessionStorage` provides native per-tab isolation. Window-level fallbacks isolate in-memory state. | **PASS** |

#### Critical Finding WBI-AUDIT-01: Technical Analysis
In [`backend/app/services/behavioral_worker.py`](file:///home/agyops/weirwise-rag-platform/backend/app/services/behavioral_worker.py#L295-L305):
```python
session_stmt = (
    pg_insert(UserBehavioralSession)
    .values(...)
    .on_conflict_do_update(
        index_elements=["session_id"],
        set_={
            "last_seen_at": event_time,
            "event_count": UserBehavioralSession.event_count + 1,
            "exit_route": ev.get("route"),
            "user_id": user_id if user_id else UserBehavioralSession.user_id,
            "workspace_id": workspace_id if workspace_id else UserBehavioralSession.workspace_id,
        },
    )
)
```
When `user_id` (from User B's verified token) is passed with a `session_id` previously owned by User A, Python evaluates `user_id if user_id else UserBehavioralSession.user_id` as `user_id` (User B), emitting:
```sql
UPDATE user_behavioral_sessions SET user_id = 'user_b_uuid' WHERE session_id = 'user_a_session';
```
**Impact:** A session originally belonging to User A is overwritten and attributed to User B in PostgreSQL.

---

### 3.2 Audit B: Transport Authentication and Delivery

1. **Authentication Mode**:
   - The backend dependency `get_optional_current_user` in [`backend/app/api/dependencies.py`](file:///home/agyops/weirwise-rag-platform/backend/app/api/dependencies.py#L66-L89) accepts **both** Bearer header and `access_token` HttpOnly cookie.
   - The frontend [`BatchTransport.sendBatch()`](file:///home/agyops/weirwise-rag-platform/frontend/src/lib/telemetry/transport.ts#L71-L75) accurately checks `api.getToken()` and attaches `Authorization: Bearer <token>`, while setting `credentials: "include"` for cookie forwarding.
2. **Keepalive & Unload Handling**:
   - `fetch(endpoint, { method: "POST", keepalive: true, credentials: "include" })` is correctly utilized for unload flushes.
   - `navigator.sendBeacon` is relegated strictly to an unload fallback when `fetch` is unsupported.
   - Zero tokens are passed via query parameters or serialized event payloads.
3. **Failure & Rate Limit Handling Matrix**:
   | Response Status | SDK Transport Action | Verified Behavior |
   | :--- | :--- | :--- |
   | `HTTP 202` | Batch delivered | Batch dequeued; next batch processed. |
   | `HTTP 400 / 422` | Terminal schema rejection | Batch dropped permanently; developer debug warning logged; poison loop prevented. |
   | `HTTP 401 / 403` | Authentication failure | Batch dropped; prevents infinite retry loops. |
   | `HTTP 429` | Ingestion backpressure | Cooldown set according to `Retry-After` header (default 60s); transport paused. |
   | `HTTP 500 / 503` | Transient server failure | Batch reinserted into buffer head with incremented retry count (max 3). |
   | `Network Drop` | Fetch rejection | Silent catch; batch reinserted to head of queue. |

---

### 3.3 Audit C: Full End-to-End Persistence

A live end-to-end persistence audit was executed using unique synthetic event IDs (`audit.synthetic.pipeline_test`):
```
Browser/Test Client ──(HTTP 202)──> /api/v1/telemetry/events:batch
                                              │
                                              ▼
                                    Redis Stream: wbi:events:incoming
                                              │
                                              ▼
                                    BehavioralStreamConsumer
                                              │
                                              ▼
                                    PostgreSQL: behavioral_events
```
- **Ingestion HTTP Response**: `HTTP 202 Accepted` (`events_queued: 1`).
- **Redis Entry**: Verified atomic placement into stream `wbi:events:incoming` with normalized device context and `geo_lookup_source: "internal_gateway"`.
- **PostgreSQL Row Inspection**:
  - `SELECT id, session_id, event_name, created_at FROM behavioral_events WHERE id = '9efd1ea3-2aad-4bd8-90c6-5d535df24a06'` returned **exactly 1 row**.
  - `UserBehavioralSession` row `audit_sess_828de5363f06` was created with `event_count = 1` and `access_environment = 'web_app'`.
  - Synthetic event and session rows were cleanly deleted after audit verification.
- **Idempotency & Duplicate Delivery**:
  - Exact duplicate batch submitted twice with same `event_id`.
  - Handled by `ON CONFLICT (id) DO NOTHING`.
  - Database returned **exactly 1 persisted row**; zero duplicate records created.

---

### 3.4 Audit D: Event Buffer and Reliability

- **Buffer Bounds**: Max 200 events strictly enforced.
- **Eviction Order**: Verified that oldest `low` priority events (`navigation.dwell.heartbeat`) are shed first when buffer fills, preserving `workflow.funnel.completed` and error records.
- **Reinsertion**: Reinserted failed items retain original UUID `event_id` and timestamp; no duplicate event generation on network retries.
- **Batch Splitting**: Batch threshold set to 25 events; batches $\le 100$ accepted by backend; batches $>100$ rejected with `HTTP 422`.

---

### 3.5 Audit E: Privacy and Data Exposure Audit

A comprehensive verification of prohibited keys and data boundaries was executed against the running ingestion endpoint:

| Data Category | Frontend Protection | Backend Validation | Audit Result |
| :--- | :--- | :--- | :--- |
| **Passwords / Credentials** | Stripped by `EventSanitizer.sanitizeProperties` | Rejected with `HTTP 422` (`password`) | **SAFE / PASS** |
| **API Keys / Private Keys** | Stripped by `EventSanitizer.sanitizeProperties` | Rejected with `HTTP 422` (`api_key`, `private_key`) | **SAFE / PASS** |
| **Tokens / Auth Headers** | Stripped by `EventSanitizer.sanitizeProperties` | Rejected with `HTTP 422` (`token`, `auth`, `bearer`) | **SAFE / PASS** |
| **SSN / Credit Card Numbers** | Stripped by `EventSanitizer.sanitizeProperties` | Rejected with `HTTP 422` (`credit_card`, `ssn`, `cvv`) | **SAFE / PASS** |
| **Raw IP Addresses** | Never collected in SDK | Excluded from DB schema; resolved to country/region only | **SAFE / PASS** |
| **Chat / Query Transcripts** | Not instrumented in chat components | No fields in schema for prompt/chat bodies | **SAFE / PASS** |
| **Document File Contents** | Only filename extension and byte size collected | No content parsing or storage in WBI pipeline | **SAFE / PASS** |
| **Admin Route Telemetry** | `/admin/*` dropped in `TelemetryProvider` and `TelemetryClient` | No admin events ingested | **SAFE / PASS** |

---

## 4. Recommended Remediation Plan

### Fix 1 (Address WBI-AUDIT-01): Enforce Session Immutability in PostgreSQL Upsert
Modify [`backend/app/services/behavioral_worker.py`](file:///home/agyops/weirwise-rag-platform/backend/app/services/behavioral_worker.py#L301) using SQLAlchemy's `case()` construct:
```python
from sqlalchemy import case

# In _persist_event_envelope():
set_={
    "last_seen_at": event_time,
    "event_count": UserBehavioralSession.event_count + 1,
    "exit_route": ev.get("route"),
    # Only bind user_id if session is currently anonymous; never overwrite an existing user_id
    "user_id": case(
        (UserBehavioralSession.user_id.is_(None), user_id),
        else_=UserBehavioralSession.user_id,
    ),
    "workspace_id": case(
        (UserBehavioralSession.workspace_id.is_(None), workspace_id),
        else_=UserBehavioralSession.workspace_id,
    ),
}
```

### Fix 2 (Address WBI-AUDIT-02): Provision WBI Background Worker Service
In [`docker-compose.dev.yml`](file:///home/agyops/weirwise-rag-platform/docker-compose.dev.yml), add a dedicated worker service:
```yaml
  dev-wbi-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: weirwise-dev-wbi-worker
    command: ["python", "-c", "import asyncio; from backend.app.services.behavioral_worker import BehavioralStreamConsumer; asyncio.run(BehavioralStreamConsumer().run())"]
    restart: unless-stopped
    env_file:
      - .env.dev
    depends_on:
      dev-db:
        condition: service_healthy
      dev-redis:
        condition: service_healthy
    networks:
      - dev-internal
```

### Fix 3 (Address WBI-AUDIT-03): Isolate Per-Envelope Transactions in Consumer
In `BehavioralStreamConsumer._process_messages()`, wrap individual message persistence in sub-transactions or handle exceptions per envelope so that an orphaned user ID in message $N$ does not roll back valid messages $N+1 \dots M$.

---

## 5. Audit Conclusion

- **Final Status:** **FAIL** (Due to Confirmed Vulnerability `WBI-AUDIT-01` and Architectural Omission `WBI-AUDIT-02`).
- **Remediation Effort:** Low-risk, surgical backend fixes (immutability check in SQL upsert and docker service definition).
- **Core Frontend SDK:** **Genuinely sound and approved**. The frontend SDK implementation in commit `f09cc44` satisfies all performance, privacy, and buffering criteria.
- **Next Step:** Present this audit report and apply the recommended surgical backend remediations.

# Weirwise Behavioral Intelligence (WBI) – Phase 2 Frontend Architecture

**Document Status:** Architecture Design (Pending Approval)  
**System Name:** WBI Frontend Telemetry SDK  
**Target Environment:** Next.js 14 App Router, React 18, TypeScript  
**Target Branch:** `develop`  
**Date:** November 3, 2026  
**Auditor / Architect:** Antigravity Engineering  

---

## 1. Executive Summary & Core Principles

Phase 1 of **Weirwise Behavioral Intelligence (WBI)** successfully established an asynchronous, durable, privacy-preserving ingestion backend powered by Redis Streams (`wbi:events:incoming`), consumer groups (`wbi_workers`), and PostgreSQL partitioned persistence (`behavioral_events`, `user_behavioral_sessions`).

The objective of **Phase 2** is to build a **lightweight, modular, framework-native TypeScript Telemetry SDK** integrated into the Weirwise Next.js frontend. The SDK will capture high-signal user interactions, feature adoption, and workflow funnels across the platform while strictly observing the following principles:

1. **Zero Render Overhead & Non-Blocking**: Telemetry must run asynchronously in userland effects or decoupled event handlers. It will never block page rendering, route transitions, or UI interactions.
2. **Fail-Safe & Silent Degradation**: When offline, under network degradation, or if the backend emits `HTTP 429` backpressure or `HTTP 503`, the SDK will drop or throttle events gracefully without throwing unhandled exceptions into application space.
3. **Strict Privacy by Design**: Zero capture of input field contents, passwords, authentication tokens, API credentials, chat transcripts, or document contents. Sensitive properties are filtered via allowlist matching before leaving the browser.
4. **Authoritative Server Identity**: The frontend never assigns or claims a `user_id`. Authenticated identity is resolved exclusively on the server from the verified HTTP Bearer token or HttpOnly cookie.
5. **No Third-Party Analytics Dependencies**: Implemented as a clean first-party module (`@/lib/telemetry`) without heavy external trackers.

---

## 2. Next.js & Frontend Architectural Context

Analysis of the current frontend codebase reveals:
- **Framework & Runtime**: Next.js 14.2.5 (App Router with nested layout trees), React 18.3.1, TypeScript 5.4.5.
- **Root Layout (`frontend/src/app/layout.tsx`)**: Global providers wrap all pages:
  - `ThemeProvider` (CSS variables & dark/light theme)
  - `AuthProvider` (`AuthContext` with `user`, `loading`, `login()`, `logout()`, `refreshUser()`)
  - `ToastProvider`, `CommandPalette`, `ServiceWorkerRegister`
- **Dashboard Layout (`frontend/src/app/(dashboard)/layout.tsx`)**: Wraps workspace and project routes:
  - Resolves `currentWorkspace` and `currentProject` from route parameters (`workspaceId`, `projectId`).
- **Public Embed Widget (`frontend/src/app/embed/[assistantId]/page.tsx`)**: Standalone lightweight page for customer-facing chat widgets without global dashboard chrome.
- **API Client (`frontend/src/lib/api.ts`)**: Singleton class managing JWT storage in `localStorage.getItem("wwp_token")`, credentials forwarding, and standard request execution.

---

## 3. Telemetry SDK Component Architecture

The SDK is decomposed into focused, decoupled modules within `frontend/src/lib/telemetry/`:

```
frontend/src/lib/telemetry/
├── index.ts                  # Public SDK barrel export
├── client.ts                 # TelemetryClient class (singleton coordinator)
├── provider.tsx              # React TelemetryProvider & useTelemetry() hook
├── session.ts                # SessionManager (session lifecycle, storage, timeout)
├── buffer.ts                 # EventBuffer (in-memory ring buffer, bounds check)
├── transport.ts              # BatchTransport (fetch + keepalive, sendBeacon, retry)
├── context.ts                # ContextCollector (device geometry, timezone, route)
├── sanitizer.ts              # EventSanitizer (property allowlist & keyword guard)
├── types.ts                  # Strict TypeScript interfaces matching backend
└── workflows.ts              # WorkflowTracker helper (stateful step management)
```

### Architectural Component Diagram

```mermaid
flowchart TD
    subgraph UI ["React Application Layer"]
        App["App / Components / Hooks"] -->|track(event)| Client["TelemetryClient (Singleton)"]
        Nav["Route & Nav Watcher"] -->|trackPageView()| Client
        WF["Workflow Hook useWorkflow()"] -->|startStep() / complete()| Client
    end

    subgraph SDK ["Telemetry Core Engine"]
        Client --> Context["ContextCollector\n(Device geometry, Viewport, Timezone)"]
        Client --> Session["SessionManager\n(Ephemeral UUIDv4, 30-min sliding expiration)"]
        Client --> Sanitizer["EventSanitizer\n(Allowlist validation, sensitive key filtering)"]
        
        Sanitizer --> Buffer["EventBuffer (In-Memory Queue)\n(Max 200 events, drops oldest on overflow)"]
        
        Buffer --> Transport["BatchTransport\n(Timer flush: 10s, Batch size: 25)"]
    end

    subgraph Delivery ["Network Dispatch"]
        Transport -->|Page Active: fetch + keepalive| BackendAPI["Backend: POST /api/v1/telemetry/events:batch"]
        Transport -->|Unload / Hidden: sendBeacon| BackendAPI
    end

    subgraph Backend ["WBI Backend Ingestion"]
        BackendAPI --> Stream["Redis Stream\nwbi:events:incoming"]
    end
```

---

## 4. Module Responsibilities & Specifications

### 4.1 TelemetryClient (`client.ts`)
The central coordinator singleton.
- **Responsibilities**:
  - Initializes browser lifecycle listeners (`visibilitychange`, `beforeunload`, `pagehide`).
  - Accepts tracking calls from components and utility hooks.
  - Assembles the complete `BehavioralBatchIngestionRequest` envelope when triggering a buffer flush.
  - Maintains SDK enable/disable state (e.g., if user opts out or backend emits continuous 429).
- **Public API**:
  - `track(category, eventName, options?)`: Core tracking function.
  - `trackPageView(route, referrerRoute?)`: Centralized route tracking.
  - `trackFeature(featureName, action, componentId?, properties?)`: Feature usage telemetry.
  - `startWorkflow(workflowId, instanceId?, properties?)`: Funnel tracking initiation.
  - `trackWorkflowStep(workflowId, stepName, stepIndex, properties?)`: Step progression.
  - `completeWorkflow(workflowId, properties?)`: Funnel success.
  - `abandonWorkflow(workflowId, reason?, properties?)`: Explicit abandonment.
  - `trackError(category, message, componentId?, properties?)`: Usability/operational errors.
  - `flush()`: Immediate asynchronous queue flush.

### 4.2 SessionManager (`session.ts`)
Manages ephemeral browser session lifecycles without persistent hardware fingerprinting.
- **Storage Strategy**:
  - Uses `sessionStorage.getItem("wwp_wbi_session")` as primary storage.
  - Structure: `{ sessionId: string, lastActivity: number, isAnonymous: boolean }`.
  - **Fallback**: If `sessionStorage` is unavailable (private browsing restrictions), maintains session in-memory for the window lifetime.
- **Sliding Inactivity Window**:
  - A session expires after **30 minutes of inactivity**.
  - On user interaction after $>30$ minutes, generates a new cryptographic `uuidv4()` session ID.
- **Tab Isolation & Multi-Window**:
  - Standard `sessionStorage` naturally isolates browser tabs. Each tab represents an independent interaction session.
  - If a user opens a new window, a clean session ID is initialized, avoiding cross-tab race conditions in local state.
- **Authentication Handshake**:
  - The SDK tracks whether the session was initiated anonymously.
  - Upon login, the SDK retains the current `sessionId`, but subsequent event flushes will carry the newly authenticated HTTP Authorization header. The backend automatically associates the active session with the authenticated `User` record without client-side identity forgery.
  - Upon logout, `SessionManager.resetSession()` immediately rotates the `sessionId` to prevent subsequent events from being linked to the previous session.

### 4.3 ContextCollector (`context.ts`)
Extracts screen, device, and runtime environment properties safely.
- **Guard**: All DOM/window access checks `typeof window !== "undefined"`.
- **Collected Metadata**:
  - `device_category`: Inferred from `window.matchMedia` screen width and user agent heuristics (`desktop`, `tablet`, `mobile`).
  - `screen_width`, `screen_height`: `window.screen.width`, `window.screen.height`.
  - `viewport_width`, `viewport_height`: `window.innerWidth`, `window.innerHeight`.
  - `device_pixel_ratio`: `String(window.devicePixelRatio || 1)`.
  - `user_agent_normalized`: Truncated, sanitized `navigator.userAgent.slice(0, 255)`.
  - `access_environment`: `"embedded_widget"` if route starts with `/embed/`, otherwise `"web_app"` (or `"pwa"` if running in standalone display mode).
  - `timezone`: `Intl.DateTimeFormat().resolvedOptions().timeZone`.

### 4.4 EventSanitizer (`sanitizer.ts`)
Guarantees compliance with WBI privacy requirements before any data enters the buffer.
- **Rules**:
  1. Recursively traverses `properties` dictionary.
  2. Banned key substring check matching backend:
     `["password", "secret", "token", "auth", "credit_card", "ssn", "cvv", "api_key", "private_key"]`.
  3. Key count limit: Maximum 50 keys.
  4. Value serialization limit: Truncates string values to 500 characters; strips non-serializable objects (DOM nodes, functions, circular structures).
  5. Drops prohibited keys and logs a client-side debug warning in development mode.

### 4.5 EventBuffer (`buffer.ts`)
In-memory queue holding events pending delivery.
- **Capacity**: Maximum **200 events**.
- **Overflow Policy**: **FIFO Drop Oldest**. If buffer exceeds 200 events (e.g., during sustained offline state), drops the oldest queued interaction events, while prioritizing `workflow` completion and `error` events.
- **Thread Safety**: Single-threaded JavaScript event loop guarantees atomic buffer mutations.

### 4.6 BatchTransport (`transport.ts`)
Handles network transmission, timer management, and HTTP status handling.
- **Flush Triggers**:
  1. **Batch Size Threshold**: When buffer reaches **25 events**, flush immediately.
  2. **Periodic Timer**: Every **10 seconds** if buffer contains $\ge 1$ event.
  3. **High-Priority Events**: Immediate flush on `workflow_completed`, `workflow_abandoned`, or `api_error`.
  4. **Page Lifecycle**: Flushes on `visibilitychange` (state becomes `hidden`) and `pagehide`.
- **Dispatch Mechanism**:
  - Primary: `fetch(url, { method: "POST", headers, body, keepalive: true, credentials: "include" })`.
  - Unload Fallback: `navigator.sendBeacon(url, blob)` when page is terminating.
- **Retry & Backoff**:
  - Max retries: 2 attempts.
  - Backoff: Exponential ($1\text{s}, 3\text{s}$) with jitter.
  - Backpressure handling (`HTTP 429`): Suspends transport for 60 seconds (`Retry-After` header honored if present).

---

## 5. Dwell & Active Engagement Engine

To address the requirement of measuring meaningful engagement without noisy event floods:

1. **Active vs. Idle State**:
   - The user is considered **Active** if an interaction (click, keypress, scroll, or focus) occurred within the last 60 seconds.
   - If no interaction occurs for 60 seconds, the session enters **Idle** state.
2. **Heartbeat Strategy**:
   - Emits `navigation.dwell.heartbeat` every **30 seconds** *only* while:
     - Document visibility is `visible` (`document.visibilityState === "visible"`).
     - Window has focus (`document.hasFocus()`).
     - Session state is **Active** (not Idle).
   - Once Idle, heartbeats pause completely until the next user interaction wakes the session.
3. **Route Dwell Duration**:
   - When navigating from Route A to Route B, the SDK calculates elapsed active milliseconds on Route A and sends an exit event with `duration_ms`.

---

## 6. Failure Modes & Application Isolation Matrix

| Failure Mode | Impact on User Experience | SDK Behavior | Recovery Mechanism |
| :--- | :--- | :--- | :--- |
| **Backend Unreachable (503 / Network Down)** | Zero impact | Events retained in memory buffer up to 200 limit. Retries twice with backoff. | Flushes automatically when network recovers. Drops oldest if buffer overflows. |
| **Ingestion Backpressure (429)** | Zero impact | Immediately suspends batch transmission for 60 seconds. Flushes stopped. | Resumes periodic flushing after cooldown period expires. |
| **Payload Validation Error (422)** | Zero impact | Discards invalid batch; logs warning in development console. | Prevents poison batches from repeatedly clogging the transport. |
| **Uncaught Exception in SDK** | Zero impact | All SDK entry points are wrapped in `try/catch`. Exceptions suppressed in production. | Application rendering and user flows proceed uninterrupted. |
| **Browser Crash / Abrupt Close** | Zero impact | Recent events dispatched via `pagehide` + `keepalive` or `navigator.sendBeacon`. | Ingested events safely buffered in Redis. |

---

## 7. Performance Budget & Resource Sizing

- **Bundle Size Target**: $\le 6.5\text{ KB}$ minified and gzipped (tree-shakeable zero-dependency TypeScript).
- **Execution Overhead**:
  - `track()` invocation: $<0.2\text{ ms}$ (memory append + timestamp).
  - Batch serialization: $<1.5\text{ ms}$ for 25 events.
- **Network Overhead**:
  - Average batch payload (25 events): $\approx 4.8\text{ KB}$ gzipped.
  - Transmission frequency: 1 request every 10–30 seconds during active usage. Zero requests while idle.
- **Memory Consumption**:
  - Peak in-memory queue footprint: $<150\text{ KB}$ at max capacity (200 events).

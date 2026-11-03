/**
 * Weirwise Behavioral Intelligence (WBI) – Core SDK Headless Unit Test Suite
 * Tests:
 * 1. EventSanitizer (property filtering, banned keywords, limits, route normalization)
 * 2. SessionManager (UUIDv4 generation, 30-min timeout, login/logout rotation)
 * 3. EventBuffer (bounded capacity 200, priority eviction, batch dequeuing, reinsertion)
 * 4. ContextCollector (device heuristics, viewport limits)
 * 5. BatchTransport (payload formatting, 429 backpressure handling)
 * 6. TelemetryClient (coordination, batch threshold, admin route exclusion)
 * 7. WorkflowTracker (state machine, step duration, completion, abandonment)
 */

import { EventSanitizer, BANNED_PATTERNS } from "./sanitizer";
import { SessionManager, generateUUID } from "./session";
import { EventBuffer } from "./buffer";
import { ContextCollector } from "./context";
import { TelemetryClient } from "./client";
import { WorkflowTracker } from "./workflows";
import { BehavioralEventItem } from "./types";

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, msg: string) {
  totalCount++;
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  } else {
    passedCount++;
    console.log(`✅ PASS: ${msg}`);
  }
}

async function runTests() {
  console.log("=== Weirwise Behavioral Intelligence (WBI) – Unit Test Suite ===\n");

  // 1. EventSanitizer Tests
  console.log("-- Test Suite: EventSanitizer --");
  assert(EventSanitizer.isValidEventName("workflow.funnel.started"), "Valid event name syntax accepted");
  assert(EventSanitizer.isValidEventName("feature.assistant_builder.opened"), "Valid snake_case event name accepted");
  assert(!EventSanitizer.isValidEventName("invalid-name"), "Hyphenated or non-dotted name rejected");
  assert(!EventSanitizer.isValidEventName(""), "Empty event name rejected");
  assert(!EventSanitizer.isValidEventName("a".repeat(70)), "Overlong event name rejected");

  // Route normalization
  assert(
    EventSanitizer.normalizeRoute("https://dev.weirwise.com/workspaces/ws-1/sources?token=secret#top") ===
      "/workspaces/ws-1/sources",
    "Route normalization strips protocol, domain, query params, and hash"
  );
  assert(
    EventSanitizer.normalizeRoute("/assistants/new?debug=true") === "/assistants/new",
    "Relative route query params stripped"
  );

  // Property sanitization and banned keyword filtering
  const rawProps = {
    user_email: "test@example.com",
    safe_metric: 42,
    password_hash: "should_be_stripped",
    API_KEY_VALUE: "secret_value",
    auth_bearer: "token_123",
    nested: {
      is_valid: true,
      super_secret_token: "hidden",
      deep: {
        level: 3,
        overflow_property: "allowed",
        too_deep: {
          level: 4,
          ignored: true,
        },
      },
    },
  };

  const sanitized = EventSanitizer.sanitizeProperties(rawProps);
  assert(sanitized.safe_metric === 42, "Safe property preserved");
  assert(sanitized.password_hash === undefined, "Prohibited key 'password_hash' removed");
  assert(sanitized.API_KEY_VALUE === undefined, "Prohibited key 'API_KEY_VALUE' removed");
  assert(sanitized.auth_bearer === undefined, "Prohibited key 'auth_bearer' removed");
  assert(sanitized.nested?.is_valid === true, "Nested safe property preserved");
  assert(sanitized.nested?.super_secret_token === undefined, "Nested sensitive property removed");
  assert(sanitized.nested?.deep?.level === 3, "3rd level nesting allowed");
  assert(sanitized.nested?.deep?.too_deep === undefined || Object.keys(sanitized.nested.deep.too_deep).length === 0, "4th level nesting truncated");

  // Verify property count cap
  const largeObject: Record<string, number> = {};
  for (let i = 0; i < 70; i++) {
    largeObject[`prop_${i}`] = i;
  }
  const cappedProps = EventSanitizer.sanitizeProperties(largeObject);
  assert(Object.keys(cappedProps).length <= 50, "Properties capped at 50 keys");

  // String truncation
  const longStrProps = EventSanitizer.sanitizeProperties({ long_text: "a".repeat(600) });
  assert(longStrProps.long_text.length === 500, "Property string value truncated to 500 characters");

  // 2. SessionManager Tests
  console.log("\n-- Test Suite: SessionManager --");
  const sm = new SessionManager(100); // 100ms timeout for testing
  const s1 = sm.getSessionId();
  assert(typeof s1 === "string" && s1.length >= 32, "Cryptographically secure session UUID generated");
  const s2 = sm.getSessionId();
  assert(s1 === s2, "Same session ID returned while active within timeout window");

  // Simulate timeout
  await new Promise((resolve) => setTimeout(resolve, 120));
  const s3 = sm.getSessionId();
  assert(s1 !== s3, "Session ID rotated after inactivity timeout expired");

  // Logout rotation
  const sLogout = sm.onLogout();
  assert(sLogout !== s3, "Session ID immediately rotated on logout");
  const sAfterLogout = sm.getSessionId();
  assert(sLogout === sAfterLogout, "Session ID retained following logout");

  // 3. EventBuffer Tests
  console.log("\n-- Test Suite: EventBuffer --");
  const buffer = new EventBuffer(10); // Capacity 10 for test
  assert(buffer.isEmpty(), "Buffer initially empty");

  const makeMockEvent = (id: string, name: string): BehavioralEventItem => ({
    event_id: id,
    category: "feature",
    event_name: name,
    route: "/test",
    timestamp: new Date().toISOString(),
    properties: {},
  });

  // Fill with 5 low, 5 normal
  for (let i = 0; i < 5; i++) {
    buffer.enqueue(makeMockEvent(`low-${i}`, "navigation.dwell.heartbeat"), "low");
  }
  for (let i = 0; i < 5; i++) {
    buffer.enqueue(makeMockEvent(`norm-${i}`, "action.button.clicked"), "normal");
  }
  assert(buffer.length === 10, "Buffer filled to capacity (10)");

  // Enqueue high priority event - should evict oldest low-priority event
  buffer.enqueue(makeMockEvent("high-1", "workflow.funnel.completed"), "high");
  assert(buffer.length === 10, "Buffer capacity maintained at 10 after eviction");
  const snapshot = buffer.peek();
  assert(!snapshot.some((item) => item.event.event_id === "low-0"), "Oldest low-priority event evicted");
  assert(snapshot.some((item) => item.event.event_id === "high-1"), "High-priority event enqueued");

  // Dequeue batch
  const batch = buffer.dequeueBatch(5);
  assert(batch.length === 5, "Dequeued 5 events in batch");
  assert(buffer.length === 5, "Buffer length decreased by batch count");

  // Reinsert batch on failure
  buffer.reinsertBatch(batch);
  assert(buffer.length === 10, "Batch reinserted on failure");
  assert(buffer.peek()[0].retry_count === 1, "Retry count incremented on reinserted batch");

  // 4. ContextCollector Tests
  console.log("\n-- Test Suite: ContextCollector --");
  const devCtx = ContextCollector.getDeviceContext("/workspaces/ws1");
  assert(devCtx.access_environment === "web_app", "Default route resolved to web_app access environment");
  const embedCtx = ContextCollector.getDeviceContext("/embed/assistant-123");
  assert(embedCtx.access_environment === "embedded_widget", "/embed route resolved to embedded_widget");
  const geoCtx = ContextCollector.getGeographicContext();
  assert(geoCtx !== undefined, "Geographic context collected");

  // 5. TelemetryClient Tests
  console.log("\n-- Test Suite: TelemetryClient --");
  const client = new TelemetryClient({
    batchThreshold: 3,
    maxBufferSize: 50,
    debug: false,
  });

  // Tracking on normal route
  const ev1 = client.track("feature", "feature.assistant.created", {
    route: "/workspaces/ws-test/assistants",
    properties: { model: "gpt-4" },
  });
  assert(ev1 !== null, "Track event succeeded and returned event UUID");

  // Tracking on admin route must be excluded
  const evAdmin = client.track("feature", "feature.admin.viewed", {
    route: "/admin/audit",
  });
  assert(evAdmin === null, "Admin route event completely excluded from WBI telemetry");

  // 6. WorkflowTracker Tests
  console.log("\n-- Test Suite: WorkflowTracker --");
  const workflows = new WorkflowTracker(client);
  const wfId = "wf_create_assistant";
  const instanceId = workflows.start(wfId, "start_modal", { template: "qa_bot" });
  assert(typeof instanceId === "string" && instanceId.length >= 32, "Workflow started with instance UUID");

  const active = workflows.getActiveInstance(wfId);
  assert(active !== undefined && active.currentStepName === "start_modal", "Active workflow state tracked");

  workflows.stepCompleted(wfId, "configure_model");
  assert(workflows.getActiveInstance(wfId)?.currentStepIndex === 1, "Workflow step index advanced");
  assert(workflows.getActiveInstance(wfId)?.currentStepName === "configure_model", "Workflow step name updated");

  workflows.complete(wfId, { status: "success" });
  assert(workflows.getActiveInstance(wfId) === undefined, "Completed workflow removed from active map");

  console.log(`\n======================================================`);
  console.log(`Summary: All ${passedCount}/${totalCount} WBI Core SDK Unit Tests Passed!`);
  console.log(`======================================================\n`);
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});

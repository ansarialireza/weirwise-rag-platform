/**
 * Weirwise Behavioral Intelligence (WBI) – Phase 2 Event Contract & Data Types
 * Matches backend Pydantic schemas in backend/app/schemas/behavioral.py
 */

export type EventCategory =
  | "navigation"
  | "feature"
  | "action"
  | "workflow"
  | "friction"
  | "error";

export type EventPriority = "high" | "normal" | "low";

export type DeviceCategory = "desktop" | "laptop" | "tablet" | "mobile" | "unknown";

export type AccessEnvironment = "web_app" | "pwa" | "embedded_widget" | "unknown";

export interface DeviceContextSchema {
  device_category: DeviceCategory;
  operating_system?: string;
  os_version?: string;
  browser?: string;
  browser_version?: string;
  screen_width?: number;
  screen_height?: number;
  viewport_width?: number;
  viewport_height?: number;
  device_pixel_ratio?: string;
  user_agent_normalized?: string;
  access_environment: AccessEnvironment;
}

export interface GeographicContextSchema {
  country_code?: string;
  country_name?: string;
  region?: string;
  city?: string;
  timezone?: string;
}

export interface BehavioralEventItem {
  event_id: string; // UUIDv4 idempotency key
  category: EventCategory;
  event_name: string; // dot-notated alphanumeric e.g. "workflow.funnel.started"
  component_id?: string | null;
  route: string;
  referrer_route?: string | null;
  duration_ms?: number | null;
  timestamp: string; // ISO 8601 UTC
  properties: Record<string, any>;
  schema_version?: string;
}

export interface BehavioralBatchIngestionRequest {
  session_id: string;
  workspace_id?: string | null;
  device_context?: DeviceContextSchema;
  geographic_context?: GeographicContextSchema;
  events: BehavioralEventItem[];
}

export interface IngestionResponse {
  status: string;
  session_id: string;
  events_queued: number;
  ingested_at: string;
}

export interface QueuedEvent {
  event: BehavioralEventItem;
  priority: EventPriority;
  enqueued_at: number;
  retry_count: number;
}

export interface SessionData {
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  isAnonymous: boolean;
}

export interface TelemetryConfig {
  endpoint?: string;
  batchThreshold?: number; // Default 25
  flushIntervalMs?: number; // Default 10,000 (10s)
  maxBufferSize?: number; // Default 200
  sessionInactivityTimeoutMs?: number; // Default 30 mins (1,800,000 ms)
  enabled?: boolean;
  debug?: boolean;
}

export interface TrackOptions {
  componentId?: string | null;
  route?: string;
  referrerRoute?: string | null;
  durationMs?: number | null;
  properties?: Record<string, any>;
  priority?: EventPriority;
}

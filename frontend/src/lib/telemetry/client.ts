/**
 * Weirwise Behavioral Intelligence (WBI) – Telemetry Client Coordinator
 * 
 * Central singleton orchestrating:
 * - EventSanitizer
 * - SessionManager
 * - ContextCollector
 * - EventBuffer
 * - BatchTransport
 * 
 * Rules:
 * - Max batch size 25 (threshold)
 * - Max flush interval 10s
 * - Max buffer 200
 * - Unload handlers (pagehide, visibilitychange)
 * - Complete non-blocking, silent degradation
 */

import { EventBuffer } from "./buffer";
import { ContextCollector } from "./context";
import { EventSanitizer } from "./sanitizer";
import { SessionManager, generateUUID } from "./session";
import { BatchTransport } from "./transport";
import {
  BehavioralBatchIngestionRequest,
  BehavioralEventItem,
  EventCategory,
  EventPriority,
  TelemetryConfig,
  TrackOptions,
} from "./types";

export class TelemetryClient {
  private config: Required<TelemetryConfig>;
  private buffer: EventBuffer;
  private sessionManager: SessionManager;
  private transport: BatchTransport;
  private flushTimer: any = null;
  private isFlushing: boolean = false;
  private activeWorkspaceId: string | null = null;
  private currentRoute: string = "/";
  private referrerRoute: string | null = null;
  private isBrowser: boolean;
  private initialized: boolean = false;

  constructor(config: TelemetryConfig = {}) {
    this.isBrowser = typeof window !== "undefined";
    this.config = {
      endpoint: config.endpoint || "",
      batchThreshold: config.batchThreshold ?? 25,
      flushIntervalMs: config.flushIntervalMs ?? 10_000,
      maxBufferSize: config.maxBufferSize ?? 200,
      sessionInactivityTimeoutMs: config.sessionInactivityTimeoutMs ?? 30 * 60 * 1000,
      enabled: config.enabled ?? true,
      debug: config.debug ?? false,
    };

    this.buffer = new EventBuffer(this.config.maxBufferSize);
    this.sessionManager = new SessionManager(this.config.sessionInactivityTimeoutMs);
    this.transport = new BatchTransport({
      endpoint: this.config.endpoint || undefined,
      debug: this.config.debug,
    });

    if (this.isBrowser) {
      this.currentRoute = EventSanitizer.normalizeRoute(window.location.pathname);
    }
  }

  /**
   * Initializes browser listeners (lifecycle, unload).
   */
  public init(): void {
    if (this.initialized || !this.isBrowser) return;
    this.initialized = true;

    // Start flush timer
    this.startFlushTimer();

    // Attach lifecycle listeners
    window.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("pagehide", this.handlePageHide);
    window.addEventListener("beforeunload", this.handlePageHide);
  }

  /**
   * Cleans up listeners and timers.
   */
  public destroy(): void {
    if (!this.initialized) return;
    this.stopFlushTimer();
    if (this.isBrowser) {
      window.removeEventListener("visibilitychange", this.handleVisibilityChange);
      window.removeEventListener("pagehide", this.handlePageHide);
      window.removeEventListener("beforeunload", this.handlePageHide);
    }
    this.initialized = false;
  }

  public setWorkspaceId(workspaceId: string | null): void {
    this.activeWorkspaceId = workspaceId;
  }

  public setRoute(route: string): void {
    const normalized = EventSanitizer.normalizeRoute(route);
    if (normalized !== this.currentRoute) {
      this.referrerRoute = this.currentRoute;
      this.currentRoute = normalized;
    }
  }

  public getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  public getBuffer(): EventBuffer {
    return this.buffer;
  }

  /**
   * Core tracking method.
   */
  public track(
    category: EventCategory,
    eventName: string,
    options: TrackOptions = {}
  ): string | null {
    if (!this.config.enabled) return null;

    try {
      if (!EventSanitizer.isValidEventName(eventName)) {
        if (this.config.debug) {
          console.warn(`[WBI] Invalid event name format: "${eventName}". Must match 'domain.object.action'.`);
        }
        return null;
      }

      const route = options.route
        ? EventSanitizer.normalizeRoute(options.route)
        : this.currentRoute;

      // Exclude admin routes completely
      if (route.startsWith("/admin")) {
        return null;
      }

      const eventId = generateUUID();
      const timestamp = new Date().toISOString();
      const sanitizedProps = EventSanitizer.sanitizeProperties(options.properties);

      // Determine priority if not specified
      let priority = options.priority;
      if (!priority) {
        if (
          category === "error" ||
          eventName.endsWith(".completed") ||
          eventName.endsWith(".failed")
        ) {
          priority = "high";
        } else if (eventName.includes(".dwell.") || eventName.includes(".heartbeat")) {
          priority = "low";
        } else {
          priority = "normal";
        }
      }

      const eventItem: BehavioralEventItem = {
        event_id: eventId,
        category,
        event_name: eventName,
        component_id: options.componentId ? options.componentId.slice(0, 128) : null,
        route,
        referrer_route: options.referrerRoute
          ? EventSanitizer.normalizeRoute(options.referrerRoute)
          : this.referrerRoute,
        duration_ms: options.durationMs !== undefined && options.durationMs !== null
          ? Math.min(Math.max(0, Math.round(options.durationMs)), 86400000)
          : null,
        timestamp,
        properties: sanitizedProps,
        schema_version: "1.0",
      };

      const enqueued = this.buffer.enqueue(eventItem, priority);
      if (!enqueued && this.config.debug) {
        console.warn(`[WBI] Event buffer full. Event ${eventName} (${priority}) dropped.`);
      }

      // Check if immediate flush is needed
      if (
        priority === "high" ||
        this.buffer.length >= this.config.batchThreshold
      ) {
        this.flush().catch(() => {});
      }

      return eventId;
    } catch (err: any) {
      if (this.config.debug) {
        console.error("[WBI] Unexpected error tracking event:", err);
      }
      return null;
    }
  }

  /**
   * Tracks route/page view.
   */
  public trackPageView(route: string, referrer?: string): string | null {
    this.setRoute(route);
    return this.track("navigation", "navigation.route.viewed", {
      route: this.currentRoute,
      referrerRoute: referrer || this.referrerRoute,
      priority: "normal",
      properties: {
        navigation_type: "client_navigation",
      },
    });
  }

  /**
   * Tracks feature interaction.
   */
  public trackFeature(
    featureName: string,
    action: string,
    componentId?: string | null,
    properties?: Record<string, any>
  ): string | null {
    const eventName = `feature.${featureName}.${action}`.toLowerCase().replace(/[^a-z0-9_.]/g, "_");
    return this.track("feature", eventName, {
      componentId,
      properties,
    });
  }

  /**
   * Tracks UI action (e.g. button click, tab change).
   */
  public trackAction(
    actionName: string,
    componentId?: string | null,
    properties?: Record<string, any>
  ): string | null {
    const eventName = `action.${actionName}`.toLowerCase().replace(/[^a-z0-9_.]/g, "_");
    return this.track("action", eventName, {
      componentId,
      properties,
    });
  }

  /**
   * Tracks usability/system friction.
   */
  public trackFriction(
    frictionType: string,
    componentId?: string | null,
    properties?: Record<string, any>
  ): string | null {
    const eventName = `friction.${frictionType}`.toLowerCase().replace(/[^a-z0-9_.]/g, "_");
    return this.track("friction", eventName, {
      componentId,
      properties,
      priority: "normal",
    });
  }

  /**
   * Tracks error.
   */
  public trackError(
    errorDomain: string,
    errorCode: string,
    componentId?: string | null,
    properties?: Record<string, any>
  ): string | null {
    const eventName = `error.${errorDomain}.${errorCode}`.toLowerCase().replace(/[^a-z0-9_.]/g, "_");
    return this.track("error", eventName, {
      componentId,
      properties,
      priority: "high",
    });
  }

  /**
   * Flushes queued events to the backend.
   */
  public async flush(options: { explicitToken?: string | null; timeoutMs?: number } = {}): Promise<void> {
    if (!this.config.enabled || this.isFlushing || this.buffer.isEmpty()) {
      return;
    }

    if (this.transport.isRateLimited()) {
      return;
    }

    this.isFlushing = true;
    const timeoutMs = options.timeoutMs ?? 5000;
    const startTime = Date.now();

    try {
      while (!this.buffer.isEmpty() && !this.transport.isRateLimited()) {
        if (Date.now() - startTime >= timeoutMs) {
          if (this.config.debug) {
            console.warn("[WBI] Flush operation reached timeout limit; halting remaining iterations.");
          }
          break;
        }

        const queuedItems = this.buffer.dequeueBatch(this.config.batchThreshold);
        if (queuedItems.length === 0) break;

        const payload: BehavioralBatchIngestionRequest = {
          session_id: this.sessionManager.getSessionId(),
          workspace_id: this.activeWorkspaceId,
          device_context: ContextCollector.getDeviceContext(this.currentRoute),
          geographic_context: ContextCollector.getGeographicContext(),
          events: queuedItems.map((q) => q.event),
        };

        const result = await this.transport.sendBatch(payload, {
          explicitToken: options.explicitToken,
        });

        if (result.status === "delivered") {
          // Success
          continue;
        }

        if (result.status === "rate_limited") {
          // Re-queue items that couldn't be delivered
          this.buffer.reinsertBatch(queuedItems);
          break;
        }

        if (result.status === "retryable_failure") {
          // Re-queue items up to max retries
          this.buffer.reinsertBatch(queuedItems);
          break;
        }

        if (result.status === "terminal_failure") {
          // Discard invalid batch to prevent poison batch loops
          if (this.config.debug) {
            console.error("[WBI] Dropping invalid batch permanently due to terminal failure.");
          }
        }
      }
    } catch (err: any) {
      if (this.config.debug) {
        console.error("[WBI] Flush execution failed:", err);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setInterval(() => {
      if (!this.buffer.isEmpty()) {
        this.flush().catch(() => {});
      }
    }, this.config.flushIntervalMs);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private handleVisibilityChange = (): void => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      this.flushOnUnload();
    }
  };

  private handlePageHide = (): void => {
    this.flushOnUnload();
  };

  private flushOnUnload(): void {
    if (this.buffer.isEmpty() || this.transport.isRateLimited()) return;

    // Grab all remaining events (up to 100 max per batch)
    const items = this.buffer.dequeueBatch(100);
    if (items.length === 0) return;

    const payload: BehavioralBatchIngestionRequest = {
      session_id: this.sessionManager.getSessionId(),
      workspace_id: this.activeWorkspaceId,
      device_context: ContextCollector.getDeviceContext(this.currentRoute),
      geographic_context: ContextCollector.getGeographicContext(),
      events: items.map((q) => q.event),
    };

    const sent = this.transport.sendOnUnload(payload);
    if (!sent) {
      // Re-queue in case page wasn't truly unloaded (e.g. visibility change)
      this.buffer.reinsertBatch(items);
    }
  }
}

// Global client instance singleton
export const telemetry = new TelemetryClient();

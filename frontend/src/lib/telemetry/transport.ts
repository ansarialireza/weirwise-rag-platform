/**
 * Weirwise Behavioral Intelligence (WBI) – Batch Network Transport
 * 
 * Transport strategy:
 * - Uses fetch(url, { keepalive: true, credentials: "include" }) for safe authenticated delivery.
 * - Forwards Bearer token from api.getToken() or custom getter.
 * - Handles HTTP 202 Accepted, HTTP 429 Backpressure (Retry-After), HTTP 503, and network drops.
 * - Exponential backoff with jitter on transient failures.
 * - Unload fallback: navigator.sendBeacon only for anonymous sessions where credentials header isn't required,
 *   or fetch with keepalive: true.
 */

import { BehavioralBatchIngestionRequest, IngestionResponse, QueuedEvent } from "./types";
import { api } from "@/lib/api";

export interface TransportOptions {
  endpoint?: string;
  debug?: boolean;
}

export type BatchDeliveryStatus = "delivered" | "rate_limited" | "retryable_failure" | "terminal_failure";

export interface BatchDeliveryResult {
  status: BatchDeliveryStatus;
  retryAfterSeconds?: number;
  statusCode?: number;
}

export class BatchTransport {
  private endpoint: string;
  private debug: boolean;
  private backpressureUntil: number = 0;

  constructor(options: TransportOptions = {}) {
    const defaultEndpoint = "/api/v1/telemetry/events:batch";
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
    this.endpoint = options.endpoint || (apiBase.endsWith("/api/v1") ? `${apiBase}/telemetry/events:batch` : defaultEndpoint);
    this.debug = !!options.debug;
  }

  public isRateLimited(): boolean {
    return Date.now() < this.backpressureUntil;
  }

  public getRateLimitWaitMs(): number {
    return Math.max(0, this.backpressureUntil - Date.now());
  }

  /**
   * Dispatches a batch payload to backend ingestion endpoint.
   */
  public async sendBatch(
    payload: BehavioralBatchIngestionRequest,
    options: { keepalive?: boolean } = {}
  ): Promise<BatchDeliveryResult> {
    if (this.isRateLimited()) {
      if (this.debug) {
        console.warn("[WBI] Transport suspended due to active backpressure.");
      }
      return {
        status: "rate_limited",
        retryAfterSeconds: Math.ceil(this.getRateLimitWaitMs() / 1000),
      };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Forward Bearer token if user is authenticated
    try {
      const token = api.getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {
      // In headless/test or decoupled environments, proceed with cookies / anonymous
    }

    const bodyString = JSON.stringify(payload);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: bodyString,
        keepalive: options.keepalive ?? true,
        credentials: "include", // Forward session cookies
      });

      if (response.status === 202) {
        // Backend successfully enqueued events into Redis Stream
        return { status: "delivered", statusCode: 202 };
      }

      if (response.status === 429) {
        // Rate limited / backpressure
        let waitSec = 60;
        const retryAfterHeader = response.headers.get("Retry-After");
        if (retryAfterHeader) {
          const parsed = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsed) && parsed > 0) {
            waitSec = parsed;
          }
        }
        this.backpressureUntil = Date.now() + waitSec * 1000;
        return {
          status: "rate_limited",
          retryAfterSeconds: waitSec,
          statusCode: 429,
        };
      }

      if (response.status >= 500 && response.status < 600) {
        // Transient server error (e.g. 503 Redis unavailable)
        return { status: "retryable_failure", statusCode: response.status };
      }

      if (response.status === 422 || response.status === 400) {
        // Terminal validation error (payload rejected by schema)
        if (this.debug) {
          try {
            const errBody = await response.json();
            console.error("[WBI] Batch rejected with schema validation error:", errBody);
          } catch {
            // Ignored
          }
        }
        return { status: "terminal_failure", statusCode: response.status };
      }

      if (response.status === 401 || response.status === 403) {
        // Auth issue - treat as terminal for this token
        return { status: "terminal_failure", statusCode: response.status };
      }

      return { status: "retryable_failure", statusCode: response.status };
    } catch (err: any) {
      if (this.debug) {
        console.warn("[WBI] Network failure during batch dispatch:", err?.message);
      }
      return { status: "retryable_failure" };
    }
  }

  /**
   * Page unload transport fallback.
   */
  public sendOnUnload(payload: BehavioralBatchIngestionRequest): boolean {
    if (this.isRateLimited()) return false;

    // First choice: fetch with keepalive: true (supports custom Authorization headers and credentials)
    try {
      const bodyString = JSON.stringify(payload);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = api.getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      if (typeof fetch === "function") {
        fetch(this.endpoint, {
          method: "POST",
          headers,
          body: bodyString,
          keepalive: true,
          credentials: "include",
        }).catch(() => {});
        return true;
      }
    } catch {
      // Fallback to sendBeacon if fetch with keepalive fails
    }

    // Fallback: navigator.sendBeacon (works for cookies, but cannot set Bearer header)
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        return navigator.sendBeacon(this.endpoint, blob);
      } catch {
        return false;
      }
    }

    return false;
  }
}

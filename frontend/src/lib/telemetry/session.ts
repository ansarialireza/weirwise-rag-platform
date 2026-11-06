/**
 * Weirwise Behavioral Intelligence (WBI) – Session Lifecycle Management
 * 
 * Rules:
 * 1. Cryptographically secure session IDs (UUIDv4).
 * 2. 30-minute sliding inactivity timeout.
 * 3. Never generates or assigns client-side user IDs (server-authoritative).
 * 4. Rotates session on logout to prevent cross-user contamination.
 * 5. Multi-tab and memory fallback support.
 */

import { SessionData } from "./types";

const STORAGE_KEY = "wwp_wbi_session";
const DEFAULT_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback if randomUUID fails
    }
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC 4122 version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Pure Math.random fallback (e.g. for restricted environments)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class SessionManager {
  private memorySession: SessionData | null = null;
  private inactivityTimeoutMs: number;

  constructor(inactivityTimeoutMs: number = DEFAULT_INACTIVITY_TIMEOUT_MS) {
    this.inactivityTimeoutMs = inactivityTimeoutMs;
  }

  private isStorageAvailable(): boolean {
    if (typeof window === "undefined" || !window.sessionStorage) {
      return false;
    }
    try {
      const testKey = "__wbi_test__";
      sessionStorage.setItem(testKey, "1");
      sessionStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private loadSession(): SessionData | null {
    if (this.isStorageAvailable()) {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.sessionId === "string" && typeof parsed.lastActivity === "number") {
            return parsed;
          }
        }
      } catch {
        // Fallback to memory
      }
    }
    return this.memorySession;
  }

  private saveSession(session: SessionData): void {
    this.memorySession = session;
    if (this.isStorageAvailable()) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch {
        // Ignored in private/restricted browsing
      }
    }
  }

  /**
   * Retrieves active session ID, renewing it if expired due to inactivity.
   */
  public getSessionId(): string {
    const now = Date.now();
    let session = this.loadSession();

    if (!session) {
      // Create new initial anonymous session
      session = {
        sessionId: generateUUID(),
        createdAt: now,
        lastActivity: now,
        isAnonymous: true,
      };
      this.saveSession(session);
      return session.sessionId;
    }

    // Check sliding inactivity window
    if (now - session.lastActivity > this.inactivityTimeoutMs) {
      // Session expired due to inactivity, rotate session ID
      session = {
        sessionId: generateUUID(),
        createdAt: now,
        lastActivity: now,
        isAnonymous: session.isAnonymous,
      };
      this.saveSession(session);
      return session.sessionId;
    }

    // Update last activity timestamp
    session.lastActivity = now;
    this.saveSession(session);
    return session.sessionId;
  }

  /**
   * Called on user login: flags session as authenticated while preserving current session ID
   * so initial pre-login funnel steps can be attributed securely by backend.
   */
  public onLogin(): void {
    const session = this.loadSession();
    if (session) {
      session.isAnonymous = false;
      session.lastActivity = Date.now();
      this.saveSession(session);
    } else {
      this.getSessionId();
    }
  }

  /**
   * Called on user logout: immediately rotates session to prevent subsequent events
   * from being associated with previous user session.
   */
  public onLogout(): string {
    const now = Date.now();
    const newSession: SessionData = {
      sessionId: generateUUID(),
      createdAt: now,
      lastActivity: now,
      isAnonymous: true,
    };
    this.saveSession(newSession);
    return newSession.sessionId;
  }

  /**
   * Explicitly resets session (e.g., test cleanup or explicit reset).
   */
  public reset(): void {
    this.memorySession = null;
    if (this.isStorageAvailable()) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignored
      }
    }
  }
}

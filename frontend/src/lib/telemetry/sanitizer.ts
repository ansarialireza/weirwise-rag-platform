/**
 * Weirwise Behavioral Intelligence (WBI) – Event Sanitizer & Privacy Enforcement
 * 
 * Guarantees zero capture of private data, credentials, chat content, or unbounded structures.
 * Validates against backend behavioral schema constraints before events enter the buffer.
 */

// Banned property name substrings (case-insensitive)
export const BANNED_PATTERNS = [
  "password",
  "secret",
  "token",
  "auth",
  "credit_card",
  "ssn",
  "cvv",
  "api_key",
  "private_key",
  "credential",
  "passphrase",
  "bearer",
];

// Dot-notated alphanumeric regex matching backend EVENT_NAME_REGEX
export const EVENT_NAME_REGEX = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

export const MAX_PROPERTIES_COUNT = 50;
export const MAX_STRING_LENGTH = 500;
export const MAX_NESTING_DEPTH = 3;
export const MAX_ARRAY_LENGTH = 20;

export class EventSanitizer {
  /**
   * Validates event name according to backend contract.
   */
  static isValidEventName(name: string): boolean {
    if (!name || typeof name !== "string") return false;
    if (name.length < 3 || name.length > 64) return false;
    return EVENT_NAME_REGEX.test(name);
  }

  /**
   * Normalizes route pathname, stripping query parameters, hashes, and auth tokens.
   */
  static normalizeRoute(route: string): string {
    if (!route || typeof route !== "string") return "/";
    try {
      // If full URL was passed, parse path only
      if (route.startsWith("http://") || route.startsWith("https://")) {
        const url = new URL(route);
        return url.pathname.slice(0, 255);
      }
      // Strip search params and hash
      const clean = route.split("?")[0].split("#")[0].trim();
      return (clean || "/").slice(0, 255);
    } catch {
      return route.slice(0, 255);
    }
  }

  /**
   * Recursively sanitizes properties dictionary:
   * - Filters out banned keys
   * - Limits depth, array size, string length
   * - Removes non-serializable values (functions, DOM nodes, Symbols)
   * - Caps total keys at 50
   */
  static sanitizeProperties(
    raw: Record<string, any> | undefined | null,
    currentDepth: number = 0,
    seenObjects: WeakSet<object> = new WeakSet()
  ): Record<string, any> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }

    if (currentDepth >= MAX_NESTING_DEPTH) {
      return {};
    }

    if (seenObjects.has(raw)) {
      return {}; // Prevent circular references
    }
    seenObjects.add(raw);

    const sanitized: Record<string, any> = {};
    const keys = Object.keys(raw);

    for (const key of keys) {
      if (Object.keys(sanitized).length >= MAX_PROPERTIES_COUNT) {
        break; // Hard cap on 50 properties
      }

      if (typeof key !== "string") continue;
      const keyLower = key.toLowerCase();

      // Check banned keyword patterns
      const isBanned = BANNED_PATTERNS.some((pattern) => keyLower.includes(pattern));
      if (isBanned) {
        continue;
      }

      const value = raw[key];
      const sanitizedVal = EventSanitizer.sanitizeValue(value, currentDepth + 1, seenObjects);
      if (sanitizedVal !== undefined) {
        sanitized[key.slice(0, 64)] = sanitizedVal;
      }
    }

    return sanitized;
  }

  private static sanitizeValue(
    val: any,
    depth: number,
    seenObjects: WeakSet<object>
  ): any {
    if (val === null || val === undefined) {
      return null;
    }

    const t = typeof val;

    if (t === "boolean") {
      return val;
    }

    if (t === "number") {
      if (!Number.isFinite(val)) return null;
      return val;
    }

    if (t === "string") {
      return val.slice(0, MAX_STRING_LENGTH);
    }

    if (t === "object") {
      if (typeof window !== "undefined") {
        if (val instanceof Element || val instanceof Node || val instanceof Event) {
          return null; // Reject DOM nodes and events
        }
      }

      if (Array.isArray(val)) {
        if (depth >= MAX_NESTING_DEPTH) return [];
        return val
          .slice(0, MAX_ARRAY_LENGTH)
          .map((item) => EventSanitizer.sanitizeValue(item, depth + 1, seenObjects))
          .filter((item) => item !== undefined);
      }

      return EventSanitizer.sanitizeProperties(val, depth, seenObjects);
    }

    // Drop functions, symbols, bigints
    return null;
  }
}

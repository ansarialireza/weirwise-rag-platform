const STORAGE_PREFIX = "ww_sources_";

/**
 * Whether this reader wants to see sources in this assistant. The publisher decides
 * whether sources exist at all; this only remembers the personal choice, so it can
 * silence them without being able to un-silence what was never enabled.
 */
export function readSourcePreference(assistantId: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + assistantId);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    return fallback;
  }
  return fallback;
}

export function writeSourcePreference(assistantId: string, enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + assistantId, enabled ? "1" : "0");
  } catch {
    // A private-mode or quota failure must not break the conversation.
  }
}

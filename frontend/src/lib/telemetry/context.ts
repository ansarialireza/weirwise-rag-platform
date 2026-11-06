/**
 * Weirwise Behavioral Intelligence (WBI) – Client Runtime & Device Context Collector
 * 
 * Safely extracts non-sensitive screen geometry, device form factor, and browser metadata.
 * Never collects raw IPs, GPS, or hardware fingerprint hashes.
 */

import { AccessEnvironment, DeviceCategory, DeviceContextSchema, GeographicContextSchema } from "./types";

export class ContextCollector {
  /**
   * Resolves device category from screen width and user agent heuristics.
   */
  static getDeviceCategory(): DeviceCategory {
    if (typeof window === "undefined") return "unknown";

    const width = window.innerWidth || window.screen?.width || 0;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";

    if (/ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk/i.test(ua)) {
      return "tablet";
    }

    if (/mobile|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop/i.test(ua)) {
      return "mobile";
    }

    if (width > 0 && width < 768) {
      return "mobile";
    }

    if (width >= 768 && width <= 1024) {
      return "tablet";
    }

    return "desktop";
  }

  /**
   * Identifies browser name and version safely from user agent.
   */
  static getBrowserInfo(): { browser: string; version: string } {
    if (typeof navigator === "undefined") return { browser: "Unknown", version: "0" };

    const ua = navigator.userAgent;
    let browser = "Other";
    let version = "0";

    if (/Edg\/([0-9.]+)/.test(ua)) {
      browser = "Edge";
      version = RegExp.$1;
    } else if (/Chrome\/([0-9.]+)/.test(ua) && !/Chromium/.test(ua)) {
      browser = "Chrome";
      version = RegExp.$1;
    } else if (/Firefox\/([0-9.]+)/.test(ua)) {
      browser = "Firefox";
      version = RegExp.$1;
    } else if (/Safari\/([0-9.]+)/.test(ua) && !/Chrome/.test(ua)) {
      browser = "Safari";
      version = RegExp.$1;
    }

    return {
      browser: browser.slice(0, 64),
      version: version.slice(0, 32),
    };
  }

  /**
   * Identifies operating system safely from user agent or platform.
   */
  static getOperatingSystem(): string {
    if (typeof navigator === "undefined") return "Unknown";

    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) return "Windows";
    if (ua.includes("mac") || ua.includes("darwin")) return "macOS";
    if (ua.includes("android")) return "Android";
    if (ua.includes("linux")) return "Linux";
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "iOS";

    return "Other";
  }

  /**
   * Determines execution environment (web_app, embedded_widget, pwa).
   */
  static getAccessEnvironment(pathname?: string): AccessEnvironment {
    const currentPath = pathname || (typeof window !== "undefined" ? window.location?.pathname : "") || "";
    if (currentPath.startsWith("/embed/") || currentPath === "/embed") {
      return "embedded_widget";
    }

    if (typeof window === "undefined") return "web_app";

    // Check if running as installed PWA (display-mode standalone)
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any)?.standalone === true;

    if (isStandalone) {
      return "pwa";
    }

    return "web_app";
  }

  /**
   * Collects complete DeviceContextSchema matching backend.
   */
  static getDeviceContext(pathname?: string): DeviceContextSchema {
    const access_environment = ContextCollector.getAccessEnvironment(pathname);
    if (typeof window === "undefined") {
      return {
        device_category: "unknown",
        access_environment,
      };
    }

    const { browser, version } = ContextCollector.getBrowserInfo();
    const screenWidth = window.screen?.width ? Math.min(Math.max(1, window.screen.width), 10000) : undefined;
    const screenHeight = window.screen?.height ? Math.min(Math.max(1, window.screen.height), 10000) : undefined;
    const viewportWidth = window.innerWidth ? Math.min(Math.max(1, window.innerWidth), 10000) : undefined;
    const viewportHeight = window.innerHeight ? Math.min(Math.max(1, window.innerHeight), 10000) : undefined;
    const pixelRatio = window.devicePixelRatio ? String(window.devicePixelRatio).slice(0, 16) : "1";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 255) : undefined;

    return {
      device_category: ContextCollector.getDeviceCategory(),
      operating_system: ContextCollector.getOperatingSystem().slice(0, 64),
      browser,
      browser_version: version,
      screen_width: screenWidth,
      screen_height: screenHeight,
      viewport_width: viewportWidth,
      viewport_height: viewportHeight,
      device_pixel_ratio: pixelRatio,
      user_agent_normalized: ua,
      access_environment: ContextCollector.getAccessEnvironment(pathname),
    };
  }

  /**
   * Collects client geographic hints (only non-sensitive IANA timezone).
   */
  static getGeographicContext(): GeographicContextSchema {
    let timezone: string | undefined;
    try {
      if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone?.slice(0, 50);
      }
    } catch {
      // Ignored
    }

    return {
      timezone,
    };
  }
}

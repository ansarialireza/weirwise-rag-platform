import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, getDirection, matchLocale } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/i18n/types";

// HSTS is only meaningful (and only safe) on requests that actually arrived over TLS.
function withTransportSecurity(response: NextResponse, request: NextRequest): NextResponse {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (request.nextUrl.protocol === "https:" || forwardedProto === "https") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

/**
 * Server-side mirror of the client detection: stored choice wins, then
 * Accept-Language in the order the browser sent it, then the default. The
 * country hint is only consulted when nothing was declared, because guessing a
 * language from an IP is how a traveler in Tehran gets the wrong site.
 */
function negotiateLocale(request: NextRequest): Locale {
  const stored = matchLocale(request.cookies.get("wwp_locale")?.value);
  if (stored) return stored;

  const acceptLang = request.headers.get("accept-language") || "";
  for (const part of acceptLang.split(",")) {
    const hit = matchLocale(part.split(";")[0].trim());
    if (hit) return hit;
  }

  const geoCountry = (request.headers.get("cf-ipcountry") || request.headers.get("x-country-code") || "").toUpperCase();
  if (geoCountry === "IR") return "fa";

  return defaultLocale;
}

// We use NextRequest and NextResponse for geolocation and Accept-Language negotiation
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bypass static files, Next internals, api, health, service worker, manifest, favicon
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/health") ||
    pathname.startsWith("/_telemetry") ||
    pathname === "/sw.js" ||
    pathname === "/manifest.json" ||
    pathname.includes(".")
  ) {
    return withTransportSecurity(NextResponse.next(), request);
  }

  const preferredLocale = negotiateLocale(request);

  const response = NextResponse.next();
  response.headers.set("x-locale", preferredLocale);
  response.headers.set("x-direction", getDirection(preferredLocale));

  if (!request.cookies.has("wwp_locale")) {
    response.cookies.set("wwp_locale", preferredLocale, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    });
  }

  return withTransportSecurity(response, request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

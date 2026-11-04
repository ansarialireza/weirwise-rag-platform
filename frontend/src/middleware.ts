import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// HSTS is only meaningful (and only safe) on requests that actually arrived over TLS.
function withTransportSecurity(response: NextResponse, request: NextRequest): NextResponse {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (request.nextUrl.protocol === "https:" || forwardedProto === "https") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
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
    pathname === "/favicon.svg" ||
    pathname === "/weirwise-app-icon.svg" ||
    pathname.includes(".")
  ) {
    return withTransportSecurity(NextResponse.next(), request);
  }

  // Check cookie preference first
  const cookieLocale = request.cookies.get("wwp_locale")?.value;
  let preferredLocale = "en";

  if (cookieLocale === "fa" || cookieLocale === "en") {
    preferredLocale = cookieLocale;
  } else {
    // Geo/Accept-Language detection
    const acceptLang = request.headers.get("accept-language") || "";
    // Cloudflare / proxy geo country headers
    const geoCountry = request.headers.get("cf-ipcountry") || request.headers.get("x-country-code") || "";

    if (
      geoCountry.toUpperCase() === "IR" ||
      acceptLang.toLowerCase().includes("fa") ||
      acceptLang.toLowerCase().includes("persian")
    ) {
      preferredLocale = "fa";
    }
  }

  // Set response headers and cookie if not present
  const response = NextResponse.next();
  response.headers.set("x-locale", preferredLocale);
  response.headers.set("x-direction", preferredLocale === "fa" ? "rtl" : "ltr");

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

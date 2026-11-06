"""Security response headers for API responses.

The Next.js application sets its own page-level policy; this middleware covers
JSON, SSE, downloads, and other responses served directly by FastAPI.
"""

from __future__ import annotations

from backend.app.core.config import settings
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_DOC_PATHS = {"/docs", "/redoc", "/openapi.json"}

_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
        )
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")

        content_type = (response.headers.get("content-type") or "").lower()
        if (
            request.url.path not in _DOC_PATHS
            and content_type.startswith(("application/json", "text/event-stream", "text/plain"))
            and "content-security-policy" not in response.headers
        ):
            response.headers["Content-Security-Policy"] = _API_CSP

        forwarded_proto = (request.headers.get("x-forwarded-proto") or "").split(",", 1)[0].strip().lower()
        if settings.ENABLE_HSTS or request.url.scheme == "https" or forwarded_proto == "https":
            response.headers.setdefault(
                "Strict-Transport-Security",
                f"max-age={settings.HSTS_MAX_AGE_SECONDS}; includeSubDomains",
            )

        return response

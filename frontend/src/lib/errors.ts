/**
 * Plain-language error translation for customer-facing screens.
 *
 * Backend details (provider errors, SQL failures, stack messages) belong in
 * logs and admin diagnostics, never in front of a business user. Screens show
 * the friendly message; the raw detail stays on the error object for support.
 */

const MESSAGE_BY_STATUS: Record<number, string> = {
  400: "Something in that request wasn’t quite right. Please check and try again.",
  401: "Please sign in again to continue.",
  403: "You don’t have access to that resource.",
  404: "We couldn’t find that. It may have moved or been deleted.",
  409: "That conflicts with a change made elsewhere. Refresh and try again.",
  413: "That file is too large. Try a smaller file.",
  422: "Some of the details aren’t valid. Please check them and try again.",
  429: "Too many tries in a short time. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again.",
  502: "Part of the service didn’t respond. Please try again.",
  503: "The service is taking a short break. Please try again in a moment.",
  504: "That took too long. Please try again.",
};

// Markers of implementation detail that should never reach an end user.
const TECHNICAL_MARKERS = [
  "traceback",
  "exception",
  "sqlalchemy",
  "asyncpg",
  "psycopg",
  "sqlstate",
  "postgres",
  "database error",
  "stack trace",
  "internal server error",
  "httpx",
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
  "jina",
  "embedding",
  "vector",
  "chunk",
  "prompt",
  "upstream",
  "provider",
  "core api",
  "unexpected error",
  "status code",
  "errno",
  "econn",
];

const MAX_FRIENDLY_LENGTH = 300;

function looksTechnical(text: string): boolean {
  const lower = text.toLowerCase();
  return TECHNICAL_MARKERS.some((marker) => lower.includes(marker));
}

export function friendlyErrorMessage(
  rawDetail: unknown,
  status: number,
  fallback = "Something went wrong. Please try again."
): string {
  if (
    typeof rawDetail === "string" &&
    rawDetail.trim().length > 0 &&
    rawDetail.trim().length <= MAX_FRIENDLY_LENGTH &&
    !looksTechnical(rawDetail)
  ) {
    return rawDetail.trim();
  }
  return MESSAGE_BY_STATUS[status] || fallback;
}

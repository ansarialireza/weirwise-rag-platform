# Security Audit

Date: 2026-11-04
Scope: Platform API, admin authentication/authorization, tenant isolation, credential vault,
JWT handling, WebSocket auth, input validation, uploads, crawler SSRF, CORS, and secret leakage.
Method: live probes against `127.0.0.1:8010` (43 passing checks, 4 expected failures), plus code review.

## Result summary

**43/47 live checks passed.** The four failures are one genuine missing control (login rate limiting)
and three missing HTTP security headers, counted as four checks. Code review additionally identified
four hardening items that live probes could not exercise directly.

No scanned artifact contained a provider key, JWT secret, database password, or `.env` content.

## Passed controls

| Area | Check | Evidence |
|---|---|---|
| Admin authorization | Anonymous admin request rejected | 401 |
| Admin authorization | Malformed bearer rejected | 401 |
| Admin authorization | Non-admin rejected on providers, audit logs, users, metrics, finops, settings PATCH | 403 on all six |
| Admin authorization | Superuser retains access | 200 |
| Tenant isolation | 9 cross-tenant paths (workspace, projects, members, sources, assistants, assistant detail, documents, download, chat) | 404 on every path |
| Tenant isolation | Tenant-B workspace list excludes tenant A | 200, count = 1 |
| JWT | Expired token rejected | 401 |
| JWT | Wrong signature rejected | 401 |
| JWT | `alg=none` / unsigned token rejected | 401 |
| JWT | Claims include `iat`, `exp`, `jti`; decode pins the configured algorithm | code + probes |
| Credential vault | Stored credential is ciphertext, not plaintext | DB value `gAAAAA...` |
| Credential vault | Ciphertext decrypts through the vault | round-trip success |
| Credential masking | Provider list/detail/usage/events never return the full token | only masked prefixes |
| Secret redaction | Key-like strings removed from routing event errors | `sk-test` absent from event trail |
| SQL injection | Injection payload rejected at login | 422 (Pydantic validation) |
| SQL injection | Quoted/non-UUID path identifiers rejected | 422 |
| SQL injection | Admin list and routing filter remain healthy with quoted input | 200 |
| User enumeration | Unknown account returns the same generic error | 401 "Invalid email or password." |
| CORS | Unknown origin not reflected | no `Access-Control-Allow-Origin` |
| CORS | Configured frontend origin allowed | `http://127.0.0.1:3000` |
| Uploads | Path traversal stripped from filename (`../../etc/passwd.txt` -> `passwd.txt`) | live + unit |
| Uploads | Disallowed extension rejected | 400 for `.exe` |
| Core API | Requires an API key | 401 without key |
| Core API | Rejects a wrong API key | 401 |
| Voice WebSocket | Unauthenticated upgrade rejected before accept | HTTP 403 handshake |
| Voice WebSocket | Origin checked; JWT from HttpOnly cookie or `wwp-voice` subprotocol, never URL | code + probe |
| Cookies | Access and refresh cookies are HttpOnly, SameSite=Lax, `Secure` outside DEBUG | code + probe |
| Browser storage | Access token mirrored to `localStorage` for API calls (see F-05) | code |
| Password hashing | PBKDF2-HMAC-SHA256, 100,000 iterations, random salt, constant-time compare | code |
| Secret leakage | Repository scan and runtime logs contained no secret values | scan result |

## Findings

### F-01 — No login rate limiting or account lockout

**Severity:** Medium
**Evidence:** Eight consecutive failed logins for the same account all returned 401; no 429 and no
lockout. No limiter middleware exists on `POST /auth/login`.
**Impact:** Online password guessing and credential stuffing are unthrottled. PBKDF2 at 100k
iterations slows each guess but does not prevent a sustained attack.
**Recommendation:** Add per-IP and per-account sliding-window limits with exponential delay, return
429 with `Retry-After`, and log repeated failures for alerting. Consider CAPTCHA or temporary lockout
after a threshold.

### F-02 — Missing HTTP security headers

**Severity:** Medium
**Evidence:** Responses from the API lacked `X-Content-Type-Options`, `X-Frame-Options`,
`Content-Security-Policy`, and `Strict-Transport-Security`.
**Impact:** MIME sniffing, clickjacking of admin pages, and downgrade risk on non-HSTS deployments.
**Recommendation:** Add `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (or CSP
`frame-ancestors 'none'`), a restrictive CSP, and HSTS at the TLS terminator. Apply the same headers
in the Next.js layer.

### F-03 — Crawler follows redirects before validating the destination

**Severity:** Medium
**Evidence:** `backend/app/services/scraper.py:189` and `:343` set `follow_redirects=True`; the final
URL is validated only after the request completes (`scraper.py:192`).
**Impact:** A public URL can redirect to a private/link-local address, causing the server to fetch it
before the post-hoc check rejects the result. Response data is not returned to the user, but the
request itself is an SSRF primitive (internal port scanning, metadata endpoint reachability).
**Recommendation:** Disable automatic redirects and resolve/validate each `Location` hop manually
against `is_ssrf_safe_url` before following. Re-resolve DNS at connect time to reduce rebinding risk.

### F-04 — Uploads are buffered entirely in memory

**Severity:** Low
**Evidence:** `backend/app/services/storage.py:89-107` appends every 64 KB chunk to a list, then writes
the list at the end. The per-file cap is 50 MB.
**Impact:** Concurrent large uploads can exhaust worker memory and cause denial of service.
**Recommendation:** Stream chunks to a temporary file or object storage as they arrive, enforce the
size cap during streaming, and delete partial files on failure.

### F-05 — Access token stored in `localStorage`

**Severity:** Low
**Evidence:** `frontend/src/lib/api.ts:39-51` reads and writes `wwp_token` in `localStorage`, even
though the backend also sets HttpOnly cookies.
**Impact:** Any XSS on the origin can exfiltrate a bearer token with the user's full session lifetime.
**Recommendation:** Rely on the HttpOnly cookie for browser calls, keep tokens in memory only, and
return short-lived access tokens if a non-cookie client still needs them.

### F-06 — Weak password policy and no MFA

**Severity:** Low
**Evidence:** Registration/reset schemas require only 8 characters
(`backend/app/schemas/auth.py:27`); no complexity, breached-password, or MFA requirement exists.
**Impact:** Weak admin passwords undermine the otherwise strong authorization boundary.
**Recommendation:** Require at least 12 characters or a passphrase, check against a breached-password
list, and offer TOTP/passkey MFA for admin accounts.

### F-07 — Telemetry was disabled by configuration

**Severity:** Informational (fixed operationally)
**Evidence:** The batch telemetry endpoint returned 503 until the backend was restarted with
`REDIS_URL`; it now returns 202. This was an operational misconfiguration, not an exploitable defect.
**Recommendation:** Fail loudly at startup when telemetry is configured but Redis is unreachable.

## Tenant-isolation detail

Every cross-tenant path returned 404 rather than 403, which avoids disclosing whether the resource
exists. The 404s were consistent for read, download, and chat paths, and a tenant-B workspace list
did not include tenant A. This is the expected behaviour for an IDOR-safe design.

## Limitations

- Testing ran over loopback HTTP; TLS configuration, HSTS enforcement, and cookie `Secure` behaviour
  in production were not exercised.
- No third-party penetration test, dependency-vulnerability scan, or mobile-client review was
  performed.
- The XSS precondition for F-05 was not demonstrated; the finding is a blast-radius concern.
- Core was tested for API-key enforcement only; its internal service-to-service trust model was not
  fully audited.
- DNS-rebinding attacks against the crawler were not tested; F-03 covers redirect-based SSRF only.

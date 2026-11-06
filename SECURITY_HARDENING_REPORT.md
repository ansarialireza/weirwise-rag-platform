# Weirwise Security Hardening Report

Date: 2026-11-05
Scope: Platform API, public widget runtime, authentication, uploads, outbound fetching, credential storage, admin RBAC, dependency posture.
Environment: isolated QA database and QA accounts, real provider credentials for validation only. No production data, no customer documents, no secrets printed.

---

## 1. Controls added or verified in this pass

| # | Control | Implementation | Evidence |
|---|---|---|---|
| 1 | Atomic authentication rate limiting | Sliding window with Redis Lua scripts when Redis is configured; a threading-lock in-process fallback otherwise. Limits: 5 failures per account / 15 min, 50 global / hour, 50 per IP / 15 min, 200 attempts per IP | `25` concurrent attempts admitted exactly `5`; lockout returns 429 with `Retry-After`; a successful login clears counters |
| 2 | Public widget rate limiting | Config 240/min per IP; chat 60/min per IP and 600/min per deployment; bounded store (20,000 keys) | Live: 245 rapid config requests → exactly 240×200 and 5×429 (`Retry-After: 57`); chat 429 while an authenticated endpoint stayed 200 |
| 3 | Plain-language 429 | Customers see "Too many requests. Please try again shortly." (or "you're sending messages too quickly"); logs record scope and retry after only | Live response body and backend log |
| 4 | Identifier privacy in the limiter | Keys are `prefix:scope:SHA-256(identifier)[:32]`; raw IPs and emails are not stored in Redis keys or logs | Code inspection; log lines contain scope only |
| 5 | Production secret fail-fast | Startup rejects production/staging when `SECRET_KEY` is the public development default or shorter than 32 characters | `test_production_settings_reject_default_secret_key`; 48-character key accepted |
| 6 | Password policy | Minimum length, character-class diversity, common-password rejection; hashes are never plaintext | `test_password_policy_rejects_weak_passwords`, `test_password_policy_hashes_never_stored_plaintext` |
| 7 | Security headers | `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Permissions-Policy: microphone=(self)` | `test_security_headers_on_api_responses` |
| 8 | HSTS only over HTTPS | HSTS emitted when `X-Forwarded-Proto: https`; absent on plain HTTP | `test_security_headers_hsts_when_https_forwarded` |
| 9 | SSRF protection across redirects | Every redirect hop is validated; link-local metadata addresses are refused; redirect loops are bounded | Redirect to `169.254.169.254` blocked with only the original URL fetched; loop stopped after `max_redirects` |
| 10 | Streaming upload cap | File streamed in chunks with a hard size cap; partial `.upload-*` files removed on rejection | 4 KB upload against a 1 KB cap → 413 with no leftovers; SHA-256 matched the payload |
| 11 | Upload content validation (Core) | PDF magic `%PDF-`, DOCX `PK\x03\x04`, UTF-8 validation for text formats | Core ingestion tests; binary payloads rejected |
| 12 | Widget origin matching | Exact hostname match with explicit wildcard subdomains; no substring matching | `mycompany.com.attacker.net` rejected; `*.mycompany.com` accepted; empty/`*` allowlists allow any (documented) |
| 13 | Public session token required | Feedback and handoff require the `wws_...` token issued by public chat | `test_public_session_token_is_required_for_feedback_and_handoff` |
| 14 | Admin RBAC | Unauthenticated 401, non-admin 403 on every admin route | Live admin suite |
| 15 | Credential vault | Fernet encryption at rest; responses show only a masked prefix; plaintext not present in QA SQLite | Live validation and DB inspection |
| 16 | Tenancy isolation | Cross-tenant project/KB access returns not-found | Core and Platform functional audits |
| 17 | Secret hygiene in Git | Only ignored `.env` files; no tracked credential values | Git audit of both repositories |
| 18 | Trusted proxy default | `TRUST_PROXY_HEADERS=False`; client IP is not taken from spoofable headers unless explicitly enabled | Config and header-spoof tests |

All named tests live in `backend/tests/test_security_hardening.py`, `backend/tests/test_public_rate_limiting.py`, `backend/tests/test_security_and_lifecycle_hardening.py`, and are included in the suite result:

```
python -m pytest backend/tests -q
74 passed, 12 skipped in 159.09s
```

The 12 skips are Redis/live prerequisites, not security passes.

## 2. Threat coverage summary

| Threat | Covered | Residual risk |
|---|---|---|
| Credential stuffing / brute force | Account, IP and global sliding windows; lockout | Per-process without Redis; a multi-worker deployment needs Redis for a single global view |
| Widget key abuse / scraping | Per-IP and per-deployment limits | A distributed botnet with many IPs can still consume the per-deployment allowance |
| Origin bypass via look-alike domain | Exact hostname matching | A permitted wildcard is as broad as the admin configures it |
| SSRF via ingestion URL | Scheme/host checks on every hop | DNS rebinding after validation is not explicitly pinned |
| Malicious upload | Size cap, streaming, magic bytes, UTF-8 checks | No malware scanning; archive/ZIP bombs other than DOCX magic are not specially inspected |
| Secret leakage in responses/logs | Masked prefixes, sanitized errors, no tokens in URLs | No external log-redaction audit |
| Token forgery | Strong secret required outside development | Rotation/revocation not exercised |
| XSS in embed | CSP frame-ancestors and API JSON responses | No nonce-based CSP or third-party script review |
| Dependency compromise | Audit performed | Known critical/high advisories remain unfixed (below) |

## 3. Open security findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| S-01 | **Critical** | `next` installed at 14.2.35; `npm audit --omit=dev` reports 1 critical (Windows-hosted RCE, image-optimizer and server-function advisories) | **OPEN — production blocker**; the available fix is the breaking upgrade to `next@16.4.5`, which requires a full build/browser regression pass. Not performed autonomously |
| S-02 | High | `postcss <= 8.5.22` advisory (transitive build dependency) | OPEN with S-01; resolved by the same upgrade path |
| S-03 | Medium | Rate limits, routing state and budgets are per process when Redis is absent | OPEN; requires Redis for multi-worker correctness |
| S-04 | Low | Public config endpoint does not validate an invalid widget key or allowed origin; it returns generic branding (no prompt, no knowledge, no conversation) | Documented asymmetry; chat enforces both. Rate-limited to 240/min per IP |
| S-05 | Low | Dev split-origin setup (`127.0.0.1` API vs `localhost` UI) breaks refresh-cookie restore on hard reload | Environment artifact; same-origin production not tested |
| S-06 | Info | No external penetration test or third-party audit was performed | OPEN |
| S-07 | Info | No MFA, no session revocation list, no secret rotation drill | Not in scope of this pass |

## 4. Verification notes

- The rate limiter's live check was performed with `Retry-After` returned as a positive integer and a plain-language body; no identifier appeared in the log line.
- The security headers are applied to API responses including health endpoints; the HSTS header is conditional on a trusted HTTPS indication.
- Upload rejection cleans partial files before returning 413; the same test verifies the stored SHA-256 for a successful upload.
- The SSRF tests assert the exact set of URLs requested, not just the final response, so an intermediate redirect cannot be fetched unnoticed.
- No secret was printed during this work. The repository audit found only ignored `.env` files.

## 5. Conclusion

The application-level security posture is materially stronger than the baseline audit: anonymous traffic is bounded, authentication is atomically rate-limited and locked out, uploads are streamed and validated, redirect SSRF is closed, production refuses a public JWT secret, and public conversation access requires an issued session token.

It is **not** production-ready because of the unresolved critical Next.js advisory, the absence of a shared rate-limit/routing store for multi-worker deployments, and the lack of an external penetration test. The Next.js upgrade is the highest-priority security item; it is deliberately not performed here because it is a breaking framework change that requires a separate regression campaign.

# Platform Security Controls and Boundaries

> **Status:** Implementation-oriented guidance checked against source on November 10, 2026. This is
> not a certification, penetration-test report, or production configuration statement.

## Authentication and authorization

- Dashboard dependencies accept a signed Bearer access token or the `access_token` cookie and
  resolve an active `User`.
- Passwords use PBKDF2-HMAC-SHA256 with a per-password random salt. Refresh/reset/verification
  tokens and Platform API keys are stored as SHA-256 hashes.
- Platform API credentials are user-owned and scope-checked. Public runtime separately supports
  published share access, widget deployment keys, and user-issued API credentials.
- Protected resource queries must include server-side ownership predicates. There is no persisted
  Workspace principal/Membership relation or database row-level security; workspace-named
  auxiliary records are user-keyed. Do not describe Platform authorization as workspace RBAC or
  PostgreSQL RLS.

## Credential handling

- Provider and business-integration credentials are encrypted with Fernet in
  `backend/app/services/vault.py`. The Fernet key is derived from `SECRET_KEY`; it is not a
  separately versioned/rotatable key in the inspected implementation.
- Platform API credentials are hashed, whereas deployment `public_key` values are stored for
  widget runtime use. Do not treat a public widget key as a dashboard credential.
- Keep secrets server-side, redact them from logs/errors, do not return decrypted values from
  routes, and use `.env.example` only as the configuration reference.
- Do not claim independent key rotation, customer-managed provider keys, or a particular
  cryptographic storage service unless implemented and configured.

## Uploads, crawling, and public runtime

- Upload handling applies configured extension and size limits and stores files outside the
  frontend bundle. Keep upload paths non-executable and preserve cleanup behavior.
- Crawler entry points call the Platform URL-safety checks. Re-check the current scraper
  implementation before making claims about DNS rebinding, redirect, or egress guarantees.
- Widget-key requests validate the deployment and allowed hostname. Public configuration/chat
  routes also apply rate limits; Redis-backed limits have an in-process fallback. Share-link
  access is distinct from widget-key origin enforcement.
- Continue to test unauthorized IDs, cross-user access, credential masking, upload limits, and
  public rate-limit behavior at the owning boundary.

## Data, operations, and claims

- Platform and Core use separate APIs, databases, and credentials. Never access Core persistence
  directly or share its ORM models.
- Audit and usage tables exist, but their presence alone does not establish a complete immutable
  audit trail, data-retention guarantee, compliance certification, or encryption-at-rest for the
  entire database.
- Environment defaults are for development. Verify production settings, cookie attributes, proxy
  trust, CORS, HSTS, encryption keys, rate-limit backend, storage permissions, and provider
  credentials before deployment.
- Do not commit credentials, customer data, runtime databases, uploads, or generated reports.

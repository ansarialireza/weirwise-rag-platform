# Weirwise Platform Security Architecture & Threat Model

## 1. Multi-Tenant Isolation & Authorization

1. **Workspace Boundary Enforcement:**
   - Every protected route resolves current user authentication, loads the target workspace context, and verifies `Membership` role.
   - Database queries strictly enforce workspace/project scoping:
     ```python
     # Example platform query invariant:
     query = select(Assistant).where(
         Assistant.id == assistant_id,
         Assistant.project_id == current_project_id
     )
     ```
2. **Horizontal Privilege Escalation Prevention:**
   - IDs are random UUIDv4 identifiers.
   - Resource ownership is verified on the server side prior to any mutation or read.

---

## 2. Credential & Secret Management

1. **Platform API Keys:**
   - Raw keys format: `wwp_live_<32-byte-hex>` or `wwp_test_<32-byte-hex>`.
   - Never stored in plaintext. Platform stores only `SHA-256(key + salt)`.
   - Visible to the user only once upon creation.
2. **Third-Party & Core API Secrets:**
   - Stored encrypted at rest using AES-GCM (256-bit) with key rotation support.
   - Environment variables loaded securely; never committed to git or exposed in client bundles.
3. **Audit Logging:**
   - Security-sensitive actions (API key creation, member invitation, role escalation, deletion of knowledge bases) produce persistent `AuditEvent` records with caller IP, timestamp, and metadata.
   - Content and prompts are redacted from audit entries.

---

## 3. Data Ingestion & Network Hardening

1. **File Upload Security:**
   - Strictly enforced MIME type whitelisting (PDF, DOCX, TXT, MD, CSV, JSON).
   - Magic bytes verification to prevent executable file masking.
   - Enforced maximum file size limit (configurable, default 50 MB).
   - Files stored in isolated object storage buckets with randomized UUID paths; direct execution paths are blocked.
2. **SSRF & Web Scraper Protection:**
   - Prohibit requests resolving to RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback (`127.0.0.0/8`), or link-local cloud metadata endpoints (`169.254.169.254`).
   - Restrict protocols to `http` and `https`.
   - Set strict connection timeouts and redirect caps.

---

## 4. Public Deployments & Widget Hardening

1. **Embedded Widget Tokens:**
   - Embeddable web chat widgets authenticate using scoped, restricted deployment tokens.
   - Tokens can only invoke conversation turn endpoints on the designated `Assistant`.
   - Domain whitelisting (CORS / HTTP Referer / Origin header checks) enforced on widget endpoints.
   - Rate limiting per IP and per session prevents denial-of-wallet and quota exhaustion.

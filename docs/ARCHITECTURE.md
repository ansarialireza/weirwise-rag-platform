# Weirwise Business Platform Architecture (v2.0)

This document describes the architectural additions that evolve the Weirwise RAG platform into a business platform for building, deploying, managing, monitoring, and continuously improving AI assistants grounded in business knowledge.

---

## 1. High-Level Architecture Overview

```
                                  +-----------------------+
                                  |   Embeddable Widget   |
                                  |   (iframe / JS SDK)   |
                                  +-----------+-----------+
                                              | HTTPS
                                              v
+------------------------+        +-----------+-----------+        +------------------------+
| Business Management UI | <----> |   Public Runtime API  | <----> | Tenant / Workspace Core|
| (Next.js Dashboard)    |        | (/api/v1/public/*)    |        | (FastAPI + SQLAlchemy) |
+------------------------+        +-----------+-----------+        +------------------------+
            |                                 |                                 |
            v                                 v                                 v
+------------------------+        +-----------+-----------+        +------------------------+
| Integration Manager    |        | RAG Engine & Core API |        | Metering, Quotas &     |
| (Shopify/Zendesk/Vault)|        | (Jina AI Embeddings)  |        | Enterprise Controls    |
+------------------------+        +-----------------------+        +------------------------+
            |                                 |                                 |
            +---------------------------------+---------------------------------+
                                              |
                                              v
                               +-----------------------------+
                               | PostgreSQL 16 + pgvector    |
                               | (Multi-tenant, Encrypted)   |
                               +-----------------------------+
```

---

## 2. Platform Capabilities by Phase

### Phase 1 — Activation & Deployment
- **SSRF-Resilient Website Crawler & Sitemap Parser** (`backend/app/services/scraper.py`):
  - Strict host, IP, and scheme validation guarding against loopback, private RFC-1918, link-local, AWS/GCP/Azure cloud metadata (`169.254.169.254`), and DNS rebinding attacks.
  - Safe XML parser for sitemaps and sitemap index files.
  - Discovered URLs deduplicated and presented for selective ingestion.
- **Publishing Lifecycle & Embeddable Widget** (`backend/app/api/v1/public_runtime.py`, `frontend/src/app/embed/[assistantId]/page.tsx`):
  - Pre-flight publication checks (`/publish-readiness`) verifying knowledge sources and readiness before generating public widget credentials.
  - Public runtime endpoints allowing anonymous or customer-authenticated interactions without exposing private API keys or workspace credentials.
  - Responsive standalone widget iframe and custom element loader supporting dynamic theming, avatar, fallback responses, and live citations.

### Phase 2 — Trust & Intelligence
- **Conversation & Message Grounding Inspection**:
  - Full audit trail of customer sessions, messages, and citations linking back to original ingested document chunks.
- **Thumbs Feedback & Knowledge Gap Analytics** (`backend/app/services/evaluations.py`, `backend/app/api/v1/assistants.py`):
  - End-user thumbs up/down rating with qualitative reason captures.
  - Unanswered query clustering and automated knowledge gap identification.
- **Golden Evaluation Cases**:
  - Ground truth test cases (`EvaluationCase`) executed deterministically against assistant versions to compute fact-recall accuracy before and after knowledge changes.
- **Human Handoff & Escalation**:
  - Escalation state capture (`HumanHandoffRequest`) collecting visitor email/phone and alerting workspace staff via webhook or escalation email.

### Phase 3 — Business Integrations & Webhooks
- **Fernet Encrypted Credential Vault** (`backend/app/services/integrations.py`):
  - Secure credential storage for Shopify, Zendesk, Gorgias, Google Drive, Notion, and HubSpot.
  - Cryptographic token masking (`shpat_****`, `zd_****`) across all administrative API responses.
- **HMAC-SHA256 Signed Outbound Webhooks** (`backend/app/services/webhooks.py`):
  - Dispatches event payloads to Zapier, Make, n8n, or internal business microservices.
  - Headers include `X-Weirwise-Signature: t={timestamp},v1={hmac_sha256}` with replay attack mitigation (5-minute drift window).
  - Outbound destination URLs undergo SSRF safety checks before HTTP dispatch.

### Phase 4 — Monetization & Entitlements
- **Centralized Metering Engine** (`backend/app/services/metering.py`):
  - Enforces tier quotas across Free (2 assistants, 100 turns/mo), Starter (5 assistants, 2,000 turns/mo), Pro (25 assistants, 10,000 turns/mo), and Enterprise.
  - Real-time limit checking preventing assistant creation or chat turns when monthly quota is exhausted without overage permission.
  - Granular `UsageEvent` recording for FinOps analysis.

### Phase 5 — Enterprise Readiness
- **BYOK (Bring Your Own Key) & Azure OpenAI Endpoints** (`backend/app/api/v1/enterprise.py`):
  - Per-workspace encrypted LLM credentials (OpenAI, Azure OpenAI deployment name, resource URL, API version).
- **Automated Data Retention & Pruning** (`backend/app/services/retention.py`):
  - Background retention pruner purging inactive conversations and audit logs past workspace-configured retention thresholds (e.g. 90 days).
- **Audit Logging & RBAC Guardrails**:
  - Granular RBAC (`owner`, `admin`, `member`, `viewer`) guarding configuration, publishing, integrations, and enterprise keys.

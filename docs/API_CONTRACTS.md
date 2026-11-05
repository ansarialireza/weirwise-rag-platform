# Weirwise API Contracts (v2.0)

This specification defines the public runtime endpoints, webhook contracts, and enterprise APIs.

---

## 1. Public Runtime API (For Embed Widgets)

Both public endpoints accept one of three access modes:

| Mode | Header | Use |
|---|---|---|
| Share link | none | A published assistant opened directly. |
| Website widget | `X-Widget-Key: <deployment public_key>` | Browser embeds. Enforces the deployment's allowed domains against `Origin`/`Referer`. |
| Server integration | `X-API-Key: <workspace API key>` | Backend-to-backend. Workspace-scoped; bypasses browser domain rules. |

API keys are created with workspace owner/admin rights and carry `assistants:read` and/or `assistants:chat` scopes. Config requires `assistants:read`; chat requires `assistants:chat`. Raw keys are returned once at creation and are never retrievable again.

### GET `/api/v1/public/assistants/{assistant_id}/config`
Retrieves public branding, communication settings, and visual themes for a published assistant.

**Headers:** `X-Widget-Key` or `X-API-Key` (optional), `Origin` (validated when a widget key is used).

**Response (200 OK):**
```json
{
  "assistant_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "name": "Acme Support Bot",
  "language": "en",
  "tone": "friendly",
  "welcome_message": "Hello! How can I help today?",
  "placeholder_text": "Ask us a question...",
  "primary_color": "#1B4D3E",
  "position": "bottom-right",
  "show_branding": true,
  "allowed_domains": ["acme.com"]
}
```

---

### POST `/api/v1/public/assistants/{assistant_id}/chat`
Interacts with the grounded assistant in real-time.

**Request Body:**
```json
{
  "conversation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", // optional, generated if omitted
  "message": "What is the return policy?",
  "visitor_id": "anon_user_12345"
}
```

**Response (200 OK):**
```json
{
  "conversation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "message_id": "c73a24e2-6e2c-471f-a5b6-70e0f808beec",
  "content": "Items can be returned within 30 days of receipt in original condition.",
  "is_grounded": true,
  "citations": [
    {
      "source_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "document_name": "Return_Policy_2026.pdf",
      "snippet": "All customers are entitled to a full refund within 30 days...",
      "score": 0.89
    }
  ]
}
```

---

### POST `/api/v1/public/messages/{message_id}/feedback`
Records thumbs up or thumbs down feedback for quality tracking.

**Request Body:**
```json
{
  "rating": -1, // 1 for thumbs up, -1 for thumbs down
  "reason": "Outdated information regarding return shipping fees"
}
```

---

### POST `/api/v1/public/conversations/{conversation_id}/handoff`
Requests escalation to a human agent when the assistant is unable to resolve an inquiry.

**Request Body:**
```json
{
  "contact_info": "customer@example.com",
  "reason": "Requires manual order status lookup"
}
```

---

## 1.1 Deployment & API Key Management (Dashboard Auth)

All endpoints below require a dashboard bearer token.

| Endpoint | Description |
|---|---|
| `GET /api/v1/assistants/{assistant_id}/deployments` | List deployments and public widget keys. |
| `POST /api/v1/assistants/{assistant_id}/deployments` | Create a deployment with `name`, `deployment_type`, `allowed_domains`, `theme_config`. |
| `PATCH /api/v1/assistants/{assistant_id}/deployments/{deployment_id}` | Update `allowed_domains`, `theme_config`, `name`, or `is_active` without rotating the public key. |
| `GET /api/v1/workspaces/{workspace_id}/api-credentials` | List API keys (prefix and status only). Owner/admin. |
| `POST /api/v1/workspaces/{workspace_id}/api-credentials` | Create an API key. The raw key is returned once. Owner/admin. |
| `DELETE /api/v1/workspaces/{workspace_id}/api-credentials/{credential_id}` | Revoke a key immediately. Idempotent. Owner/admin. |

`allowed_domains` accepts exact hosts and `*.example.com` wildcard subdomains. An empty list (or `["*"]`) allows every website. Matching is hostname-exact to prevent lookalike-domain bypasses.

### Website widget loader

`/widget.js` is a dependency-free loader served by the platform. It reads:

```html
<script src="https://<platform-host>/widget.js"
        data-assistant-id="<uid>"
        data-key="<deployment public key>"
        data-position="bottom-right"
        data-color="#1B4D3E"
        data-label="Open chat"
        defer></script>
```

The loader renders an accessible floating launcher inside a shadow root, lazily creates the `/embed/{assistant_id}` iframe on first open, closes on `Escape`, restores focus, and exposes `window.WeirwiseWidget.open()/close()`.

---

## 2. Outbound Webhook Signature Contract

Weirwise dispatches webhook events to user-configured webhook URLs (Zapier, n8n, internal webhooks).

### Webhook Headers
```http
POST https://customer-server.example.com/webhook
Content-Type: application/json
X-Weirwise-Event: handoff.requested
X-Weirwise-Timestamp: 1730363800
X-Weirwise-Signature: t=1730363800,v1=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

### Signature Verification Algorithm
```python
import hmac, hashlib

expected_sig = hmac.new(
    webhook_secret.encode("utf-8"),
    f"{timestamp}.{request_body_string}".encode("utf-8"),
    hashlib.sha256
).hexdigest()

assert hmac.compare_digest(v1_signature, expected_sig)
```

---

## 3. Knowledge Ingestion & Crawler Discovery

### POST `/api/v1/projects/{project_id}/crawler/discover`
Discovers sitemaps and recursively crawls web pages with SSRF prevention.

**Request Body:**
```json
{
  "start_url": "https://example.com",
  "max_pages": 25,
  "respect_robots": true
}
```

**Response (200 OK):**
```json
{
  "target_url": "https://example.com",
  "discovered_count": 12,
  "pages": [
    {"url": "https://example.com/about", "title": "About Us", "status": "discovered"},
    {"url": "https://example.com/faq", "title": "Frequently Asked Questions", "status": "discovered"}
  ]
}
```

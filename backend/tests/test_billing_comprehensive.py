"""Comprehensive Integration & Security Test Suite for Billing Engine & Rampex."""

import hashlib
import hmac
import json
import uuid
from unittest.mock import AsyncMock, patch

from backend.app.main import app
from backend.app.services.billing_engine import billing_engine
from backend.app.services.payment_provider import PaymentCreationResult
from backend.app.services.rampex_provider import RampexProvider, generate_qr_svg
from fastapi.testclient import TestClient

client = TestClient(app)


def test_qr_code_svg_generation():
    """Verify standalone pure-python QR code SVG generation without external binaries."""
    url = "https://checkout.rampex.io/pay.php?link=test_123"
    svg = generate_qr_svg(url)
    assert svg.startswith("<svg")
    assert svg.endswith("</svg>")
    assert "viewBox" in svg
    assert 'fill="currentColor"' in svg


def test_rampex_provider_signature_verification():
    """Test HMAC-SHA256 signature verification with constant-time equality."""
    secret = "test_webhook_secret_key_12345"
    provider = RampexProvider(webhook_secret=secret)

    raw_body = b'{"event":"payment.completed","link_id":"test-link-1","amount":29.00}'
    valid_sig = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Valid signature
    assert provider.verify_webhook_signature(raw_body, {"x-rampex-signature": valid_sig}) is True
    assert provider.verify_webhook_signature(raw_body, {"X-Webhook-Signature": valid_sig}) is True

    # Invalid signature
    assert provider.verify_webhook_signature(raw_body, {"x-rampex-signature": "wrong_signature"}) is False

    # Empty signature header
    assert provider.verify_webhook_signature(raw_body, {}) is False


def test_plans_seeding_and_public_api():
    """Test that default plans are dynamically seeded and served publicly."""
    resp = client.get("/api/v1/plans")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 4
    plan_codes = [p["code"] for p in data]
    assert "free" in plan_codes
    assert "starter" in plan_codes
    assert "pro" in plan_codes
    assert "enterprise" in plan_codes

    starter = next(p for p in data if p["code"] == "starter")
    assert starter["monthly_price"] == 29.0
    assert starter["max_assistants"] == 10
    assert starter["max_documents"] == 100
    assert starter["max_chat_turns_monthly"] == 2500


def test_checkout_and_webhook_full_lifecycle():
    """Full journey: register, create checkout order, mock Rampex payment, trigger webhook, unlock quotas."""
    uid = uuid.uuid4().hex[:8]
    email = f"billing_e2e_{uid}@example.com"

    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Billing E2E User"},
    )
    assert reg.status_code == 201

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": f"Billing Corp {uid}", "slug": f"billing-corp-{uid}"},
        headers=headers,
    )
    assert ws_res.status_code == 201
    ws_id = ws_res.json()["id"]

    # 1. Create Checkout Order
    mock_creation_res = PaymentCreationResult(
        provider="rampex",
        provider_payment_id=f"rpx_link_{uid}",
        payment_url=f"https://checkout.rampex.io/pay.php?link=rpx_link_{uid}",
        payment_address="0xAd428a0F7b28A862E299B2F1cc8673c171667f26",
        qr_code_svg="<svg>mock_qr</svg>",
        status="waiting_for_payment",
        raw_response={"link_id": f"rpx_link_{uid}"},
    )

    with patch.object(RampexProvider, "create_payment", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = mock_creation_res

        checkout_resp = client.post(
            f"/api/v1/workspaces/{ws_id}/billing/checkout",
            json={"plan_code": "pro", "billing_cycle": "monthly"},
            headers=headers,
        )
        assert checkout_resp.status_code == 200
        ch_data = checkout_resp.json()
        assert ch_data["plan_name"] == "Pro"
        assert ch_data["amount"] == 49.0
        assert ch_data["payment_method"] == "cryptocurrency"
        assert "provider_payment_id" not in ch_data
        assert "provider" not in ch_data
        order_id = ch_data["order_id"]
        order_number = ch_data["order_number"]

    # 2. Check pending status
    status_resp = client.get(
        f"/api/v1/workspaces/{ws_id}/billing/orders/{order_id}/status",
        headers=headers,
    )
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "waiting_for_payment"
    assert status_resp.json()["is_subscription_active"] is False

    # 3. Simulate Rampex Webhook with Valid Signature
    webhook_secret = "test_rampex_secret_key"
    rp = RampexProvider(api_key="test_key", webhook_secret=webhook_secret)
    billing_engine.register_provider(rp)

    payload_dict = {
        "event": "payment.completed",
        "link_id": f"rpx_link_{uid}",
        "woo_order_id": order_number,
        "status": "completed",
        "amount": 49.00,
        "currency": "USD",
        "received_amount": 49.00,
        "received_currency": "USDC",
        "transaction_hash": "0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b",
        "paid_at": "2026-11-08T10:00:00Z",
    }
    raw_body = json.dumps(payload_dict).encode("utf-8")
    sig = hmac.new(webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Invalid signature test
    bad_hook = client.post(
        "/api/v1/webhooks/rampex",
        content=raw_body,
        headers={"X-Rampex-Signature": "invalid_sig", "Content-Type": "application/json"},
    )
    assert bad_hook.status_code == 401

    # Valid signature test
    good_hook = client.post(
        "/api/v1/webhooks/rampex",
        content=raw_body,
        headers={"X-Rampex-Signature": sig, "Content-Type": "application/json"},
    )
    assert good_hook.status_code == 200
    assert good_hook.json()["success"] is True

    # Duplicate webhook test (idempotency)
    dup_hook = client.post(
        "/api/v1/webhooks/rampex",
        content=raw_body,
        headers={"X-Rampex-Signature": sig, "Content-Type": "application/json"},
    )
    assert dup_hook.status_code == 200
    assert dup_hook.json()["result"]["status"] == "already_processed"

    # 4. Verify checkout status updated to completed & subscription active
    post_status_resp = client.get(
        f"/api/v1/workspaces/{ws_id}/billing/orders/{order_id}/status",
        headers=headers,
    )
    assert post_status_resp.status_code == 200
    st_json = post_status_resp.json()
    assert st_json["status"] == "completed"
    assert st_json["is_subscription_active"] is True
    assert st_json["blockchain_txid"] == "0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b"

    # 5. Verify Workspace Billing Overview & Entitlements
    b_overview = client.get(
        f"/api/v1/workspaces/{ws_id}/billing",
        headers=headers,
    )
    assert b_overview.status_code == 200
    bo = b_overview.json()
    assert bo["plan_code"] == "pro"
    assert bo["monthly_price"] == 49.0
    assert bo["chat_turns_limit"] == 10000
    assert bo["assistants_limit"] == 25
    assert bo["documents_limit"] == 500

    # 6. Verify Billing Invoices
    inv_resp = client.get(
        f"/api/v1/workspaces/{ws_id}/billing/invoices",
        headers=headers,
    )
    assert inv_resp.status_code == 200
    invoices = inv_resp.json()
    assert len(invoices) >= 1
    assert invoices[0]["amount"] == 49.0
    assert invoices[0]["status"] == "paid"

from unittest.mock import AsyncMock, patch

from backend.app.main import app
from backend.app.services.payment_provider import PaymentCreationResult
from backend.app.services.rampex_provider import RampexProvider
from fastapi.testclient import TestClient

client = TestClient(app)


def test_customer_checkout_api_response_sanitization():
    """Verify that sensitive provider/technical fields are never exposed in customer billing API."""
    import uuid

    uid = uuid.uuid4().hex[:6]
    email = f"cust_sec_{uid}@example.com"
    pwd = "SecurePassword123!"

    # Register & verify
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
    assert reg.status_code == 201
    otp = reg.json().get("verification_otp")
    if otp:
        client.post("/api/v1/auth/verify-email", json={"email": email, "otp": otp})

    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    mock_creation = PaymentCreationResult(
        provider="rampex",
        provider_payment_id="secret_internal_link_999",
        payment_url="https://checkout.rampex.io/pay.php?link=secret_internal_link_999",
        payment_address="0x1234567890abcdef1234567890abcdef12345678",
        qr_code_svg="<svg>mock</svg>",
        status="waiting_for_payment",
        raw_response={"secret_token": "SUPER_SECRET_KEY_NEVER_LEAK"},
    )

    with patch.object(RampexProvider, "create_payment", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = mock_creation
        res = client.post(
            "/api/v1/billing/checkout",
            json={"plan_code": "pro", "billing_cycle": "monthly"},
            headers=headers,
        )
        assert res.status_code == 200
        data = res.json()

        # Security Assertions: Sensitive internals must NOT be present
        forbidden_keys = [
            "provider",
            "provider_payment_id",
            "webhook_secret",
            "api_key",
            "raw_response",
            "secret_token",
            "stack_trace",
        ]
        for key in forbidden_keys:
            assert key not in data, f"Security violation: '{key}' exposed in customer checkout response!"

        # Customer required fields must be present
        assert "order_id" in data
        assert "order_number" in data
        assert "plan_name" in data
        assert "amount" in data
        assert "currency" in data
        assert "status" in data
        assert "payment_method" in data
        assert "payment_address" in data

        order_id = data["order_id"]

        # Check status endpoint
        st_res = client.get(
            f"/api/v1/billing/orders/{order_id}/status",
            headers=headers,
        )
        assert st_res.status_code == 200
        st_data = st_res.json()
        for key in forbidden_keys:
            assert key not in st_data, f"Security violation: '{key}' exposed in customer status response!"
        assert "plan_name" in st_data
        assert "payment_method" in st_data
        assert "is_subscription_active" in st_data

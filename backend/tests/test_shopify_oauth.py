import hashlib
import hmac
import uuid
from datetime import UTC, datetime
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from backend.app.core.config import settings
from backend.app.services.shopify import (
    ShopifyOAuthError,
    create_authorization_url,
    exchange_authorization_code,
    normalize_shop_domain,
    verify_callback_parameters,
)


@pytest.fixture
def shopify_settings(monkeypatch):
    monkeypatch.setattr(settings, "SHOPIFY_API_KEY", "test-client-id")
    monkeypatch.setattr(settings, "SHOPIFY_API_SECRET", "test-client-secret")
    monkeypatch.setattr(
        settings,
        "SHOPIFY_REDIRECT_URI",
        "https://api.example.test/api/v1/integrations/shopify/oauth/callback",
    )
    monkeypatch.setattr(settings, "SHOPIFY_FRONTEND_RETURN_URL", "https://app.example.test/settings")
    monkeypatch.setattr(settings, "SHOPIFY_SCOPES", "read_products")
    monkeypatch.setattr(settings, "SHOPIFY_OAUTH_STATE_TTL_SECONDS", 600)
    monkeypatch.setattr(settings, "ALLOWED_ORIGINS", ["https://app.example.test"])


def _signed_callback(params: dict[str, str]) -> list[tuple[str, str]]:
    message = "&".join(f"{key}={value}" for key, value in sorted(params.items()))
    digest = hmac.new(b"test-client-secret", message.encode("utf-8"), hashlib.sha256).hexdigest()
    return [*params.items(), ("hmac", digest)]


def test_authorization_url_uses_server_config_and_signed_state(shopify_settings):
    user_id = uuid.uuid4()

    url = create_authorization_url("sample-shop.myshopify.com", user_id)
    parsed = urlsplit(url)
    query = parse_qs(parsed.query)

    assert parsed.scheme == "https"
    assert parsed.netloc == "sample-shop.myshopify.com"
    assert parsed.path == "/admin/oauth/authorize"
    assert query["client_id"] == ["test-client-id"]
    assert query["scope"] == ["read_products"]
    assert query["redirect_uri"] == ["https://api.example.test/api/v1/integrations/shopify/oauth/callback"]
    claims = verify_callback_parameters(
        _signed_callback(
            {
                "code": "single-use-code",
                "shop": "sample-shop.myshopify.com",
                "state": query["state"][0],
                "timestamp": str(int(datetime.now(UTC).timestamp())),
            }
        )
    )
    assert claims["user_id"] == user_id


def test_authorization_url_normalizes_configured_scopes(shopify_settings, monkeypatch):
    monkeypatch.setattr(settings, "SHOPIFY_SCOPES", " write_products, read_products ")
    query = parse_qs(urlsplit(create_authorization_url("sample.myshopify.com", uuid.uuid4())).query)

    assert query["scope"] == ["read_products,write_products"]


@pytest.mark.parametrize(
    "shop",
    [
        "sample-shop.myshopify.com.attacker.example",
        "sample-shop.myshopify.com/path",
        "https://sample-shop.myshopify.com",
        "-sample.myshopify.com",
        "sample-.myshopify.com",
    ],
)
def test_shop_domain_rejects_noncanonical_hosts(shop):
    with pytest.raises(ShopifyOAuthError, match="invalid_shop"):
        normalize_shop_domain(shop)


def test_callback_rejects_tampered_hmac_and_duplicate_parameters(shopify_settings):
    user_id = uuid.uuid4()
    state = parse_qs(urlsplit(create_authorization_url("sample.myshopify.com", user_id)).query)
    params = {
        "code": "single-use-code",
        "shop": "sample.myshopify.com",
        "state": state["state"][0],
        "timestamp": str(int(datetime.now(UTC).timestamp())),
    }

    signed = _signed_callback(params)
    signed[-1] = ("hmac", "0" * 64)
    with pytest.raises(ShopifyOAuthError, match="invalid_callback"):
        verify_callback_parameters(signed)

    with pytest.raises(ShopifyOAuthError, match="invalid_callback"):
        verify_callback_parameters([*_signed_callback(params), ("shop", "other.myshopify.com")])


@pytest.mark.asyncio
async def test_code_exchange_requests_expiring_offline_token_and_checks_scopes(shopify_settings):
    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, data):
            assert url == "https://sample.myshopify.com/admin/oauth/access_token"
            assert data["expiring"] == "1"
            assert data["client_id"] == "test-client-id"
            assert data["client_secret"] == "test-client-secret"
            return httpx.Response(
                200,
                json={
                    "access_token": "access-token",
                    "refresh_token": "refresh-token",
                    "expires_in": 3600,
                    "refresh_token_expires_in": 7776000,
                    "scope": "read_products",
                },
            )

    with patch("backend.app.services.shopify.httpx.AsyncClient", return_value=MockClient()):
        credentials, scopes = await exchange_authorization_code("sample.myshopify.com", "single-use-code")

    assert credentials["access_token"] == "access-token"
    assert credentials["refresh_token"] == "refresh-token"
    assert "access_token_expires_at" in credentials
    assert scopes == {"read_products"}


@pytest.mark.asyncio
async def test_code_exchange_rejects_missing_required_scope(shopify_settings):
    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, data):
            return httpx.Response(
                200,
                json={
                    "access_token": "access-token",
                    "refresh_token": "refresh-token",
                    "expires_in": 3600,
                    "refresh_token_expires_in": 7776000,
                    "scope": "read_content",
                },
            )

    with patch("backend.app.services.shopify.httpx.AsyncClient", return_value=MockClient()):
        with pytest.raises(ShopifyOAuthError, match="missing_scopes"):
            await exchange_authorization_code("sample.myshopify.com", "single-use-code")

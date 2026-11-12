import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from urllib.parse import urlsplit

import httpx
import pytest
from backend.app.api.v1.integrations import trigger_integration_sync
from backend.app.api.v1.knowledge import create_knowledge_source
from backend.app.core.config import settings
from backend.app.models.project import KnowledgeSourceType
from backend.app.schemas.knowledge import KnowledgeSourceCreateRequest
from backend.app.services.shopify_catalog import (
    ShopifyCatalogError,
    fetch_shopify_products,
    render_product_catalog,
)
from backend.app.tasks.shopify_catalog import _get_or_create_source
from fastapi import HTTPException


@pytest.fixture
def shopify_catalog_settings(monkeypatch):
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
    monkeypatch.setattr(settings, "SHOPIFY_API_VERSION", "2026-10")
    monkeypatch.setattr(settings, "SHOPIFY_MAX_PRODUCTS", 100)
    monkeypatch.setattr(settings, "ALLOWED_ORIGINS", ["https://app.example.test"])


def _credentials(expiry: datetime | None = None) -> dict[str, str]:
    expires_at = expiry or datetime.now(UTC) + timedelta(hours=1)
    return {
        "access_token": "access-token",
        "refresh_token": "refresh-token",
        "access_token_expires_at": expires_at.isoformat(),
        "refresh_token_expires_at": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
    }


def _page(edges, has_next: bool = False, end_cursor: str | None = None) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "data": {
                "products": {
                    "edges": edges,
                    "pageInfo": {"hasNextPage": has_next, "endCursor": end_cursor},
                }
            }
        },
    )


@pytest.mark.asyncio
async def test_catalog_fetch_paginates_and_uses_the_configured_api_version(shopify_catalog_settings):
    pages = [
        _page(
            [{"cursor": "cursor-1", "node": {"id": "gid://shopify/Product/1", "title": "First"}}],
            has_next=True,
            end_cursor="cursor-1",
        ),
        _page([{"cursor": "cursor-2", "node": {"id": "gid://shopify/Product/2", "title": "Second"}}]),
    ]

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, json, headers):
            assert urlsplit(url).path == "/admin/api/2026-10/graphql.json"
            assert "status:active" in json["query"]
            assert headers["X-Shopify-Access-Token"] == "access-token"
            return pages.pop(0)

    progress_updates = []

    async def on_progress():
        progress_updates.append(True)

    with patch("backend.app.services.shopify_catalog.httpx.AsyncClient", return_value=MockClient()):
        products, updated_credentials = await fetch_shopify_products(
            "sample.myshopify.com",
            _credentials(),
            on_progress=on_progress,
        )

    assert [product["id"] for product in products] == [
        "gid://shopify/Product/1",
        "gid://shopify/Product/2",
    ]
    assert updated_credentials["access_token"] == "access-token"
    assert len(progress_updates) == 2


@pytest.mark.asyncio
async def test_catalog_refreshes_expiring_token_and_persists_rotation(shopify_catalog_settings):
    now = datetime.now(UTC)
    refresh_response = httpx.Response(
        200,
        json={
            "access_token": "rotated-access",
            "refresh_token": "rotated-refresh",
            "expires_in": 3600,
            "refresh_token_expires_in": 7776000,
            "scope": "read_products",
        },
    )

    class RefreshClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, data, headers):
            assert url.endswith("/admin/oauth/access_token")
            assert data["grant_type"] == "refresh_token"
            assert data["refresh_token"] == "refresh-token"
            return refresh_response

    class CatalogClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, json, headers):
            assert headers["X-Shopify-Access-Token"] == "rotated-access"
            return _page([])

    persisted = []

    async def persist(credentials):
        persisted.append(credentials)

    with patch(
        "backend.app.services.shopify_catalog.httpx.AsyncClient",
        side_effect=[RefreshClient(), CatalogClient()],
    ):
        products, credentials = await fetch_shopify_products(
            "sample.myshopify.com",
            _credentials(now - timedelta(seconds=1)),
            on_credentials_rotated=persist,
        )

    assert products == []
    assert credentials["refresh_token"] == "rotated-refresh"
    assert len(persisted) == 1
    assert persisted[0]["access_token"] == "rotated-access"


@pytest.mark.asyncio
async def test_catalog_fetch_rejects_products_over_configured_limit(shopify_catalog_settings, monkeypatch):
    monkeypatch.setattr(settings, "SHOPIFY_MAX_PRODUCTS", 1)

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, json, headers):
            return _page(
                [
                    {"cursor": "c1", "node": {"id": "product-1"}},
                    {"cursor": "c2", "node": {"id": "product-2"}},
                ]
            )

    with patch("backend.app.services.shopify_catalog.httpx.AsyncClient", return_value=MockClient()):
        with pytest.raises(ShopifyCatalogError, match="current import limit"):
            await fetch_shopify_products("sample.myshopify.com", _credentials())


def test_catalog_renderer_outputs_product_facts_as_plain_text():
    content = render_product_catalog(
        "sample.myshopify.com",
        [
            {
                "title": "Daily cleanser\nand moisturizer",
                "description": "A gentle cleanser.",
                "vendor": "Example Co.",
                "productType": "Skincare",
                "tags": ["daily", "sensitive skin"],
                "onlineStoreUrl": "https://sample.myshopify.com/products/cleanser",
                "variants": {
                    "edges": [
                        {
                            "node": {
                                "title": "150 ml",
                                "sku": "CLEAN-150",
                                "price": "18.00",
                                "availableForSale": True,
                            }
                        }
                    ]
                },
            }
        ],
    )

    assert "Product: Daily cleanser and moisturizer" in content
    assert "Vendor: Example Co." in content
    assert "SKU CLEAN-150; Price 18.00; Available" in content


@pytest.mark.asyncio
async def test_shopify_sync_route_queues_a_single_account_owned_request():
    integration_id = uuid.uuid4()
    user_id = uuid.uuid4()
    integration = SimpleNamespace(
        id=integration_id,
        provider="shopify",
        config={},
        sync_status="idle",
        is_active=True,
        last_error="Previous failure",
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: integration)),
        commit=AsyncMock(),
    )
    response = await trigger_integration_sync(integration_id, SimpleNamespace(id=user_id), db)

    assert response.status == "queued"
    assert integration.sync_status == "queued"
    assert integration.last_error is None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_shopify_sync_route_rejects_duplicate_syncs():
    integration_id = uuid.uuid4()
    integration = SimpleNamespace(
        id=integration_id,
        provider="shopify",
        config={},
        sync_status="syncing",
        is_active=True,
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: integration)),
        commit=AsyncMock(),
    )
    with pytest.raises(HTTPException) as error:
        await trigger_integration_sync(
            integration_id,
            SimpleNamespace(id=uuid.uuid4()),
            db,
        )

    assert error.value.status_code == 409
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "source_type",
    [KnowledgeSourceType.SHOPIFY_CATALOG, KnowledgeSourceType.GOOGLE_DRIVE],
)
async def test_provider_sources_can_only_be_created_by_sync(source_type):
    with pytest.raises(HTTPException) as error:
        await create_knowledge_source(
            KnowledgeSourceCreateRequest(name="Unverified provider", source_type=source_type),
            SimpleNamespace(id=uuid.uuid4()),
            SimpleNamespace(),
        )

    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_demo_shopify_source_is_marked_without_overwriting_a_custom_name():
    source_id = uuid.uuid4()
    user_id = uuid.uuid4()
    source = SimpleNamespace(
        id=source_id,
        user_id=user_id,
        source_type=KnowledgeSourceType.SHOPIFY_CATALOG.value,
        name="My renamed collection",
        target_url="https://cedar-sage.myshopify.com",
        settings={"custom_setting": True},
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: source)),
        flush=AsyncMock(),
    )
    integration = SimpleNamespace(
        id=uuid.uuid4(),
        config={"mock_provider": True, "catalog_source_id": str(source_id)},
    )

    updated = await _get_or_create_source(db, integration, user_id, "cedar-sage.myshopify.com")

    assert updated.name == "My renamed collection"
    assert updated.target_url is None
    assert updated.settings["mock_provider"] is True
    assert updated.settings["custom_setting"] is True
    db.flush.assert_not_awaited()

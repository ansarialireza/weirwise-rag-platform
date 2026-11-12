"""Explicitly simulated commerce and cloud-drive providers for development and tests."""

import copy
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote, urlsplit

import jwt
from backend.app.core.config import settings

_MOCK_OAUTH_AUDIENCE = "weirwise-demo-integration"


@dataclass(frozen=True)
class MockDriveFile:
    id: str
    name: str
    mime_type: str
    parent_id: str | None
    modified_at: str
    content: str


MOCK_DRIVE_FOLDERS = (
    {"id": "demo-drive-folder-policies", "name": "Company policies", "type": "folder", "parent_id": None},
    {"id": "demo-drive-folder-products", "name": "Product knowledge", "type": "folder", "parent_id": None},
)

MOCK_DRIVE_FILES = (
    MockDriveFile(
        id="demo-drive-file-returns",
        name="Returns and refunds.md",
        mime_type="text/markdown",
        parent_id="demo-drive-folder-policies",
        modified_at="2026-05-12T09:00:00Z",
        content=(
            "# Returns and refunds\n\n"
            "Customers may return unused, non-final-sale items within 30 days of delivery. "
            "Items must be in their original condition and packaging. To start a return, provide "
            "the order number to the support team. Refunds are issued to the original payment "
            "method after the returned item is inspected, usually within five business days. "
            "Shipping fees are not refundable unless the item arrived damaged or incorrect."
        ),
    ),
    MockDriveFile(
        id="demo-drive-file-shipping",
        name="Shipping guide.txt",
        mime_type="text/plain",
        parent_id="demo-drive-folder-policies",
        modified_at="2026-05-10T12:30:00Z",
        content=(
            "Shipping guide\n\n"
            "Orders are prepared within one to two business days. Standard domestic delivery "
            "usually takes three to five business days after dispatch. Tracking is emailed when "
            "the carrier collects the parcel. Remote-area delivery can take longer. Customers "
            "should contact support if tracking has not changed for five business days."
        ),
    ),
    MockDriveFile(
        id="demo-drive-file-catalog",
        name="Autumn product catalog.csv",
        mime_type="text/csv",
        parent_id="demo-drive-folder-products",
        modified_at="2026-05-15T08:15:00Z",
        content=(
            "sku,name,price,currency,availability,description\n"
            "HL-201,Harbor linen shirt,68.00,USD,in_stock,Relaxed-fit linen shirt in slate blue\n"
            "CT-104,Coastal canvas tote,32.00,USD,in_stock,Reinforced canvas tote with inner pocket\n"
            "MT-033,Trail travel mug,24.00,USD,low_stock,Insulated steel mug with a spill-resistant lid\n"
        ),
    ),
    MockDriveFile(
        id="demo-drive-file-care",
        name="Textile care.md",
        mime_type="text/markdown",
        parent_id="demo-drive-folder-products",
        modified_at="2026-05-14T16:45:00Z",
        content=(
            "# Textile care\n\n"
            "Wash linen garments in cold water on a gentle cycle and air dry to reduce shrinkage. "
            "Canvas bags can be spot-cleaned with mild soap and a damp cloth. Do not machine-dry "
            "the insulated travel mug; hand-wash the body and lid separately."
        ),
    ),
    MockDriveFile(
        id="demo-drive-file-support",
        name="Support playbook.md",
        mime_type="text/markdown",
        parent_id=None,
        modified_at="2026-05-11T11:20:00Z",
        content=(
            "# Customer support playbook\n\n"
            "Ask for an order number before discussing an individual shipment or return. Never "
            "promise a refund before the return has been inspected. For damaged deliveries, ask "
            "the customer to share a photo of the packaging and item. Escalate safety concerns "
            "and payment disputes to a human support specialist."
        ),
    ),
)

MOCK_SHOPIFY_DOMAIN = "cedar-sage.myshopify.com"

_MOCK_SHOPIFY_PRODUCTS: tuple[dict[str, Any], ...] = (
    {
        "id": "gid://shopify/Product/demo-201",
        "title": "Harbor linen shirt",
        "description": "A relaxed-fit shirt made from breathable European flax linen.",
        "vendor": "Cedar & Sage",
        "productType": "Apparel",
        "tags": ["linen", "shirt", "summer"],
        "onlineStoreUrl": f"https://{MOCK_SHOPIFY_DOMAIN}/products/harbor-linen-shirt",
        "variants": {
            "edges": [
                {"node": {"title": "Slate / S", "sku": "HL-201-S", "price": "68.00", "availableForSale": True}},
                {"node": {"title": "Slate / M", "sku": "HL-201-M", "price": "68.00", "availableForSale": True}},
                {"node": {"title": "Slate / L", "sku": "HL-201-L", "price": "68.00", "availableForSale": False}},
            ]
        },
    },
    {
        "id": "gid://shopify/Product/demo-104",
        "title": "Coastal canvas tote",
        "description": "A sturdy everyday tote with a reinforced base and an interior key pocket.",
        "vendor": "Cedar & Sage",
        "productType": "Bags",
        "tags": ["canvas", "tote"],
        "onlineStoreUrl": f"https://{MOCK_SHOPIFY_DOMAIN}/products/coastal-canvas-tote",
        "variants": {
            "edges": [
                {"node": {"title": "Natural", "sku": "CT-104-NAT", "price": "32.00", "availableForSale": True}},
                {"node": {"title": "Forest", "sku": "CT-104-FOR", "price": "34.00", "availableForSale": True}},
            ]
        },
    },
    {
        "id": "gid://shopify/Product/demo-033",
        "title": "Trail travel mug",
        "description": "A double-wall insulated steel mug with a spill-resistant lid.",
        "vendor": "Cedar & Sage",
        "productType": "Drinkware",
        "tags": ["steel", "travel"],
        "onlineStoreUrl": f"https://{MOCK_SHOPIFY_DOMAIN}/products/trail-travel-mug",
        "variants": {
            "edges": [
                {"node": {"title": "350 ml", "sku": "MT-033-350", "price": "24.00", "availableForSale": True}},
                {"node": {"title": "500 ml", "sku": "MT-033-500", "price": "29.00", "availableForSale": True}},
            ]
        },
    },
)


class MockIntegrationError(ValueError):
    """Raised when an explicitly enabled demo provider request is invalid."""


def ensure_demo_integrations_enabled() -> None:
    if not settings.DEMO_INTEGRATIONS_ENABLED:
        raise MockIntegrationError("Demo integrations are disabled.")


def create_demo_oauth_state(user_id: uuid.UUID, provider: str) -> str:
    ensure_demo_integrations_enabled()
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": str(user_id),
            "provider": provider,
            "purpose": "demo_integration_oauth",
            "aud": _MOCK_OAUTH_AUDIENCE,
            "iat": now,
            "exp": now + timedelta(seconds=settings.DEMO_INTEGRATION_STATE_TTL_SECONDS),
            "jti": uuid.uuid4().hex,
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def verify_demo_oauth_state(state: str, provider: str) -> uuid.UUID:
    ensure_demo_integrations_enabled()
    try:
        claims = jwt.decode(
            state,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            audience=_MOCK_OAUTH_AUDIENCE,
            options={"require": ["sub", "provider", "purpose", "exp", "iat", "jti"]},
        )
        if claims.get("purpose") != "demo_integration_oauth" or claims.get("provider") != provider:
            raise MockIntegrationError("The demo authorization state is invalid.")
        return uuid.UUID(claims["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        if isinstance(exc, MockIntegrationError):
            raise
        raise MockIntegrationError("The demo authorization state is invalid or expired.") from exc


def demo_authorization_url(provider: str, state: str) -> str:
    ensure_demo_integrations_enabled()
    frontend = settings.DEMO_INTEGRATIONS_FRONTEND_URL.rstrip("/")
    frontend_parts = urlsplit(frontend)
    origin = f"{frontend_parts.scheme}://{frontend_parts.netloc}"
    if origin not in settings.ALLOWED_ORIGINS or not frontend_parts.hostname:
        raise MockIntegrationError("Demo integration frontend origin is not allowed.")
    return f"{origin}/demo-integrations/authorize?provider={quote(provider)}&state={quote(state)}"


def mock_shopify_products() -> list[dict[str, Any]]:
    ensure_demo_integrations_enabled()
    return copy.deepcopy(list(_MOCK_SHOPIFY_PRODUCTS))


def mock_drive_items(parent_id: str | None) -> list[dict[str, Any]]:
    ensure_demo_integrations_enabled()
    if parent_id is not None and parent_id not in {folder["id"] for folder in MOCK_DRIVE_FOLDERS}:
        raise MockIntegrationError("The requested demo folder was not found.")
    children: list[dict[str, Any]] = [
        {**folder, "modified_at": None, "mime_type": "application/vnd.google-apps.folder"}
        for folder in MOCK_DRIVE_FOLDERS
        if folder["parent_id"] == parent_id
    ]
    children.extend(
        {
            "id": file.id,
            "name": file.name,
            "type": "file",
            "parent_id": file.parent_id,
            "modified_at": file.modified_at,
            "mime_type": file.mime_type,
        }
        for file in MOCK_DRIVE_FILES
        if file.parent_id == parent_id
    )
    return children


def mock_drive_files(file_ids: list[str]) -> list[MockDriveFile]:
    ensure_demo_integrations_enabled()
    requested = set(file_ids)
    available = {file.id for file in MOCK_DRIVE_FILES}
    if len(requested) != len(file_ids) or requested - available:
        raise MockIntegrationError("Select valid, unique files from the demo Drive.")
    return [file for file in MOCK_DRIVE_FILES if file.id in requested]

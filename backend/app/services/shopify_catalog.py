"""Shopify product catalog retrieval and knowledge-document rendering."""

import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from backend.app.core.config import settings
from backend.app.services.shopify import ShopifyOAuthError, _configured_settings, _granted_scopes, normalize_shop_domain

_PRODUCTS_QUERY = """
query ProductCatalog($cursor: String) {
  products(first: 100, after: $cursor, query: "status:active") {
    edges {
      cursor
      node {
        id
        title
        handle
        description
        vendor
        productType
        tags
        onlineStoreUrl
        variants(first: 100) {
          edges {
            node {
              title
              sku
              price
              availableForSale
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
"""

_API_VERSION_PATTERN = re.compile(r"^\d{4}-\d{2}$")


class ShopifyCatalogError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.public_message = message


def _expiry(credentials: dict[str, Any], key: str) -> datetime:
    value = credentials.get(key)
    if not isinstance(value, str):
        raise ShopifyCatalogError("invalid_credentials", "Reconnect your Shopify store to continue.")
    try:
        expiry = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ShopifyCatalogError("invalid_credentials", "Reconnect your Shopify store to continue.") from exc
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=UTC)
    return expiry.astimezone(UTC)


async def _refresh_offline_token(shop: str, credentials: dict[str, Any]) -> dict[str, Any]:
    api_key, api_secret, _, _ = _configured_settings()
    refresh_token = credentials.get("refresh_token")
    if not isinstance(refresh_token, str) or not refresh_token:
        raise ShopifyCatalogError("reauthorize", "Reconnect your Shopify store to continue.")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"https://{shop}/admin/oauth/access_token",
                data={
                    "client_id": api_key,
                    "client_secret": api_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                },
                headers={"Accept": "application/json"},
            )
    except httpx.RequestError as exc:
        raise ShopifyCatalogError("shopify_unavailable", "Shopify is temporarily unavailable. Try again.") from exc

    if response.status_code == 401:
        raise ShopifyCatalogError("reauthorize", "Reconnect your Shopify store to continue.")
    if response.status_code != 200:
        raise ShopifyCatalogError("refresh_failed", "Shopify could not refresh store access. Try again.")
    try:
        data = response.json()
    except ValueError as exc:
        raise ShopifyCatalogError("invalid_token_response", "Shopify returned an invalid token response.") from exc
    if not isinstance(data, dict):
        raise ShopifyCatalogError("invalid_token_response", "Shopify returned an invalid token response.")

    access_token = data.get("access_token")
    rotated_refresh_token = data.get("refresh_token")
    try:
        expires_in = int(data.get("expires_in", 0))
        refresh_expires_in = int(data.get("refresh_token_expires_in", 0))
    except (TypeError, ValueError) as exc:
        raise ShopifyCatalogError("invalid_token_response", "Shopify returned an invalid token response.") from exc
    if (
        not isinstance(access_token, str)
        or not access_token
        or not isinstance(rotated_refresh_token, str)
        or not rotated_refresh_token
        or expires_in <= 0
        or refresh_expires_in <= 0
    ):
        raise ShopifyCatalogError("invalid_token_response", "Shopify returned an invalid token response.")

    if data.get("scope") is not None:
        try:
            _granted_scopes(data["scope"])
        except ShopifyOAuthError as exc:
            raise ShopifyCatalogError(
                "missing_scopes",
                "Shopify access no longer includes required permissions.",
            ) from exc

    now = datetime.now(UTC)
    return {
        **credentials,
        "access_token": access_token,
        "refresh_token": rotated_refresh_token,
        "access_token_expires_at": (now + timedelta(seconds=expires_in)).isoformat(),
        "refresh_token_expires_at": (now + timedelta(seconds=refresh_expires_in)).isoformat(),
    }


async def fetch_shopify_products(
    shop_domain: str,
    credentials: dict[str, Any],
    on_credentials_rotated: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    on_progress: Callable[[], Awaitable[None]] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    shop = normalize_shop_domain(shop_domain)
    api_version = settings.SHOPIFY_API_VERSION.strip()
    if not _API_VERSION_PATTERN.fullmatch(api_version):
        raise ShopifyCatalogError("invalid_configuration", "Shopify API version is not configured correctly.")

    updated_credentials = dict(credentials)
    if _expiry(updated_credentials, "access_token_expires_at") <= datetime.now(UTC) + timedelta(seconds=60):
        updated_credentials = await _refresh_offline_token(shop, updated_credentials)
        if on_credentials_rotated:
            await on_credentials_rotated(updated_credentials)

    access_token = updated_credentials.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise ShopifyCatalogError("invalid_credentials", "Reconnect your Shopify store to continue.")

    url = f"https://{shop}/admin/api/{api_version}/graphql.json"
    products: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    cursor: str | None = None
    max_products = settings.SHOPIFY_MAX_PRODUCTS
    if max_products <= 0:
        raise ShopifyCatalogError("invalid_configuration", "Shopify product limit must be positive.")

    async with httpx.AsyncClient(timeout=30.0) as client:
        refreshed_after_unauthorized = False
        while True:
            try:
                response = await client.post(
                    url,
                    json={"query": _PRODUCTS_QUERY, "variables": {"cursor": cursor}},
                    headers={
                        "X-Shopify-Access-Token": access_token,
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                )
            except httpx.RequestError as exc:
                raise ShopifyCatalogError(
                    "shopify_unavailable", "Shopify is temporarily unavailable. Try again."
                ) from exc

            if response.status_code == 401 and not refreshed_after_unauthorized:
                updated_credentials = await _refresh_offline_token(shop, updated_credentials)
                if on_credentials_rotated:
                    await on_credentials_rotated(updated_credentials)
                access_token = updated_credentials["access_token"]
                refreshed_after_unauthorized = True
                continue
            if response.status_code != 200:
                raise ShopifyCatalogError("catalog_fetch_failed", "Shopify products could not be loaded. Try again.")

            try:
                payload = response.json()
            except ValueError as exc:
                raise ShopifyCatalogError(
                    "invalid_catalog_response", "Shopify returned an invalid product response."
                ) from exc
            if not isinstance(payload, dict) or payload.get("errors"):
                raise ShopifyCatalogError("catalog_fetch_failed", "Shopify products could not be loaded. Try again.")
            if on_progress:
                await on_progress()

            data = payload.get("data")
            product_connection = data.get("products") if isinstance(data, dict) else None
            if not isinstance(product_connection, dict):
                raise ShopifyCatalogError("invalid_catalog_response", "Shopify returned an invalid product response.")
            edges = product_connection.get("edges")
            page_info = product_connection.get("pageInfo")
            if not isinstance(edges, list) or not isinstance(page_info, dict):
                raise ShopifyCatalogError("invalid_catalog_response", "Shopify returned an invalid product response.")

            for edge in edges:
                if not isinstance(edge, dict) or not isinstance(edge.get("node"), dict):
                    raise ShopifyCatalogError(
                        "invalid_catalog_response", "Shopify returned an invalid product response."
                    )
                product = edge["node"]
                product_id = product.get("id")
                if not isinstance(product_id, str) or product_id in seen_ids:
                    continue
                seen_ids.add(product_id)
                products.append(product)
                if len(products) > max_products:
                    raise ShopifyCatalogError(
                        "catalog_too_large",
                        f"This store exceeds the current import limit of {max_products} products.",
                    )

            if not page_info.get("hasNextPage"):
                break
            next_cursor = page_info.get("endCursor")
            if not isinstance(next_cursor, str) or not next_cursor or next_cursor == cursor:
                raise ShopifyCatalogError(
                    "invalid_catalog_response", "Shopify returned an invalid product pagination response."
                )
            cursor = next_cursor

    return products, updated_credentials


def _plain_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())


def render_product_catalog(shop_domain: str, products: list[dict[str, Any]]) -> str:
    lines = [f"Product catalog for {normalize_shop_domain(shop_domain)}", f"Active products: {len(products)}"]
    for product in products:
        lines.extend(
            [
                "",
                f"Product: {_plain_text(product.get('title')) or 'Untitled product'}",
                f"Product type: {_plain_text(product.get('productType')) or 'Not specified'}",
                f"Vendor: {_plain_text(product.get('vendor')) or 'Not specified'}",
                f"Description: {_plain_text(product.get('description')) or 'No description provided.'}",
            ]
        )
        tags = product.get("tags")
        if isinstance(tags, list):
            lines.append(f"Tags: {', '.join(_plain_text(tag) for tag in tags if _plain_text(tag)) or 'None'}")
        store_url = _plain_text(product.get("onlineStoreUrl"))
        if store_url:
            lines.append(f"Product URL: {store_url}")

        variants_connection = product.get("variants")
        edges = variants_connection.get("edges") if isinstance(variants_connection, dict) else None
        if isinstance(edges, list) and edges:
            lines.append("Variants:")
            for edge in edges:
                variant = edge.get("node") if isinstance(edge, dict) else None
                if not isinstance(variant, dict):
                    continue
                details = [_plain_text(variant.get("title")) or "Default"]
                sku = _plain_text(variant.get("sku"))
                if sku:
                    details.append(f"SKU {sku}")
                price = _plain_text(variant.get("price"))
                if price:
                    details.append(f"Price {price}")
                availability = variant.get("availableForSale")
                if isinstance(availability, bool):
                    details.append("Available" if availability else "Unavailable")
                lines.append(f"- {'; '.join(details)}")
    return "\n".join(lines)

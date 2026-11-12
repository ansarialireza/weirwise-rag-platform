"""Shopify OAuth authorization and secure store connection."""

import hashlib
import hmac
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
import jwt
from backend.app.core.config import settings
from backend.app.models.assistant import BusinessIntegration
from backend.app.models.auth import User
from backend.app.services.integrations import integrations_service
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

_SHOP_DOMAIN_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$")
_OAUTH_AUDIENCE = "shopify-oauth"


class ShopifyOAuthError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _requested_scopes() -> set[str]:
    return {scope.strip() for scope in settings.SHOPIFY_SCOPES.split(",") if scope.strip()}


def normalize_shop_domain(value: str) -> str:
    shop = value.strip().lower()
    if not _SHOP_DOMAIN_PATTERN.fullmatch(shop):
        raise ShopifyOAuthError("invalid_shop")
    return shop


def _configured_settings() -> tuple[str, str, str, str]:
    api_key = settings.SHOPIFY_API_KEY
    api_secret = settings.SHOPIFY_API_SECRET
    redirect_uri = settings.SHOPIFY_REDIRECT_URI
    completion_url = settings.SHOPIFY_FRONTEND_RETURN_URL
    if api_key is None or api_secret is None or redirect_uri is None or completion_url is None:
        raise ShopifyOAuthError("not_configured")
    if not all(value.strip() for value in (api_key, api_secret, redirect_uri, completion_url)):
        raise ShopifyOAuthError("not_configured")

    if settings.SHOPIFY_OAUTH_STATE_TTL_SECONDS <= 0:
        raise ShopifyOAuthError("invalid_configuration")

    requested_scopes = _requested_scopes()
    if not requested_scopes or any(not re.fullmatch(r"[a-z][a-z0-9_]*", scope) for scope in requested_scopes):
        raise ShopifyOAuthError("invalid_configuration")

    redirect = urlsplit(redirect_uri)
    completion = urlsplit(completion_url)
    if (
        redirect.scheme not in {"http", "https"}
        or not redirect.hostname
        or redirect.username
        or redirect.password
        or redirect.fragment
        or completion.scheme not in {"http", "https"}
        or not completion.hostname
        or completion.username
        or completion.password
        or completion.fragment
    ):
        raise ShopifyOAuthError("invalid_configuration")

    if settings.ENVIRONMENT.strip().lower() in {"production", "prod", "staging"}:
        if redirect.scheme != "https" or completion.scheme != "https":
            raise ShopifyOAuthError("invalid_configuration")

    completion_origin = f"{completion.scheme}://{completion.netloc}"
    if completion_origin not in settings.ALLOWED_ORIGINS:
        raise ShopifyOAuthError("invalid_configuration")

    return api_key, api_secret, redirect_uri, completion_url


def create_authorization_url(shop_domain: str, user_id: uuid.UUID) -> str:
    shop = normalize_shop_domain(shop_domain)
    api_key, _, redirect_uri, _ = _configured_settings()
    now = datetime.now(UTC)
    state = jwt.encode(
        {
            "sub": str(user_id),
            "shop": shop,
            "purpose": "shopify_oauth",
            "aud": _OAUTH_AUDIENCE,
            "iat": now,
            "exp": now + timedelta(seconds=settings.SHOPIFY_OAUTH_STATE_TTL_SECONDS),
            "jti": secrets.token_urlsafe(24),
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    query = urlencode(
        {
            "client_id": api_key,
            "scope": ",".join(sorted(_requested_scopes())),
            "redirect_uri": redirect_uri,
            "state": state,
        }
    )
    return f"https://{shop}/admin/oauth/authorize?{query}"


def verify_callback_parameters(query_items: list[tuple[str, str]]) -> dict[str, Any]:
    if len({key for key, _ in query_items}) != len(query_items):
        raise ShopifyOAuthError("invalid_callback")
    params = dict(query_items)
    state = params.get("state", "")
    shop = normalize_shop_domain(params.get("shop", ""))
    provided_hmac = params.get("hmac", "")
    timestamp = params.get("timestamp", "")
    if not state or not provided_hmac or not timestamp:
        raise ShopifyOAuthError("invalid_callback")

    _, api_secret, _, _ = _configured_settings()
    message = "&".join(f"{key}={value}" for key, value in sorted(params.items()) if key != "hmac")
    expected_hmac = hmac.new(api_secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_hmac, provided_hmac):
        raise ShopifyOAuthError("invalid_callback")

    try:
        callback_timestamp = int(timestamp)
    except ValueError as exc:
        raise ShopifyOAuthError("invalid_callback") from exc
    if abs(int(datetime.now(UTC).timestamp()) - callback_timestamp) > settings.SHOPIFY_OAUTH_STATE_TTL_SECONDS:
        raise ShopifyOAuthError("invalid_callback")

    try:
        claims = jwt.decode(
            state,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            audience=_OAUTH_AUDIENCE,
            options={"require": ["exp", "iat", "jti", "sub", "shop"]},
        )
    except jwt.PyJWTError as exc:
        raise ShopifyOAuthError("invalid_state") from exc

    if claims.get("purpose") != "shopify_oauth" or claims.get("shop") != shop:
        raise ShopifyOAuthError("invalid_state")
    try:
        user_id = uuid.UUID(str(claims["sub"]))
    except (KeyError, ValueError) as exc:
        raise ShopifyOAuthError("invalid_state") from exc

    params["shop"] = shop
    params["user_id"] = user_id
    return params


def _granted_scopes(response_scope: Any) -> set[str]:
    if not isinstance(response_scope, str):
        raise ShopifyOAuthError("missing_scopes")
    granted = {scope.strip() for scope in response_scope.split(",") if scope.strip()}
    requested = _requested_scopes()
    missing = {
        scope
        for scope in requested
        if scope not in granted and not (scope.startswith("read_") and f"write_{scope[5:]}" in granted)
    }
    if missing:
        raise ShopifyOAuthError("missing_scopes")
    return granted


async def exchange_authorization_code(shop_domain: str, code: str) -> tuple[dict[str, str], set[str]]:
    shop = normalize_shop_domain(shop_domain)
    api_key, api_secret, _, _ = _configured_settings()
    url = f"https://{shop}/admin/oauth/access_token"
    payload = {
        "client_id": api_key,
        "client_secret": api_secret,
        "code": code,
        "expiring": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, data=payload)
    except httpx.RequestError as exc:
        raise ShopifyOAuthError("token_exchange_failed") from exc

    if response.status_code != 200:
        raise ShopifyOAuthError("token_exchange_failed")
    try:
        data = response.json()
    except ValueError as exc:
        raise ShopifyOAuthError("token_exchange_failed") from exc
    if not isinstance(data, dict):
        raise ShopifyOAuthError("invalid_token_response")

    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token")
    try:
        expires_in = int(data.get("expires_in", 0))
        refresh_expires_in = int(data.get("refresh_token_expires_in", 0))
    except (TypeError, ValueError) as exc:
        raise ShopifyOAuthError("invalid_token_response") from exc
    if not isinstance(access_token, str) or not access_token or not isinstance(refresh_token, str) or not refresh_token:
        raise ShopifyOAuthError("invalid_token_response")
    if expires_in <= 0 or refresh_expires_in <= 0:
        raise ShopifyOAuthError("invalid_token_response")

    granted_scopes = _granted_scopes(data.get("scope"))
    now = datetime.now(UTC)
    credentials = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "access_token_expires_at": (now + timedelta(seconds=expires_in)).isoformat(),
        "refresh_token_expires_at": (now + timedelta(seconds=refresh_expires_in)).isoformat(),
    }
    return credentials, granted_scopes


def build_completion_url(status: str, shop_domain: str | None = None) -> str:
    _, _, _, completion_url = _configured_settings()
    parsed = urlsplit(completion_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["shopify_status"] = status
    if shop_domain:
        query["shop"] = normalize_shop_domain(shop_domain)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), ""))


async def save_shopify_connection(
    db: AsyncSession,
    user_id: uuid.UUID,
    shop_domain: str,
    code: str,
) -> BusinessIntegration:
    credentials, granted_scopes = await exchange_authorization_code(shop_domain, code)
    config = {
        "shop_domain": shop_domain,
        "granted_scopes": sorted(granted_scopes),
        "access_token_expires_at": credentials["access_token_expires_at"],
        "refresh_token_expires_at": credentials["refresh_token_expires_at"],
    }
    existing_result = await db.execute(
        select(BusinessIntegration).where(
            BusinessIntegration.user_id == user_id,
            BusinessIntegration.provider == "shopify",
            BusinessIntegration.connection_key == shop_domain,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        for key in ("catalog_source_id", "catalog_document_id", "catalog_hash", "product_count"):
            if key in (existing.config or {}):
                config[key] = existing.config[key]
    return await integrations_service.create_or_update_integration(
        db=db,
        user_id=user_id,
        provider="shopify",
        display_name=shop_domain,
        credentials=credentials,
        config=config,
        connection_key=shop_domain,
    )


async def get_active_user_id(db: AsyncSession, user_id: uuid.UUID) -> uuid.UUID | None:
    result = await db.execute(select(User.id).where(User.id == user_id, User.is_active.is_(True)))
    return result.scalar_one_or_none()

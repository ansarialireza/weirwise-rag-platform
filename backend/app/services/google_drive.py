"""Google Drive OAuth authorization, token management, and Drive v3 REST client."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
import jwt
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.models.assistant import BusinessIntegration
from backend.app.services.integrations import integrations_service
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

_OAUTH_AUDIENCE = "google-drive-oauth"
_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
_GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"

_EXPORT_MIME_TYPES = {
    "application/vnd.google-apps.document": ("text/plain", ".txt"),
    "application/vnd.google-apps.spreadsheet": ("text/csv", ".csv"),
    "application/vnd.google-apps.presentation": ("text/plain", ".txt"),
}


class GoogleDriveOAuthError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code
        self.public_message = message or code


class GoogleDriveApiError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code
        self.public_message = message or code


def _configured_google_settings() -> tuple[str, str, str, str]:
    client_id = settings.GOOGLE_DRIVE_CLIENT_ID
    client_secret = settings.GOOGLE_DRIVE_CLIENT_SECRET
    redirect_uri = settings.GOOGLE_DRIVE_REDIRECT_URI
    completion_url = settings.GOOGLE_DRIVE_FRONTEND_RETURN_URL
    if client_id is None or client_secret is None or redirect_uri is None or completion_url is None:
        raise GoogleDriveOAuthError("not_configured", "Google Drive connection is not configured.")
    if not all(value.strip() for value in (client_id, client_secret, redirect_uri, completion_url)):
        raise GoogleDriveOAuthError("not_configured", "Google Drive connection is not configured.")

    if settings.GOOGLE_DRIVE_OAUTH_STATE_TTL_SECONDS <= 0:
        raise GoogleDriveOAuthError("invalid_configuration", "Google Drive OAuth TTL must be positive.")

    redirect = urlsplit(redirect_uri)
    completion = urlsplit(completion_url)
    if (
        redirect.scheme not in {"http", "https"}
        or not redirect.hostname
        or redirect.fragment
        or completion.scheme not in {"http", "https"}
        or not completion.hostname
        or completion.fragment
    ):
        raise GoogleDriveOAuthError("invalid_configuration", "Google Drive URIs are malformed.")

    if settings.ENVIRONMENT.strip().lower() in {"production", "prod", "staging"}:
        if redirect.scheme != "https" or completion.scheme != "https":
            raise GoogleDriveOAuthError("invalid_configuration", "HTTPS is required in production.")

    completion_origin = f"{completion.scheme}://{completion.netloc}"
    if completion_origin not in settings.ALLOWED_ORIGINS:
        raise GoogleDriveOAuthError("invalid_configuration", "Google Drive return URL origin is not allowed.")

    return client_id.strip(), client_secret.strip(), redirect_uri.strip(), completion_url.strip()


def create_google_authorization_url(user_id: uuid.UUID) -> str:
    """Generate a signed Google OAuth 2.0 authorization URL."""
    client_id, _, redirect_uri, _ = _configured_google_settings()
    now = datetime.now(UTC)
    state = jwt.encode(
        {
            "sub": str(user_id),
            "purpose": "google_drive_oauth",
            "aud": _OAUTH_AUDIENCE,
            "iat": now,
            "exp": now + timedelta(seconds=settings.GOOGLE_DRIVE_OAUTH_STATE_TTL_SECONDS),
            "jti": secrets.token_urlsafe(24),
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": settings.GOOGLE_DRIVE_SCOPES,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
    )
    return f"{_GOOGLE_AUTH_URL}?{query}"


def verify_google_callback_parameters(state: str, code: str) -> uuid.UUID:
    """Verify signed state token and extract user identity."""
    if not state or not code:
        raise GoogleDriveOAuthError("invalid_callback", "Missing state or authorization code.")

    try:
        claims = jwt.decode(
            state,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            audience=_OAUTH_AUDIENCE,
            options={"require": ["exp", "iat", "jti", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise GoogleDriveOAuthError("invalid_state", "The authorization session has expired or is invalid.") from exc

    if claims.get("purpose") != "google_drive_oauth":
        raise GoogleDriveOAuthError("invalid_state", "Invalid authorization purpose.")

    try:
        return uuid.UUID(str(claims["sub"]))
    except (KeyError, ValueError) as exc:
        raise GoogleDriveOAuthError("invalid_state", "Invalid account identity in state.") from exc


async def exchange_google_authorization_code(code: str) -> tuple[dict[str, Any], str]:
    """Exchange authorization code for access and refresh tokens, and retrieve account identity."""
    client_id, client_secret, redirect_uri, _ = _configured_google_settings()
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(_GOOGLE_TOKEN_URL, data=payload)
    except httpx.RequestError as exc:
        raise GoogleDriveOAuthError("token_exchange_failed", "Google authentication is temporarily unavailable.") from exc

    if response.status_code != 200:
        logger.warning("Google token exchange rejected: status %s body: %s", response.status_code, response.text)
        raise GoogleDriveOAuthError("token_exchange_failed", "Google could not verify the authorization code.")

    try:
        data = response.json()
    except ValueError as exc:
        raise GoogleDriveOAuthError("token_exchange_failed", "Google returned an invalid response.") from exc

    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token")
    expires_in = int(data.get("expires_in", 3600))
    if not isinstance(access_token, str) or not access_token:
        raise GoogleDriveOAuthError("invalid_token_response", "Google did not provide an access token.")

    # Retrieve authenticated user's email address
    account_email = "Google Drive account"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            userinfo_res = await client.get(
                _GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if userinfo_res.status_code == 200:
                userinfo_data = userinfo_res.json()
                account_email = userinfo_data.get("email") or account_email
    except Exception as e:
        logger.warning("Could not fetch Google user info: %s", e)

    now = datetime.now(UTC)
    credentials = {
        "access_token": access_token,
        "refresh_token": refresh_token or "",
        "access_token_expires_at": (now + timedelta(seconds=expires_in)).isoformat(),
        "account_email": account_email,
    }
    return credentials, account_email


async def refresh_google_offline_token(credentials: dict[str, Any]) -> dict[str, Any]:
    """Rotate access token using stored refresh token."""
    client_id, client_secret, _, _ = _configured_google_settings()
    refresh_token = credentials.get("refresh_token")
    if not isinstance(refresh_token, str) or not refresh_token:
        raise GoogleDriveOAuthError("reauthorize", "Reconnect your Google Drive account to continue.")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                _GOOGLE_TOKEN_URL,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
    except httpx.RequestError as exc:
        raise GoogleDriveOAuthError("google_unavailable", "Google is temporarily unavailable. Try again.") from exc

    if response.status_code in {400, 401}:
        raise GoogleDriveOAuthError("reauthorize", "Google access was revoked. Reconnect your account.")
    if response.status_code != 200:
        raise GoogleDriveOAuthError("refresh_failed", "Google could not refresh account access.")

    try:
        data = response.json()
    except ValueError as exc:
        raise GoogleDriveOAuthError("refresh_failed", "Google returned an invalid token response.") from exc

    access_token = data.get("access_token")
    expires_in = int(data.get("expires_in", 3600))
    if not isinstance(access_token, str) or not access_token:
        raise GoogleDriveOAuthError("refresh_failed", "Google did not provide a refreshed access token.")

    now = datetime.now(UTC)
    return {
        **credentials,
        "access_token": access_token,
        "access_token_expires_at": (now + timedelta(seconds=expires_in)).isoformat(),
    }


async def ensure_valid_google_credentials(credentials: dict[str, Any]) -> dict[str, Any]:
    """Check expiry and auto-refresh credentials when within 60s of expiration."""
    expires_at_raw = credentials.get("access_token_expires_at")
    if not expires_at_raw:
        return await refresh_google_offline_token(credentials)
    try:
        expires_at = datetime.fromisoformat(expires_at_raw.replace("Z", "+00:00"))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
    except ValueError:
        return await refresh_google_offline_token(credentials)

    if expires_at <= datetime.now(UTC) + timedelta(seconds=60):
        return await refresh_google_offline_token(credentials)
    return credentials


async def list_google_drive_files(credentials: dict[str, Any], parent_id: str | None = None) -> list[dict[str, Any]]:
    """List child folders and documents from Google Drive v3 REST API."""
    creds = await ensure_valid_google_credentials(credentials)
    access_token = creds["access_token"]
    parent = parent_id.strip() if parent_id and parent_id.strip() else "root"

    # Query active, non-trashed files within parent folder
    escaped_parent = parent.replace("'", "\\'")
    query = f"trashed = false and '{escaped_parent}' in parents"
    params = {
        "q": query,
        "fields": "files(id, name, mimeType, modifiedTime, size, parents)",
        "pageSize": 100,
        "orderBy": "folder, name",
    }
    headers = {"Authorization": f"Bearer {access_token}"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(f"{_GOOGLE_DRIVE_API_BASE}/files", params=params, headers=headers)
    except httpx.RequestError as exc:
        raise GoogleDriveApiError("google_unavailable", "Could not reach Google Drive. Try again.") from exc

    if response.status_code == 401:
        # Token might be invalidated server-side, try one refresh
        refreshed = await refresh_google_offline_token(credentials)
        headers = {"Authorization": f"Bearer {refreshed['access_token']}"}
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(f"{_GOOGLE_DRIVE_API_BASE}/files", params=params, headers=headers)

    if response.status_code != 200:
        logger.warning("Google Drive list failed: status %s body: %s", response.status_code, response.text)
        raise GoogleDriveApiError("list_failed", "Google Drive files could not be loaded.")

    data = response.json()
    items: list[dict[str, Any]] = []
    for file in data.get("files", []):
        mime = file.get("mimeType", "")
        is_folder = mime == "application/vnd.google-apps.folder"
        items.append(
            {
                "id": file["id"],
                "name": file["name"],
                "type": "folder" if is_folder else "file",
                "parent_id": parent if parent != "root" else None,
                "modified_at": file.get("modifiedTime"),
                "mime_type": mime,
                "size": int(file.get("size", 0)) if "size" in file else None,
            }
        )
    return items


async def download_google_drive_file_content(credentials: dict[str, Any], file_id: str) -> tuple[str, bytes, str]:
    """Download binary content or export native Google Docs/Sheets/Slides to text/csv/pdf."""
    creds = await ensure_valid_google_credentials(credentials)
    access_token = creds["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Fetch file metadata
        meta_res = await client.get(
            f"{_GOOGLE_DRIVE_API_BASE}/files/{file_id}",
            params={"fields": "id, name, mimeType, size"},
            headers=headers,
        )
        if meta_res.status_code != 200:
            raise GoogleDriveApiError("file_not_found", f"File {file_id} not found in Google Drive.")
        meta = meta_res.json()
        filename = meta.get("name", "document")
        mime_type = meta.get("mimeType", "application/octet-stream")

        # 2. Check if file is a native Google Workspace format that requires export
        if mime_type in _EXPORT_MIME_TYPES:
            export_mime, extension = _EXPORT_MIME_TYPES[mime_type]
            if not filename.endswith(extension):
                filename = f"{filename}{extension}"
            export_res = await client.get(
                f"{_GOOGLE_DRIVE_API_BASE}/files/{file_id}/export",
                params={"mimeType": export_mime},
                headers=headers,
            )
            if export_res.status_code != 200:
                raise GoogleDriveApiError("export_failed", f"Failed to export Google document '{filename}'.")
            return filename, export_res.content, export_mime

        # 3. Regular binary file download
        download_res = await client.get(
            f"{_GOOGLE_DRIVE_API_BASE}/files/{file_id}",
            params={"alt": "media"},
            headers=headers,
        )
        if download_res.status_code != 200:
            raise GoogleDriveApiError("download_failed", f"Failed to download '{filename}' from Google Drive.")
        return filename, download_res.content, mime_type


def build_google_completion_url(status: str, account_email: str | None = None) -> str:
    """Build redirect destination back to frontend with query parameters."""
    _, _, _, completion_url = _configured_google_settings()
    parsed = urlsplit(completion_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["google_status"] = status
    if account_email:
        query["account"] = account_email
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), ""))


async def save_google_drive_connection(
    db: AsyncSession,
    user_id: uuid.UUID,
    credentials: dict[str, Any],
    account_email: str,
) -> BusinessIntegration:
    """Persist encrypted Google Drive connection."""
    connection_key = account_email.strip().lower()
    config = {
        "account_email": account_email,
        "access_token_expires_at": credentials["access_token_expires_at"],
        "selected_file_ids": [],
    }
    existing_result = await db.execute(
        select(BusinessIntegration).where(
            BusinessIntegration.user_id == user_id,
            BusinessIntegration.provider == "google_drive",
            BusinessIntegration.connection_key == connection_key,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing and existing.config:
        for key in ("catalog_source_id", "selected_file_ids", "synced_file_count"):
            if key in existing.config:
                config[key] = existing.config[key]

    return await integrations_service.create_or_update_integration(
        db=db,
        user_id=user_id,
        provider="google_drive",
        display_name=f"Google Drive · {account_email}",
        credentials=credentials,
        config=config,
        connection_key=connection_key,
    )

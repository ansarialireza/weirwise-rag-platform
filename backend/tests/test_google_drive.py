import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from backend.app.core.config import settings
from backend.app.services.google_drive import (
    GoogleDriveApiError,
    GoogleDriveOAuthError,
    create_google_authorization_url,
    download_google_drive_file_content,
    ensure_valid_google_credentials,
    exchange_google_authorization_code,
    list_google_drive_files,
    refresh_google_offline_token,
    verify_google_callback_parameters,
)


@pytest.fixture
def google_drive_settings(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_DRIVE_CLIENT_ID", "test-google-client-id")
    monkeypatch.setattr(settings, "GOOGLE_DRIVE_CLIENT_SECRET", "test-google-client-secret")
    monkeypatch.setattr(
        settings,
        "GOOGLE_DRIVE_REDIRECT_URI",
        "https://api.example.test/api/v1/integrations/google-drive/oauth/callback",
    )
    monkeypatch.setattr(settings, "GOOGLE_DRIVE_FRONTEND_RETURN_URL", "https://app.example.test/sources")
    monkeypatch.setattr(settings, "GOOGLE_DRIVE_OAUTH_STATE_TTL_SECONDS", 600)
    monkeypatch.setattr(settings, "ALLOWED_ORIGINS", ["https://app.example.test"])


def test_google_authorization_url_requires_configuration(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_DRIVE_CLIENT_ID", None)
    with pytest.raises(GoogleDriveOAuthError, match="not configured"):
        create_google_authorization_url(uuid.uuid4())


def test_google_authorization_url_builds_valid_oauth_url(google_drive_settings):
    user_id = uuid.uuid4()
    url = create_google_authorization_url(user_id)
    parsed = urlsplit(url)
    query = parse_qs(parsed.query)

    assert parsed.scheme == "https"
    assert parsed.netloc == "accounts.google.com"
    assert parsed.path == "/o/oauth2/v2/auth"
    assert query["client_id"] == ["test-google-client-id"]
    assert query["redirect_uri"] == ["https://api.example.test/api/v1/integrations/google-drive/oauth/callback"]
    assert query["access_type"] == ["offline"]
    assert query["response_type"] == ["code"]

    claims_user_id = verify_google_callback_parameters(query["state"][0], "auth-code-123")
    assert claims_user_id == user_id


def test_google_callback_rejects_tampered_state(google_drive_settings):
    with pytest.raises(GoogleDriveOAuthError, match="expired or is invalid"):
        verify_google_callback_parameters("tampered.jwt.state", "auth-code")


@pytest.mark.asyncio
async def test_google_code_exchange(google_drive_settings):
    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, data):
            assert url == "https://oauth2.googleapis.com/token"
            assert data["code"] == "code-xyz"
            assert data["client_id"] == "test-google-client-id"
            return httpx.Response(
                200,
                json={
                    "access_token": "google-access-token",
                    "refresh_token": "google-refresh-token",
                    "expires_in": 3600,
                },
            )

        async def get(self, url, headers):
            assert url == "https://www.googleapis.com/oauth2/v2/userinfo"
            return httpx.Response(200, json={"email": "alice@gmail.com", "name": "Alice Tester"})

    with patch("backend.app.services.google_drive.httpx.AsyncClient", return_value=MockClient()):
        creds, account_email = await exchange_google_authorization_code("code-xyz")

    assert creds["access_token"] == "google-access-token"
    assert creds["refresh_token"] == "google-refresh-token"
    assert account_email == "alice@gmail.com"


@pytest.mark.asyncio
async def test_google_token_refresh(google_drive_settings):
    class MockRefreshClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, data):
            assert data["grant_type"] == "refresh_token"
            return httpx.Response(
                200,
                json={"access_token": "new-access-token", "expires_in": 1800},
            )

    creds = {
        "access_token": "old-token",
        "refresh_token": "my-refresh-token",
        "access_token_expires_at": (datetime.now(UTC) - timedelta(minutes=5)).isoformat(),
    }
    with patch("backend.app.services.google_drive.httpx.AsyncClient", return_value=MockRefreshClient()):
        updated = await refresh_google_offline_token(creds)

    assert updated["access_token"] == "new-access-token"


@pytest.mark.asyncio
async def test_list_google_drive_items(google_drive_settings):
    class MockDriveListClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params=None, headers=None):
            return httpx.Response(
                200,
                json={
                    "files": [
                        {
                            "id": "folder-1",
                            "name": "Projects",
                            "mimeType": "application/vnd.google-apps.folder",
                            "modifiedTime": "2026-01-01T00:00:00Z",
                        },
                        {
                            "id": "file-1",
                            "name": "Notes.pdf",
                            "mimeType": "application/pdf",
                            "modifiedTime": "2026-01-02T00:00:00Z",
                            "size": 1024,
                        },
                    ]
                },
            )

    creds = {
        "access_token": "valid-token",
        "access_token_expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    }
    with patch("backend.app.services.google_drive.httpx.AsyncClient", return_value=MockDriveListClient()):
        items = await list_google_drive_files(creds, "root")

    assert len(items) == 2
    assert items[0]["type"] == "folder"
    assert items[1]["type"] == "file"
    assert items[1]["name"] == "Notes.pdf"


@pytest.mark.asyncio
async def test_download_google_drive_file(google_drive_settings):
    class MockDownloadClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params=None, headers=None):
            if "export" in url:
                return httpx.Response(200, content=b"Google Doc Exported Plain Text")
            if "alt=media" in str(params) or (params and params.get("alt") == "media"):
                return httpx.Response(200, content=b"%PDF-1.4 Mock PDF Content")
            # metadata
            if "doc-1" in url:
                return httpx.Response(
                    200,
                    json={"id": "doc-1", "name": "Company Strategy", "mimeType": "application/vnd.google-apps.document"},
                )
            return httpx.Response(200, json={"id": "file-1", "name": "doc.pdf", "mimeType": "application/pdf"})

    creds = {
        "access_token": "valid-token",
        "access_token_expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    }
    with patch("backend.app.services.google_drive.httpx.AsyncClient", return_value=MockDownloadClient()):
        name, content, mime = await download_google_drive_file_content(creds, "doc-1")
        assert name == "Company Strategy.txt"
        assert content == b"Google Doc Exported Plain Text"
        assert mime == "text/plain"

        name_pdf, content_pdf, mime_pdf = await download_google_drive_file_content(creds, "file-1")
        assert name_pdf == "doc.pdf"
        assert content_pdf.startswith(b"%PDF")
        assert mime_pdf == "application/pdf"

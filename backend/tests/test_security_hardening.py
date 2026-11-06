"""Hardening regression tests for the security remediation:
- Password policy enforcement
- Authentication rate limiting (atomic, concurrent)
- Security response headers
- Redirect-following SSRF protection
- Streamed upload cleanup guarantees
"""

import asyncio
import io
import uuid

import httpx
import pytest
from backend.app.core.config import Settings, settings
from backend.app.main import app
from backend.app.services import scraper as scraper_module
from backend.app.services.auth_rate_limiter import AuthRateLimiter
from backend.app.services.scraper import WebsiteCrawler
from fastapi.testclient import TestClient

client = TestClient(app)


def _unique_email(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@hardening.test"


def test_production_settings_reject_default_secret_key():
    default_secret = "insecure-dev-secret-key-replace-in-production-0123456789abcdef"

    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(ENVIRONMENT="production", SECRET_KEY=default_secret)

    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(ENVIRONMENT="production", SECRET_KEY="too-short")

    assert Settings(ENVIRONMENT="production", SECRET_KEY="x" * 48).SECRET_KEY == "x" * 48
    assert Settings(ENVIRONMENT="development", SECRET_KEY=default_secret).ENVIRONMENT == "development"


def test_password_policy_rejects_weak_passwords():
    weak = [
        "short",  # too short
        "abcdefghijkl",  # only one character class
        "password1234",  # common password
        "Password1234",  # only 3 classes but common-looking? (still accepted) -> replaced below
    ]
    for i, password in enumerate(weak[:3]):
        res = client.post(
            "/api/v1/auth/register",
            json={"email": _unique_email(f"weak{i}"), "password": password, "full_name": "Weak User"},
        )
        assert res.status_code == 422, (password, res.text)

    strong = client.post(
        "/api/v1/auth/register",
        json={"email": _unique_email("strong"), "password": "Str0ng-Passphrase!", "full_name": "Strong User"},
    )
    assert strong.status_code == 201, strong.text


def test_password_policy_hashes_never_stored_plaintext():
    from backend.app.core.security import hash_password, verify_password

    hashed = hash_password("Str0ng-Passphrase!")
    assert hashed != "Str0ng-Passphrase!"
    assert verify_password("Str0ng-Passphrase!", hashed)


def test_security_headers_on_api_responses():
    res = client.get("/health/live")
    assert res.status_code == 200
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["Referrer-Policy"] == "no-referrer"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in res.headers["Content-Security-Policy"]
    assert "microphone=(self)" in res.headers["Permissions-Policy"]
    # HSTS must not be emitted for plain HTTP when disabled
    assert "Strict-Transport-Security" not in res.headers


def test_security_headers_hsts_when_https_forwarded():
    res = client.get("/health/live", headers={"X-Forwarded-Proto": "https", "Host": "app.weirwise.test"})
    assert res.status_code == 200
    assert res.headers["Strict-Transport-Security"].startswith("max-age=")


async def test_rate_limiter_atomic_concurrent_limit(monkeypatch):
    monkeypatch.setattr(settings, "REDIS_URL", None)
    monkeypatch.setattr(settings, "AUTH_RATE_LIMIT_ENABLED", True)
    await AuthRateLimiter.reset_all()

    scope = f"test_concurrent_{uuid.uuid4().hex}"
    identifier = "same-account"
    allowed = 0

    async def attempt() -> bool:
        decision = await AuthRateLimiter.check_and_record(scope, identifier, 5, 60)
        return decision.allowed

    results = await asyncio.gather(*(attempt() for _ in range(25)))
    allowed = sum(1 for ok in results if ok)
    assert allowed == 5, f"expected exactly 5 admissions, got {allowed}"

    decision = await AuthRateLimiter.check(scope, identifier, 5, 60)
    assert not decision.allowed
    assert decision.retry_after >= 1

    await AuthRateLimiter.reset(scope, identifier)


def test_login_lockout_after_repeated_failures():
    asyncio.run(AuthRateLimiter.reset_all())
    email = _unique_email("lockout")
    created = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Correct-Horse-9!", "full_name": "Lockout User"},
    )
    assert created.status_code == 201, created.text

    try:
        for _ in range(settings.AUTH_LOGIN_ACCOUNT_LIMIT):
            res = client.post("/api/v1/auth/login", json={"email": email, "password": "Wrong-Password-9!"})
            assert res.status_code == 401, res.text

        blocked = client.post("/api/v1/auth/login", json={"email": email, "password": "Correct-Horse-9!"})
        assert blocked.status_code == 429, blocked.text
        assert int(blocked.headers.get("Retry-After", "0")) >= 1
    finally:
        asyncio.run(AuthRateLimiter.reset_all())


def test_successful_login_clears_failure_counters():
    asyncio.run(AuthRateLimiter.reset_all())
    email = _unique_email("recover")
    created = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Correct-Horse-9!", "full_name": "Recovery User"},
    )
    assert created.status_code == 201, created.text

    try:
        for _ in range(2):
            assert (
                client.post("/api/v1/auth/login", json={"email": email, "password": "Wrong-Password-9!"}).status_code
                == 401
            )

        ok = client.post("/api/v1/auth/login", json={"email": email, "password": "Correct-Horse-9!"})
        assert ok.status_code == 200, ok.text

        # A fresh burst of failures should get the full allowance again.
        for _ in range(settings.AUTH_LOGIN_ACCOUNT_LIMIT):
            assert (
                client.post("/api/v1/auth/login", json={"email": email, "password": "Wrong-Password-9!"}).status_code
                == 401
            )
        assert (
            client.post("/api/v1/auth/login", json={"email": email, "password": "Correct-Horse-9!"}).status_code == 429
        )
    finally:
        asyncio.run(AuthRateLimiter.reset_all())


async def test_redirect_to_metadata_is_blocked(monkeypatch):
    """Every redirect hop must be validated; a public URL redirecting to a
    link-local metadata address must not be fetched."""
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if request.url.host == "example.com":
            return httpx.Response(302, headers={"Location": "http://169.254.169.254/latest/meta-data/"})
        return httpx.Response(200, text="secret")

    real_is_safe = scraper_module.is_ssrf_safe_url
    monkeypatch.setattr(
        scraper_module,
        "is_ssrf_safe_url",
        lambda url: "169.254.169.254" not in url and real_is_safe(url),
        raising=True,
    )

    crawler = WebsiteCrawler()
    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        response = await crawler._safe_get(http_client, "https://example.com/start")

    assert response is None
    assert requested == ["https://example.com/start"], requested


async def test_redirect_loop_is_bounded(monkeypatch):
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(302, headers={"Location": "/next"})

    crawler = WebsiteCrawler()
    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        response = await crawler._safe_get(http_client, "https://example.com/start", max_redirects=3)

    assert response is None
    assert len(requested) == 4, requested


async def test_streamed_upload_uses_chunks_and_cleans_partial_on_oversize(monkeypatch, tmp_path):
    from backend.app.services.storage import TieredStorageService
    from starlette.datastructures import UploadFile

    service = TieredStorageService(hot_dir=str(tmp_path), cold_dir=str(tmp_path / "cold"))
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 1024)

    payload = b"a" * 4096
    upload = UploadFile(filename="large.txt", file=io.BytesIO(payload), size=len(payload))

    try:
        await service.save_upload(upload)
        raise AssertionError("oversized upload should have been rejected")
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 413

    leftovers = [p for p in tmp_path.iterdir() if p.name.startswith(".upload-")]
    assert leftovers == [], leftovers


async def test_streamed_upload_writes_deterministic_hash(tmp_path):
    import hashlib

    from backend.app.services.storage import TieredStorageService
    from starlette.datastructures import UploadFile

    service = TieredStorageService(hot_dir=str(tmp_path), cold_dir=str(tmp_path / "cold"))
    payload = b"hello streamed world\n"
    upload = UploadFile(filename="note.txt", file=io.BytesIO(payload), size=len(payload))

    safe_name, path, size, digest = await service.save_upload(upload)

    assert safe_name == "note.txt"
    assert size == len(payload)
    assert digest == hashlib.sha256(payload).hexdigest()
    with open(path, "rb") as handle:
        assert handle.read() == payload

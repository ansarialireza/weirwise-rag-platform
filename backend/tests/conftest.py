"""Pytest fixtures and test database isolation."""

import asyncio
import os
import socket as _socket
import sys
import tempfile
import urllib.parse as _urlparse
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    except Exception:
        pass


# On Windows, asyncpg requires WindowsSelectorEventLoopPolicy to avoid proactor teardown race conditions
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

_test_database_directory = tempfile.TemporaryDirectory(prefix="weirwise-platform-tests-")
_test_database_url = os.environ.get("WEIRWISE_TEST_DATABASE_URL")
if _test_database_url:
    os.environ["DATABASE_URL"] = _test_database_url
else:
    _test_database_path = Path(_test_database_directory.name, "platform_test.db").as_posix()
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_test_database_path}"

# Import all models to ensure metadata is complete
import backend.app.models  # noqa: E402,F401
from backend.app.core.config import settings  # noqa: E402
from backend.app.db.base import Base  # noqa: E402
from backend.app.models.auth import AIRoutingStrategy, SubscriptionTier  # noqa: E402
from backend.app.services.auth_rate_limiter import AuthRateLimiter  # noqa: E402


@pytest.fixture(autouse=True)
def reset_rate_limiter_before_each_test():
    """Ensure in-memory and Redis rate limiting state is reset so test suites do not
    interfere with each other when running hundreds of test cases in rapid succession.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(AuthRateLimiter.reset_all())
        else:
            loop.run_until_complete(AuthRateLimiter.reset_all())
    except RuntimeError:
        asyncio.run(AuthRateLimiter.reset_all())
    yield


@pytest.fixture(scope="session", autouse=True)
def intercept_testclient_for_auto_verification():
    """In test suites outside explicit test_auth.py, automatically verify users upon registration
    so existing workspace, assistant, and billing tests pass without modifications.
    """
    orig_post = httpx.Client.post

    def patched_post(self, url, *args, **kwargs):
        res = orig_post(self, url, *args, **kwargs)
        if str(url).endswith("/api/v1/auth/register") and res.status_code == 201:
            json_body = kwargs.get("json") or {}
            email = json_body.get("email")
            if email and not email.startswith("owner_") and not email.startswith("reset_"):
                # Use verify-email endpoint with OTP from response or database
                otp = res.json().get("verification_otp")
                if otp:
                    orig_post(self, "/api/v1/auth/verify-email", json={"email": email, "otp": otp})
        return res

    httpx.Client.post = patched_post
    yield
    httpx.Client.post = orig_post


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Create all tables synchronously for test session before running tests."""
    if "sqlite" in settings.DATABASE_URL:
        sync_url = settings.DATABASE_URL.replace("+aiosqlite", "")
        engine = create_engine(sync_url)
        Base.metadata.create_all(bind=engine)

        # Seed initial default SubscriptionTiers and AIRoutingStrategies for test suite
        with Session(engine) as s:
            now = datetime.now(timezone.utc)
            if not s.query(SubscriptionTier).first():
                free_tier = SubscriptionTier(
                    id=uuid.uuid4(),
                    name="Free Trial",
                    monthly_price=0.00,
                    max_assistants=2,
                    max_monthly_messages=100,
                    max_storage_mb=50,
                    created_at=now,
                    updated_at=now,
                )
                pro_tier = SubscriptionTier(
                    id=uuid.uuid4(),
                    name="Pro",
                    monthly_price=49.00,
                    max_assistants=25,
                    max_monthly_messages=10000,
                    max_storage_mb=5000,
                    created_at=now,
                    updated_at=now,
                )
                s.add_all([free_tier, pro_tier])

            if not s.query(AIRoutingStrategy).first():
                strat_auto = AIRoutingStrategy(
                    id=uuid.uuid4(),
                    ui_name="Auto",
                    ui_description="Intelligent routing balancing speed, accuracy, and reasoning",
                    target_llm_model="gpt-4o-mini",
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
                strat_fast = AIRoutingStrategy(
                    id=uuid.uuid4(),
                    ui_name="Fast",
                    ui_description="Optimized for lowest latency and rapid conversational responses",
                    target_llm_model="gpt-4o-mini",
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
                strat_deep = AIRoutingStrategy(
                    id=uuid.uuid4(),
                    ui_name="Deep Thinking",
                    ui_description="High-parameter advanced reasoning and complex analysis",
                    target_llm_model="gpt-4o",
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
                s.add_all([strat_auto, strat_fast, strat_deep])

            s.commit()

        yield
        from backend.app.db.session import engine as async_engine

        asyncio.run(async_engine.dispose())
        engine.dispose()
    else:
        # PostgreSQL already migrated via Alembic, keep schema intact
        yield


# ---------------------------------------------------------------------------
# Redis reachability guard — skip tests that require a live Redis connection
# if the configured Redis URL is not reachable in the current environment.
# ---------------------------------------------------------------------------


def _redis_is_reachable() -> bool:
    """Return True only if the Redis URL is configured and the host is reachable."""
    redis_url = os.environ.get("REDIS_URL", "")
    if not redis_url:
        return False
    try:
        parsed = _urlparse.urlparse(redis_url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 6379
        with _socket.create_connection((host, port), timeout=1.0):
            return True
    except (OSError, ValueError):
        return False


requires_redis = pytest.mark.skipif(
    not _redis_is_reachable(),
    reason="Redis is not reachable; skipping Redis-dependent test.",
)

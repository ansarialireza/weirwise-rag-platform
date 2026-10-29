"""Pytest fixtures and test database isolation."""

import asyncio
import sys

# On Windows, asyncpg requires WindowsSelectorEventLoopPolicy to avoid proactor teardown race conditions
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Import all models to ensure metadata is complete
import backend.app.models  # noqa
import pytest
from backend.app.core.config import settings
from backend.app.db.base import Base
from sqlalchemy import create_engine


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Create all tables synchronously for test session before running tests."""
    if "sqlite" in settings.DATABASE_URL:
        sync_url = settings.DATABASE_URL.replace("+aiosqlite", "")
        engine = create_engine(sync_url)
        Base.metadata.create_all(bind=engine)
        yield
        engine.dispose()
    else:
        # PostgreSQL already migrated via Alembic, keep schema intact
        yield

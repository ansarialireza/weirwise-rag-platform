"""Pytest fixtures and test database isolation."""

# Import all models to ensure metadata is complete
import backend.app.models  # noqa
import pytest
from backend.app.core.config import settings
from backend.app.db.base import Base
from sqlalchemy import create_engine


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Create all tables synchronously for SQLite test session before running tests."""
    sync_url = settings.DATABASE_URL.replace("+aiosqlite", "")
    engine = create_engine(sync_url)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()

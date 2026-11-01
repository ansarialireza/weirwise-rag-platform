"""Pytest fixtures and test database isolation."""

import asyncio
import sys

# On Windows, asyncpg requires WindowsSelectorEventLoopPolicy to avoid proactor teardown race conditions
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uuid
from datetime import datetime, timezone

# Import all models to ensure metadata is complete
import backend.app.models  # noqa
import pytest
from backend.app.core.config import settings
from backend.app.db.base import Base
from backend.app.models.auth import AIRoutingStrategy, SubscriptionTier
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


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
        engine.dispose()
    else:
        # PostgreSQL already migrated via Alembic, keep schema intact
        yield

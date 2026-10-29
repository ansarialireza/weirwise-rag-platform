"""Database engine and async session dependency for SQLAlchemy 2.0."""

from collections.abc import AsyncGenerator

from backend.app.core.config import settings
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

# In SQLite, disable check_same_thread for async operation
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

# Use NullPool for PostgreSQL on Windows or in testing to prevent asyncpg connection-sharing across threads/event loops
engine_kwargs = {"echo": settings.DATABASE_ECHO, "future": True, "connect_args": connect_args}
if not settings.DATABASE_URL.startswith("sqlite"):
    engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(
    settings.DATABASE_URL,
    **engine_kwargs,
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields an async database session per request."""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()

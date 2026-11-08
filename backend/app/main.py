"""FastAPI Main Application Entrypoint for Weirwise Platform."""

import asyncio
import time
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from backend.app.adapters.core_client import close_core_clients
from backend.app.api.v1.admin import router as admin_router
from backend.app.api.v1.assistants import router as assistants_router
from backend.app.api.v1.auth import router as auth_router
from backend.app.api.v1.billing import router as billing_router
from backend.app.api.v1.enterprise import router as enterprise_router
from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.integrations import router as integrations_router
from backend.app.api.v1.knowledge import router as knowledge_router
from backend.app.api.v1.public_runtime import router as public_runtime_router
from backend.app.api.v1.telemetry import router as telemetry_router
from backend.app.api.v1.voice import router as voice_router
from backend.app.api.v1.workspaces import router as workspaces_router
from backend.app.core.config import settings
from backend.app.core.logging import configure_logging, logger
from backend.app.core.security_headers import SecurityHeadersMiddleware
from backend.app.db.base import Base
from backend.app.db.session import engine
from backend.app.services.llm import close_provider_clients
from backend.app.services.storage import storage_service
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

configure_logging()


async def _ephemeral_storage_reaper_loop():
    """Background Reaper: Periodically scans local /tmp hot upload directory
    and forcefully deletes any orphaned files older than 1 hour.
    """
    logger.info("Starting ephemeral storage reaper background loop (hourly interval)...")
    while True:
        try:
            await asyncio.sleep(3600)  # Run every hour
            reaped = storage_service.reap_orphaned_temp_files(max_age_seconds=3600)
            if reaped > 0:
                logger.info(f"Storage Reaper purged {reaped} orphaned files from hot tier /tmp.")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Storage Reaper encountered an error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan event handler initializing database tables, resources, and storage reaper."""
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION} [{settings.ENVIRONMENT}]")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    reaper_task = asyncio.create_task(_ephemeral_storage_reaper_loop())
    yield
    logger.info(f"Shutting down {settings.PROJECT_NAME}")
    reaper_task.cancel()
    await close_core_clients()
    await close_provider_clients()
    await engine.dispose()


def create_application() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description="Weirwise Platform - Enterprise Multi-tenant AI Assistant & Knowledge Platform",
        docs_url="/docs" if (settings.DEBUG or settings.ENVIRONMENT in ("development", "dev", "test")) else None,
        redoc_url="/redoc" if (settings.DEBUG or settings.ENVIRONMENT in ("development", "dev", "test")) else None,
        openapi_url="/openapi.json"
        if (settings.DEBUG or settings.ENVIRONMENT in ("development", "dev", "test"))
        else None,
        lifespan=lifespan,
    )

    # Middleware: Request ID and structured request timing
    @app.middleware("http")
    async def request_context_middleware(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        start_time = time.perf_counter()
        response: Response = await call_next(request)
        process_time = (time.perf_counter() - start_time) * 1000
        response.headers["X-Request-ID"] = req_id
        response.headers["X-Process-Time-MS"] = f"{process_time:.2f}"
        return response

    app.add_middleware(SecurityHeadersMiddleware)

    # CORS configuration
    if settings.ALLOWED_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.ALLOWED_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Include API Routers under /api/v1
    app.include_router(health_router)
    app.include_router(public_runtime_router, prefix="/api/v1")
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(knowledge_router, prefix="/api/v1")
    app.include_router(assistants_router, prefix="/api/v1")
    app.include_router(integrations_router, prefix="/api/v1")
    app.include_router(enterprise_router, prefix="/api/v1")
    app.include_router(billing_router, prefix="/api/v1")
    app.include_router(workspaces_router, prefix="/api/v1")
    app.include_router(admin_router, prefix="/api/v1")
    app.include_router(telemetry_router, prefix="/api/v1")
    app.include_router(voice_router, prefix="/api/v1")

    return app


app = create_application()

"""FastAPI Main Application Entrypoint for Weirwise Platform."""

import time
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from backend.app.api.v1.admin import router as admin_router
from backend.app.api.v1.assistants import router as assistants_router
from backend.app.api.v1.auth import router as auth_router
from backend.app.api.v1.billing import router as billing_router
from backend.app.api.v1.enterprise import router as enterprise_router
from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.integrations import router as integrations_router
from backend.app.api.v1.knowledge import router as knowledge_router
from backend.app.api.v1.public_runtime import router as public_runtime_router
from backend.app.api.v1.workspaces import router as workspaces_router
from backend.app.core.config import settings
from backend.app.core.logging import configure_logging, logger
from backend.app.db.base import Base
from backend.app.db.session import engine
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan event handler initializing database tables and resources."""
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION} [{settings.ENVIRONMENT}]")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    logger.info(f"Shutting down {settings.PROJECT_NAME}")
    await engine.dispose()


def create_application() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description="Weirwise Platform - Enterprise Multi-tenant AI Assistant & Knowledge Platform",
        docs_url="/docs" if settings.DEBUG or settings.ENVIRONMENT == "development" else None,
        redoc_url="/redoc" if settings.DEBUG or settings.ENVIRONMENT == "development" else None,
        openapi_url="/openapi.json" if settings.DEBUG or settings.ENVIRONMENT == "development" else None,
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
    app.include_router(workspaces_router, prefix="/api/v1")
    app.include_router(knowledge_router, prefix="/api/v1")
    app.include_router(assistants_router, prefix="/api/v1")
    app.include_router(integrations_router, prefix="/api/v1")
    app.include_router(enterprise_router, prefix="/api/v1")
    app.include_router(billing_router, prefix="/api/v1")
    app.include_router(admin_router, prefix="/api/v1")

    return app


app = create_application()

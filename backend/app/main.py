"""
Main FastAPI Application Entrypoint.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from backend.app.api.router import api_router
from backend.app.core.config import settings
from backend.app.core.exceptions import register_exception_handlers
from backend.app.core.logging import logger, setup_logging


import asyncio
import os
from typing import Optional

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager for startup and shutdown events.
    """
    # Startup
    setup_logging()
    logger.info("Starting %s v%s in [%s] mode...", settings.PROJECT_NAME, settings.VERSION, settings.ENVIRONMENT)

    firms_task: Optional[asyncio.Task] = None
    is_testing = (
        settings.ENVIRONMENT.lower() in ("test", "testing")
        or "PYTEST_CURRENT_TEST" in os.environ
    )
    if settings.LIVE_REFRESH_ENABLED and not is_testing:
        from backend.app.services.firms_scheduler import run_periodic_firms_loop
        firms_task = asyncio.create_task(run_periodic_firms_loop(), name="firms_background_ingestion")
        logger.info("Spawned NASA FIRMS background ingestion task (interval: %ds)", settings.LIVE_REFRESH_INTERVAL_SECONDS)

    yield

    # Shutdown
    logger.info("Shutting down %s...", settings.PROJECT_NAME)
    if firms_task and not firms_task.done():
        logger.info("Stopping NASA FIRMS background ingestion task...")
        firms_task.cancel()
        try:
            await firms_task
        except asyncio.CancelledError:
            pass
        logger.info("NASA FIRMS background ingestion task stopped cleanly.")


def create_application() -> FastAPI:
    """
    FastAPI Application Factory.
    """
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        debug=settings.DEBUG,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json"
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register Global Exception Handlers
    register_exception_handlers(app)

    # Include API Routers
    # Provides both /api/health and versioned /api/v1/health endpoints
    app.include_router(api_router, prefix="/api")
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    return app


app = create_application()

if __name__ == "__main__":
    uvicorn.run(
        "backend.app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )

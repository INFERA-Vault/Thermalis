from fastapi import APIRouter, status
from backend.app.core.config import settings
from backend.app.schemas.health import HealthResponse
from backend.app.services.firms_scheduler import sync_tracker

router = APIRouter()


@router.get("/health", response_model=HealthResponse, status_code=status.HTTP_200_OK, summary="Health Check")
async def health_check() -> HealthResponse:
    """
    Returns basic application health status, environment info, and last FIRMS sync state.
    """
    return HealthResponse(
        status="ok",
        service=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        last_firms_sync_at=sync_tracker.last_sync_at.isoformat() if sync_tracker.last_sync_at else None,
        firms_sync_status=sync_tracker.last_sync_status
    )

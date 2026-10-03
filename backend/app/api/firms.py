from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.logging import logger
from backend.app.schemas.firms import FIRMSIngestRequest, FIRMSIngestSummary
from backend.app.services.firms import FIRMSService
from backend.app.services.firms_scheduler import execute_firms_refresh, sync_tracker


router = APIRouter()


@router.post(
    "/ingest",
    response_model=FIRMSIngestSummary,
    status_code=status.HTTP_200_OK,
    summary="Trigger NASA FIRMS Ingestion",
    description="Fetches, validates, normalizes, deduplicates, and stores NASA FIRMS thermal anomaly events."
)
async def ingest_firms_data(
    request: FIRMSIngestRequest,
    db: Session = Depends(get_db)
) -> FIRMSIngestSummary:
    """
    Executes the ingestion workflow for the requested spatial bounds/country and date range.
    """
    service = FIRMSService()
    
    db_session: Optional[Session] = db
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("Database unavailable during FIRMS ingestion API call: %s", exc)
        db_session = None

    result = await service.ingest(request=request, db=db_session)
    return result


@router.post(
    "/refresh",
    response_model=FIRMSIngestSummary,
    status_code=status.HTTP_200_OK,
    summary="Controlled NASA FIRMS Refresh",
    description="Fetches recent FIRMS data using safe predefined configuration (rolling day_range=2 window, India bounding box)."
)
async def refresh_firms_data() -> FIRMSIngestSummary:
    """
    Executes a safe, configured, live ingestion workflow to retrieve newly observed events.
    Reuses the central execute_firms_refresh pipeline and respects concurrency locking.
    """
    return await execute_firms_refresh(day_range=settings.LIVE_REFRESH_DAY_RANGE)


@router.get(
    "/status",
    response_model=Dict[str, Any],
    status_code=status.HTTP_200_OK,
    summary="FIRMS Live Sync Status",
    description="Returns current background worker state, last sync timestamp, and telemetry counts."
)
async def get_firms_sync_status() -> Dict[str, Any]:
    """
    Returns live synchronization status and metrics from the background tracker.
    """
    return sync_tracker.to_dict()


"""
API Router for NASA FIRMS Ingestion.
"""

from typing import Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from sqlalchemy import text

from backend.app.core.database import get_db
from backend.app.core.logging import logger
from backend.app.schemas.firms import FIRMSIngestRequest, FIRMSIngestSummary
from backend.app.services.firms import FIRMSService


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
    
    # Check if database is accessible; if not, service still processes & validates
    db_session: Optional[Session] = db
    try:
        # Quick test of database connection
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
    description="Fetches recent FIRMS data using safe predefined configuration (last 1 day, specific region)."
)
async def refresh_firms_data(
    db: Session = Depends(get_db)
) -> FIRMSIngestSummary:
    """
    Executes a safe, configured, live ingestion workflow to retrieve newly observed events.
    """
    from backend.app.core.config import settings
    from backend.app.schemas.firms import FIRMSSourceEnum

    if not settings.LIVE_REFRESH_ENABLED:
        return FIRMSIngestSummary(
            status="failed",
            source=settings.LIVE_REFRESH_SOURCE,
            total_received=0,
            valid_records=0,
            rejected_records=0,
            duplicate_records=0,
            persisted_records=0,
            details={"error": "Live refresh is disabled in configuration."}
        )

    from backend.app.schemas.firms import FIRMSSourceEnum, BBoxSchema

    # Hard-coded day_range=1 for safety to only fetch the latest day's data on refresh
    # Using a bounding box for India (approx: 68E to 97E, 8N to 37N) 
    # since NASA FIRMS Country API is returning 400 Invalid API call
    request = FIRMSIngestRequest(
        source=FIRMSSourceEnum(settings.LIVE_REFRESH_SOURCE),
        bbox=BBoxSchema(min_lon=68.0, min_lat=8.0, max_lon=97.0, max_lat=37.0),
        day_range=1
    )

    service = FIRMSService()
    
    db_session: Optional[Session] = db
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("Database unavailable during FIRMS refresh API call: %s", exc)
        db_session = None

    result = await service.ingest(request=request, db=db_session)
    return result

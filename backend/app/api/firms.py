"""
API Router for NASA FIRMS Ingestion.
"""

from typing import Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

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
        db.execute(db.bind.text("SELECT 1")) if hasattr(db, "bind") and db.bind else None
    except Exception as exc:
        logger.warning("Database unavailable during FIRMS ingestion API call: %s", exc)
        db_session = None

    result = await service.ingest(request=request, db=db_session)
    return result

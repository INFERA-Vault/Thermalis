"""
Background Task and Scheduling Manager for NASA FIRMS Live Ingestion.
Coordinates recurring periodic polling, concurrency locking, deduplication, and sync status telemetry.
"""

import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import SessionLocal
from backend.app.core.logging import logger
from backend.app.schemas.firms import (
    BBoxSchema,
    FIRMSIngestRequest,
    FIRMSIngestSummary,
    FIRMSSourceEnum,
)
from backend.app.services.firms import FIRMSService


class FIRMSSyncTracker:
    """
    In-memory state tracker for live NASA FIRMS synchronization telemetry.
    """
    def __init__(self):
        self.last_sync_at: Optional[datetime] = None
        self.last_sync_status: str = "idle"  # "idle", "syncing", "success", "error"
        self.last_sync_error: Optional[str] = None
        self.last_received_count: int = 0
        self.last_valid_count: int = 0
        self.last_persisted_count: int = 0
        self.last_duplicate_count: int = 0
        self.total_cycles_completed: int = 0
        self.is_running: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_running": self.is_running,
            "interval_seconds": settings.LIVE_REFRESH_INTERVAL_SECONDS,
            "day_range": settings.LIVE_REFRESH_DAY_RANGE,
            "source": settings.LIVE_REFRESH_SOURCE,
            "last_sync_at": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "last_sync_status": self.last_sync_status,
            "last_sync_error": self.last_sync_error,
            "last_received_count": self.last_received_count,
            "last_valid_count": self.last_valid_count,
            "last_persisted_count": self.last_persisted_count,
            "last_duplicate_count": self.last_duplicate_count,
            "total_cycles_completed": self.total_cycles_completed,
        }


# Global singleton tracker and concurrency lock
sync_tracker = FIRMSSyncTracker()
ingestion_lock = asyncio.Lock()


async def execute_firms_refresh(day_range: Optional[int] = None) -> FIRMSIngestSummary:
    """
    Executes a safe, concurrency-locked NASA FIRMS live refresh using a rolling time window.
    Deduplicates against the database and triggers alert processing for new events.
    """
    if not settings.LIVE_REFRESH_ENABLED:
        logger.info("FIRMS live refresh is disabled in configuration.")
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

    if ingestion_lock.locked():
        logger.warning("FIRMS ingestion cycle already in progress; skipping duplicate invocation.")
        return FIRMSIngestSummary(
            status="in_progress",
            source=settings.LIVE_REFRESH_SOURCE,
            total_received=0,
            valid_records=0,
            rejected_records=0,
            duplicate_records=0,
            persisted_records=0,
            details={"message": "Another ingestion cycle is currently running."}
        )

    actual_day_range = day_range or settings.LIVE_REFRESH_DAY_RANGE

    async with ingestion_lock:
        sync_tracker.last_sync_status = "syncing"
        sync_tracker.last_sync_error = None
        db: Optional[Session] = None

        try:
            db = SessionLocal()
            request = FIRMSIngestRequest(
                source=FIRMSSourceEnum(settings.LIVE_REFRESH_SOURCE),
                bbox=BBoxSchema(
                    min_lon=settings.LIVE_REFRESH_BBOX_MIN_LON,
                    min_lat=settings.LIVE_REFRESH_BBOX_MIN_LAT,
                    max_lon=settings.LIVE_REFRESH_BBOX_MAX_LON,
                    max_lat=settings.LIVE_REFRESH_BBOX_MAX_LAT,
                ),
                day_range=actual_day_range
            )

            service = FIRMSService()
            summary = await service.ingest(request=request, db=db)

            # Update tracker telemetry
            sync_tracker.last_sync_at = datetime.now(timezone.utc)
            sync_tracker.last_sync_status = "success"
            sync_tracker.last_received_count = summary.total_received
            sync_tracker.last_valid_count = summary.valid_records
            sync_tracker.last_persisted_count = summary.persisted_records
            sync_tracker.last_duplicate_count = summary.duplicate_records
            sync_tracker.total_cycles_completed += 1

            logger.info(
                "FIRMS refresh cycle completed: %d received, %d valid, %d new persisted, %d duplicates",
                summary.total_received,
                summary.valid_records,
                summary.persisted_records,
                summary.duplicate_records
            )
            return summary

        except Exception as exc:
            sync_tracker.last_sync_status = "error"
            sync_tracker.last_sync_error = str(exc)
            logger.error("FIRMS live refresh cycle failed: %s", exc)
            return FIRMSIngestSummary(
                status="failed",
                source=settings.LIVE_REFRESH_SOURCE,
                total_received=0,
                valid_records=0,
                rejected_records=0,
                duplicate_records=0,
                persisted_records=0,
                details={"error": str(exc)}
            )
        finally:
            if db is not None:
                try:
                    db.close()
                except Exception:
                    pass


async def run_periodic_firms_loop() -> None:
    """
    Background worker loop that runs for the lifetime of the FastAPI application.
    Executes an initial sync upon startup, then repeats at LIVE_REFRESH_INTERVAL_SECONDS.
    """
    sync_tracker.is_running = True
    logger.info(
        "NASA FIRMS periodic background worker started (interval: %ds, source: %s, rolling window: day_range=%d)",
        settings.LIVE_REFRESH_INTERVAL_SECONDS,
        settings.LIVE_REFRESH_SOURCE,
        settings.LIVE_REFRESH_DAY_RANGE
    )

    # Initial brief startup grace period (2 seconds) so FastAPI finishes binding and database pool is active
    try:
        await asyncio.sleep(2)
        logger.info("Executing initial startup NASA FIRMS live synchronization...")
        await execute_firms_refresh(day_range=settings.LIVE_REFRESH_DAY_RANGE)
    except asyncio.CancelledError:
        logger.info("NASA FIRMS background worker cancelled during initial startup.")
        sync_tracker.is_running = False
        return
    except Exception as exc:
        logger.error("Initial NASA FIRMS ingestion run encountered error: %s", exc)

    # Recurring periodic refresh loop
    while True:
        try:
            await asyncio.sleep(settings.LIVE_REFRESH_INTERVAL_SECONDS)
            await execute_firms_refresh(day_range=settings.LIVE_REFRESH_DAY_RANGE)
        except asyncio.CancelledError:
            logger.info("NASA FIRMS periodic background worker received cancellation signal. Exiting loop.")
            sync_tracker.is_running = False
            break
        except Exception as exc:
            logger.error("Unexpected error in NASA FIRMS background worker loop: %s", exc)
            # Sleep briefly before retrying to prevent hot looping in case of immediate recurring faults
            try:
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                sync_tracker.is_running = False
                break

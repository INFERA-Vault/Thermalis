"""
NASA FIRMS Data Ingestion Service.
Handles downloading, parsing, validating, normalizing, deduplicating, and persisting thermal anomaly data.
"""

import csv
from datetime import datetime, timezone
import io
from typing import List, Optional, Set, Tuple
import httpx
from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement

from backend.app.core.config import settings
from backend.app.core.exceptions import AppException
from backend.app.core.logging import logger
from backend.app.models.thermal_event import ThermalEvent
from backend.app.schemas.firms import (
    FIRMSEventRecord,
    FIRMSIngestRequest,
    FIRMSIngestSummary,
)


class FIRMSService:
    """
    Service for ingesting and processing NASA FIRMS thermal anomaly data.
    """

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or settings.FIRMS_API_KEY
        self.base_url = (base_url or settings.FIRMS_BASE_URL).rstrip("/")
        self.timeout = settings.FIRMS_TIMEOUT

    def build_request_url(self, request: FIRMSIngestRequest) -> str:
        """
        Constructs the FIRMS API URL for area or country queries.
        Never exposes the API key in logs.
        """
        if not self.api_key:
            raise AppException(
                message="NASA FIRMS API key is not configured. Please set FIRMS_API_KEY in the environment or .env file.",
                status_code=400
            )

        source_val = request.source.value if hasattr(request.source, "value") else str(request.source)

        if request.bbox:
            # Area bounding box query: /api/area/csv/[MAP_KEY]/[SOURCE]/[BBOX]/[DAYS]/[DATE]
            bbox_str = request.bbox.to_firms_format()
            url = f"{self.base_url}/area/csv/{self.api_key}/{source_val}/{bbox_str}/{request.day_range}"
        elif request.country_code:
            # Country query: /api/country/csv/[MAP_KEY]/[SOURCE]/[COUNTRY]/[DAYS]/[DATE]
            country_clean = request.country_code.strip().upper()
            url = f"{self.base_url}/country/csv/{self.api_key}/{source_val}/{country_clean}/{request.day_range}"
        else:
            raise AppException("Either 'bbox' or 'country_code' must be specified for FIRMS request.", status_code=400)

        if request.date:
            url += f"/{request.date}"

        return url

    async def fetch_raw_data(self, request: FIRMSIngestRequest) -> str:
        """
        Retrieves raw CSV thermal anomaly data from NASA FIRMS API.
        """
        url = self.build_request_url(request)
        source_name = request.source.value if hasattr(request.source, "value") else str(request.source)
        
        logger.info(
            "Requesting NASA FIRMS data for source [%s], day_range=%d (date=%s)",
            source_name,
            request.day_range,
            request.date or "latest"
        )

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url)

            if response.status_code == 401 or response.status_code == 403:
                logger.error("NASA FIRMS authentication failed. Check FIRMS_API_KEY.")
                raise AppException("Invalid or unauthorized NASA FIRMS API key.", status_code=401)
            elif response.status_code != 200:
                logger.error("NASA FIRMS request failed with HTTP %d: %s", response.status_code, response.text[:200])
                raise AppException(
                    f"NASA FIRMS API returned error status {response.status_code}: {response.text[:100]}",
                    status_code=response.status_code
                )

            csv_text = response.text
            # FIRMS returns an error string if invalid map key or parameters: e.g. "Invalid MAP_KEY" or "Error: ..."
            if "Invalid MAP_KEY" in csv_text or "Transaction limit" in csv_text:
                logger.error("NASA FIRMS error response: %s", csv_text.strip())
                raise AppException(f"NASA FIRMS error: {csv_text.strip()}", status_code=400)

            logger.info("FIRMS request completed successfully (%d bytes received)", len(csv_text))
            return csv_text

        except httpx.RequestError as exc:
            logger.error("Network error communicating with NASA FIRMS API: %s", exc)
            raise AppException(f"Unable to connect to NASA FIRMS API: {str(exc)}", status_code=502)

    def parse_and_validate(self, raw_csv: str, source: str) -> Tuple[List[FIRMSEventRecord], int, List[str]]:
        """
        Parses raw CSV content, validates fields, and normalizes into FIRMSEventRecord instances.
        Returns: (valid_records, rejected_count, rejection_reasons)
        """
        valid_records: List[FIRMSEventRecord] = []
        rejection_reasons: List[str] = []
        rejected_count = 0

        clean_csv = raw_csv.strip().lstrip("\ufeff")
        if not clean_csv:
            return valid_records, rejected_count, rejection_reasons

        reader = csv.DictReader(io.StringIO(clean_csv))
        if not reader.fieldnames:
            return valid_records, rejected_count, rejection_reasons

        for row_idx, raw_row in enumerate(reader, start=1):
            row = {k.strip().lower(): v.strip() for k, v in raw_row.items() if k is not None and v is not None}
            record, error = self._normalize_single_row(row, source, row_idx)
            if record:
                valid_records.append(record)
            else:
                rejected_count += 1
                if error:
                    rejection_reasons.append(f"Row {row_idx}: {error}")

        logger.info(
            "Parsed FIRMS payload: %d valid records, %d rejected records",
            len(valid_records),
            rejected_count
        )
        return valid_records, rejected_count, rejection_reasons

    def _normalize_single_row(self, row: dict, source: str, row_idx: int) -> Tuple[Optional[FIRMSEventRecord], Optional[str]]:
        """
        Validates coordinate bounds, formats timestamps, and extracts thermal metrics for one row.
        """
        try:
            # 1. Coordinates validation
            lat_str = row.get("latitude")
            lon_str = row.get("longitude")
            if not lat_str or not lon_str:
                return None, "Missing latitude or longitude"

            try:
                lat = float(lat_str)
                lon = float(lon_str)
            except ValueError:
                return None, f"Non-numeric coordinates: lat='{lat_str}', lon='{lon_str}'"

            if not (-90.0 <= lat <= 90.0):
                return None, f"Latitude {lat} out of bounds [-90, 90]"
            if not (-180.0 <= lon <= 180.0):
                return None, f"Longitude {lon} out of bounds [-180, 180]"

            # 2. Timestamp extraction & parsing
            acq_date = row.get("acq_date")
            acq_time = row.get("acq_time")
            if not acq_date or not acq_time:
                return None, "Missing acq_date or acq_time"

            acq_time_clean = acq_time.strip()
            if not acq_time_clean.isdigit():
                return None, f"Invalid acq_time format: '{acq_time}'"

            time_digits = acq_time_clean.zfill(4)
            if len(time_digits) != 4:
                return None, f"Invalid acq_time length: '{acq_time}'"

            hh, mm = int(time_digits[:2]), int(time_digits[2:])
            if not (0 <= hh <= 23 and 0 <= mm <= 59):
                return None, f"Invalid hour/minute in acq_time: '{acq_time}'"

            try:
                detected_at = datetime.strptime(f"{acq_date} {time_digits}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
            except ValueError as val_err:
                return None, f"Invalid date/time value: '{acq_date} {time_digits}' ({val_err})"

            # 3. Brightness temperature extraction (VIIRS bright_ti4 or MODIS brightness)
            brightness_temp: Optional[float] = None
            for key in ["bright_ti4", "brightness", "bright_ti5", "bright_t31"]:
                if key in row and row[key]:
                    try:
                        val = float(row[key])
                        if 150.0 <= val <= 650.0:  # Physically sensible Kelvin range
                            brightness_temp = val
                            break
                    except ValueError:
                        pass

            # 4. Fire Radiative Power (FRP) extraction in MW
            frp: Optional[float] = None
            if "frp" in row and row["frp"]:
                try:
                    f_val = float(row["frp"])
                    if f_val >= 0.0:
                        frp = f_val
                except ValueError:
                    pass

            # 5. Confidence string/value
            confidence: Optional[str] = row.get("confidence")

            # 6. Satellite platform / sensor
            satellite: Optional[str] = row.get("satellite") or row.get("instrument")

            # 7. Deterministic unique source_event_id
            sat_key = (satellite or "sat").replace(" ", "_")
            source_event_id = f"firms_{source.lower()}_{sat_key}_{lat:.5f}_{lon:.5f}_{detected_at.strftime('%Y%m%d%H%M')}"

            record = FIRMSEventRecord(
                source=source,
                source_event_id=source_event_id,
                detected_at=detected_at,
                latitude=lat,
                longitude=lon,
                brightness_temperature=brightness_temp,
                frp=frp,
                confidence=confidence,
                satellite=satellite,
            )
            return record, None

        except Exception as exc:
            return None, f"Unexpected error parsing row: {str(exc)}"

    def deduplicate(
        self,
        records: List[FIRMSEventRecord],
        db: Optional[Session] = None
    ) -> Tuple[List[FIRMSEventRecord], int]:
        """
        Deduplicates records within the current batch and against the database (if connected).
        Returns: (unique_records, duplicate_count)
        """
        if not records:
            return [], 0

        # Step 1: Batch-internal deduplication
        seen_ids: Set[str] = set()
        batch_unique: List[FIRMSEventRecord] = []
        batch_duplicates = 0

        for rec in records:
            if rec.source_event_id in seen_ids:
                batch_duplicates += 1
            else:
                seen_ids.add(rec.source_event_id)
                batch_unique.append(rec)

        # Step 2: Database-level deduplication (if DB session is provided and active)
        if db is not None:
            try:
                candidate_ids = [r.source_event_id for r in batch_unique]
                existing_ids = set(
                    db.query(ThermalEvent.source_event_id)
                    .filter(ThermalEvent.source_event_id.in_(candidate_ids))
                    .all()
                )
                existing_id_set = {eid[0] for eid in existing_ids}
                
                final_unique: List[FIRMSEventRecord] = []
                for r in batch_unique:
                    if r.source_event_id in existing_id_set:
                        batch_duplicates += 1
                    else:
                        final_unique.append(r)
                
                logger.info(
                    "Deduplication completed: %d unique records, %d duplicates filtered",
                    len(final_unique),
                    batch_duplicates
                )
                return final_unique, batch_duplicates
            except Exception as exc:
                logger.warning("Database query during deduplication failed (will rely on in-memory batch unique): %s", exc)

        return batch_unique, batch_duplicates

    def to_thermal_events(self, records: List[FIRMSEventRecord]) -> List[ThermalEvent]:
        """
        Converts validated FIRMSEventRecords to SQLAlchemy ThermalEvent ORM models with PostGIS Points.
        """
        events: List[ThermalEvent] = []
        for r in records:
            event = ThermalEvent(
                source=r.source,
                source_event_id=r.source_event_id,
                detected_at=r.detected_at,
                latitude=r.latitude,
                longitude=r.longitude,
                geometry=WKTElement(f"POINT({r.longitude} {r.latitude})", srid=4326),
                brightness_temperature=r.brightness_temperature,
                frp=r.frp,
                confidence=r.confidence,
                satellite=r.satellite,
            )
            events.append(event)
        return events

    async def ingest(
        self,
        request: FIRMSIngestRequest,
        db: Optional[Session] = None
    ) -> FIRMSIngestSummary:
        """
        Executes the full FIRMS ingestion pipeline:
        Fetch -> Parse & Validate -> Deduplicate -> Persist (if DB available).
        """
        source_name = request.source.value if hasattr(request.source, "value") else str(request.source)
        
        # 1. Fetch raw data from NASA FIRMS API
        raw_csv = await self.fetch_raw_data(request)

        # 2. Parse and validate
        valid_records, rejected_count, rejection_reasons = self.parse_and_validate(raw_csv, source_name)
        total_received = len(valid_records) + rejected_count

        # 3. Deduplicate
        unique_records, duplicate_count = self.deduplicate(valid_records, db)

        # 4. Persist to Database if session available
        persisted_count = 0
        if db is not None and unique_records:
            try:
                orm_events = self.to_thermal_events(unique_records)
                db.add_all(orm_events)
                db.commit()
                persisted_count = len(orm_events)
                logger.info("Persisted %d new ThermalEvent records to database", persisted_count)
            except Exception as exc:
                logger.error("Failed to persist ThermalEvents to database: %s", exc)
                db.rollback()
                raise AppException(f"Database persistence failed: {str(exc)}", status_code=500)

        return FIRMSIngestSummary(
            status="success" if (unique_records or total_received == 0) else "partial",
            source=source_name,
            total_received=total_received,
            valid_records=len(valid_records),
            rejected_records=rejected_count,
            duplicate_records=duplicate_count,
            persisted_records=persisted_count,
            details={
                "rejection_sample": rejection_reasons[:5] if rejection_reasons else [],
                "db_persisted": persisted_count > 0
            }
        )

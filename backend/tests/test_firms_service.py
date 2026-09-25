"""
Unit tests for NASA FIRMS Service: parsing, validation, normalization, deduplication, and ORM conversion.
"""

from datetime import datetime, timezone
import pytest
from geoalchemy2.elements import WKTElement

from backend.app.models.thermal_event import ThermalEvent
from backend.app.schemas.firms import (
    BBoxSchema,
    FIRMSEventRecord,
    FIRMSIngestRequest,
    FIRMSSourceEnum,
)
from backend.app.services.firms import FIRMSService


# Sample CSV fixtures (clearly marked as synthetic test fixtures conforming to NASA FIRMS format)
SAMPLE_VIIRS_CSV_FIXTURE = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
28.6139,77.2090,342.5,0.39,0.36,2026-03-24,0530,N,VIIRS,nominal,2.0NRT,295.2,14.8,D
19.0760,72.8777,365.1,0.45,0.40,2026-03-24,1425,N,VIIRS,high,2.0NRT,310.0,42.1,N
"""

SAMPLE_MODIS_CSV_FIXTURE = """latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
22.5726,88.3639,318.4,1.0,1.0,2026-03-24,0430,T,MODIS,85,6.1NRT,290.0,25.0,D
"""

SAMPLE_MALFORMED_CSV_FIXTURE = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
95.0000,77.2090,342.5,0.39,0.36,2026-03-24,0530,N,VIIRS,nominal,2.0NRT,295.2,14.8,D
28.6139,200.0000,342.5,0.39,0.36,2026-03-24,0530,N,VIIRS,nominal,2.0NRT,295.2,14.8,D
invalid_lat,77.2090,342.5,0.39,0.36,2026-03-24,0530,N,VIIRS,nominal,2.0NRT,295.2,14.8,D
28.6139,77.2090,342.5,0.39,0.36,2026-03-24,invalid_time,N,VIIRS,nominal,2.0NRT,295.2,14.8,D
28.6139,77.2090,342.5,0.39,0.36,2026-03-24,0530,N,VIIRS,nominal,2.0NRT,295.2,14.8,D
"""


def test_bbox_schema_validation():
    """
    Test BBox schema validates coordinate ranges and orders.
    """
    bbox = BBoxSchema(min_lon=70.0, min_lat=15.0, max_lon=80.0, max_lat=25.0)
    assert bbox.to_firms_format() == "70.0,15.0,80.0,25.0"

    # Out of bounds latitude
    with pytest.raises(ValueError):
        BBoxSchema(min_lon=70.0, min_lat=-95.0, max_lon=80.0, max_lat=25.0)

    # Inverted longitude bounds
    with pytest.raises(ValueError):
        BBoxSchema(min_lon=85.0, min_lat=15.0, max_lon=80.0, max_lat=25.0)


def test_parse_viirs_csv():
    """
    Test parsing and normalizing standard VIIRS CSV output.
    """
    service = FIRMSService(api_key="test_key")
    valid_records, rejected_count, rejection_reasons = service.parse_and_validate(
        SAMPLE_VIIRS_CSV_FIXTURE,
        source="VIIRS_SNPP_NRT"
    )

    assert rejected_count == 0
    assert len(valid_records) == 2

    rec1 = valid_records[0]
    assert rec1.latitude == pytest.approx(28.6139)
    assert rec1.longitude == pytest.approx(77.2090)
    assert rec1.brightness_temperature == pytest.approx(342.5)
    assert rec1.frp == pytest.approx(14.8)
    assert rec1.confidence == "nominal"
    assert rec1.satellite == "N"
    assert rec1.detected_at == datetime(2026, 3, 24, 5, 30, tzinfo=timezone.utc)
    assert rec1.source_event_id.startswith("firms_viirs_snpp_nrt_")


def test_parse_modis_csv():
    """
    Test parsing and normalizing MODIS CSV output.
    """
    service = FIRMSService(api_key="test_key")
    valid_records, rejected_count, rejection_reasons = service.parse_and_validate(
        SAMPLE_MODIS_CSV_FIXTURE,
        source="MODIS_NRT"
    )

    assert rejected_count == 0
    assert len(valid_records) == 1

    rec = valid_records[0]
    assert rec.latitude == pytest.approx(22.5726)
    assert rec.longitude == pytest.approx(88.3639)
    assert rec.brightness_temperature == pytest.approx(318.4)
    assert rec.frp == pytest.approx(25.0)
    assert rec.confidence == "85"
    assert rec.detected_at == datetime(2026, 3, 24, 4, 30, tzinfo=timezone.utc)


def test_parse_malformed_csv_handling():
    """
    Test that invalid/malformed rows (out-of-bound coords, bad times, non-numeric values)
    are cleanly rejected without crashing the pipeline.
    """
    service = FIRMSService(api_key="test_key")
    valid_records, rejected_count, rejection_reasons = service.parse_and_validate(
        SAMPLE_MALFORMED_CSV_FIXTURE,
        source="VIIRS_SNPP_NRT"
    )

    # 4 invalid rows, 1 valid row
    assert rejected_count == 4
    assert len(valid_records) == 1
    assert len(rejection_reasons) == 4


def test_deduplication_in_batch():
    """
    Test deduplicating identical FIRMS events in a batch.
    """
    service = FIRMSService(api_key="test_key")
    duplicate_csv = SAMPLE_VIIRS_CSV_FIXTURE + SAMPLE_VIIRS_CSV_FIXTURE
    valid_records, _, _ = service.parse_and_validate(duplicate_csv, source="VIIRS_SNPP_NRT")
    assert len(valid_records) == 4

    unique_records, duplicate_count = service.deduplicate(valid_records, db=None)
    assert len(unique_records) == 2
    assert duplicate_count == 2


def test_to_thermal_events_orm_conversion():
    """
    Test converting intermediate FIRMSEventRecord to SQLAlchemy ThermalEvent with PostGIS Geometry.
    """
    service = FIRMSService(api_key="test_key")
    valid_records, _, _ = service.parse_and_validate(SAMPLE_VIIRS_CSV_FIXTURE, source="VIIRS_SNPP_NRT")
    
    events = service.to_thermal_events(valid_records)
    assert len(events) == 2
    assert isinstance(events[0], ThermalEvent)
    assert events[0].latitude == pytest.approx(28.6139)
    assert events[0].longitude == pytest.approx(77.2090)
    assert isinstance(events[0].geometry, WKTElement)
    assert events[0].geometry.srid == 4326
    assert str(events[0].geometry) == "POINT(77.209 28.6139)"

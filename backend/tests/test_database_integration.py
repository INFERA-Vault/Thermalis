"""
Integration tests for PostgreSQL + PostGIS live database and FIRMS persistence.
Runs when a live PostgreSQL/PostGIS instance is reachable; otherwise marks with an explicit status.
"""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from geoalchemy2.elements import WKTElement

from backend.app.core.config import settings
from backend.app.models.thermal_event import ThermalEvent
from backend.app.schemas.firms import FIRMSEventRecord
from backend.app.services.firms import FIRMSService


def is_database_reachable() -> bool:
    """Checks if PostgreSQL is currently accepting connections."""
    try:
        engine = create_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 2})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


live_db_required = pytest.mark.skipif(
    not is_database_reachable(),
    reason="PostgreSQL/PostGIS server is offline or unreachable at configured DATABASE_URL (localhost:5432)"
)


@live_db_required
def test_postgis_extension_and_version():
    """
    Verify PostgreSQL and PostGIS versions on live database.
    """
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        pg_version = conn.execute(text("SELECT version();")).scalar()
        postgis_version = conn.execute(text("SELECT PostGIS_Version();")).scalar()
        assert pg_version is not None
        assert postgis_version is not None
        assert "PostgreSQL" in pg_version
        assert "3." in postgis_version or "2." in postgis_version


@live_db_required
def test_spatial_query_distance_calculation():
    """
    Verify PostGIS spatial distance query execution using geography.
    Calculates great-circle distance between Delhi (77.2090, 28.6139) and Mumbai (72.8777, 19.0760).
    """
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        query = text("""
            SELECT ST_Distance(
                ST_SetSRID(ST_Point(77.2090, 28.6139), 4326)::geography,
                ST_SetSRID(ST_Point(72.8777, 19.0760), 4326)::geography
            ) AS distance_meters;
        """)
        distance = conn.execute(query).scalar()
        assert distance is not None
        # Approximately 1,148 km (+/- 50km)
        assert 1_100_000 < distance < 1_200_000


@live_db_required
def test_firms_persistence_and_deduplication_live_db():
    """
    Verify end-to-end FIRMS event ORM conversion, PostGIS insertion, spatial retrieval, and deduplication.
    """
    engine = create_engine(settings.DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        service = FIRMSService()
        sample_csv = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
28.6139,77.2090,342.5,0.39,0.36,2026-03-24,0530,N,VIIRS,nominal,2.0NRT,295.2,14.8,D
"""
        valid_records, _, _ = service.parse_and_validate(sample_csv, source="VIIRS_SNPP_NRT")
        assert len(valid_records) == 1
        rec = valid_records[0]

        # Step 1: Ingest & Persist
        events = service.to_thermal_events([rec])
        session.add_all(events)
        session.commit()

        # Step 2: Query back and verify spatial geometry
        db_event = session.query(ThermalEvent).filter_by(source_event_id=rec.source_event_id).first()
        assert db_event is not None
        assert db_event.latitude == pytest.approx(28.6139)
        assert db_event.longitude == pytest.approx(77.2090)

        # Step 3: Test Deduplication against DB
        unique_records, duplicate_count = service.deduplicate([rec], db=session)
        assert len(unique_records) == 0
        assert duplicate_count == 1

        # Cleanup test record
        session.delete(db_event)
        session.commit()

    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

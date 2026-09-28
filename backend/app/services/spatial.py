import logging
from sqlalchemy import text, insert
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)

def match_thermal_events_to_facilities(db: Session, max_distance_meters: float = 5000.0) -> int:
    """
    Executes a PostGIS spatial join to associate thermal events with industrial facilities
    within a certain distance (meters).
    Returns the number of new associations created.
    """
    # Using ST_DWithin on geographies (cast to geography) calculates distance in meters.
    # We select events and facilities that don't already have an association.
    
    query = text("""
        WITH new_associations AS (
            SELECT 
                t.id AS thermal_event_id,
                f.id AS facility_id,
                ST_Distance(t.geometry::geography, f.geometry::geography) AS distance_meters
            FROM thermal_events t
            JOIN industrial_facilities f
              ON ST_DWithin(t.geometry::geography, f.geometry::geography, :max_distance)
            WHERE NOT EXISTS (
                SELECT 1 FROM thermal_event_facility_associations a
                WHERE a.thermal_event_id = t.id AND a.facility_id = f.id
            )
        )
        INSERT INTO thermal_event_facility_associations (thermal_event_id, facility_id, distance_meters, relationship_type)
        SELECT 
            thermal_event_id, 
            facility_id, 
            distance_meters, 
            'proximity'
        FROM new_associations
        RETURNING id;
    """)
    
    result = db.execute(query, {"max_distance": max_distance_meters})
    db.commit()
    
    inserted_count = len(result.fetchall())
    logger.info(f"Created {inserted_count} new thermal event to facility associations.")
    return inserted_count

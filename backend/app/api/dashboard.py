from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from backend.app.core.database import get_db

router = APIRouter()

class EventGeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: dict
    properties: dict

class EventGeoJSON(BaseModel):
    type: str = "FeatureCollection"
    features: List[EventGeoJSONFeature]


@router.get("/events", response_model=EventGeoJSON)
def get_dashboard_events(
    db: Session = Depends(get_db),
    limit: int = 2000
):
    """
    Get recent thermal events formatted as GeoJSON for the MapLibre map.
    """
    query = text("""
        SELECT id, latitude, longitude, frp, brightness_temperature, confidence, satellite, detected_at, source
        FROM thermal_events
        ORDER BY detected_at DESC
        LIMIT :limit
    """)
    result = db.execute(query, {"limit": limit}).fetchall()
    
    features = []
    for row in result:
        features.append(EventGeoJSONFeature(
            geometry={
                "type": "Point",
                "coordinates": [row.longitude, row.latitude]
            },
            properties={
                "id": row.id,
                "event_id": row.id,
                "frp": row.frp,
                "brightness_temperature": row.brightness_temperature,
                "confidence": row.confidence,
                "satellite": row.satellite,
                "detected_at": row.detected_at.isoformat() if row.detected_at else None,
                "source": row.source
            }
        ))
        
    return EventGeoJSON(features=features)


@router.get("/facilities", response_model=EventGeoJSON)
def get_dashboard_facilities(
    db: Session = Depends(get_db),
    limit: int = 5000
):
    """
    Get industrial facilities formatted as GeoJSON for the MapLibre map.
    """
    query = text("""
        SELECT id, ST_Y(geometry::geometry) as latitude, ST_X(geometry::geometry) as longitude, facility_type, name, source
        FROM industrial_facilities
        LIMIT :limit
    """)
    result = db.execute(query, {"limit": limit}).fetchall()
    
    features = []
    for row in result:
        features.append(EventGeoJSONFeature(
            geometry={
                "type": "Point",
                "coordinates": [row.longitude, row.latitude]
            },
            properties={
                "id": row.id,
                "facility_type": row.facility_type,
                "name": row.name,
                "source": row.source
            }
        ))
        
    return EventGeoJSON(features=features)


@router.get("/events/{event_id}")
def get_event_details(event_id: int, db: Session = Depends(get_db)):
    """
    Get full details for a single event for the Event Inspector panel.
    """
    # Event basic
    event_query = text("""
        SELECT id, latitude, longitude, frp, brightness_temperature, confidence, satellite, detected_at, source
        FROM thermal_events
        WHERE id = :event_id
    """)
    event_row = db.execute(event_query, {"event_id": event_id}).fetchone()
    if not event_row:
        raise HTTPException(status_code=404, detail="Event not found")

    # Associated facility
    assoc_query = text("""
        SELECT i.id, i.name, i.facility_type, a.distance_meters
        FROM thermal_event_facility_associations a
        JOIN industrial_facilities i ON a.facility_id = i.id
        WHERE a.thermal_event_id = :event_id
        ORDER BY a.distance_meters ASC
        LIMIT 1
    """)
    facility_row = db.execute(assoc_query, {"event_id": event_id}).fetchone()

    # Features (from event_features)
    feature_query = text("""
        SELECT nearby_facility_count, hotspot_frequency_30d, persistence_days, additional_features
        FROM event_features
        WHERE thermal_event_id = :event_id
    """)
    feature_row = db.execute(feature_query, {"event_id": event_id}).fetchone()

    # Satellites
    sat_query = text("""
        SELECT satellite as platform, acquisition_time as observation_date, product_id
        FROM satellite_observations
        WHERE thermal_event_id = :event_id
    """)
    sat_rows = db.execute(sat_query, {"event_id": event_id}).fetchall()
    satellites = [{"platform": s.platform, "date": s.observation_date.isoformat(), "product_id": s.product_id} for s in sat_rows]

    feature_dict = dict(feature_row._mapping) if feature_row else None
    if feature_dict and feature_dict.get('additional_features'):
        extra = feature_dict['additional_features']
        wc = extra.get('worldcover', {})
        feature_dict['land_cover_at_event'] = wc.get('land_cover_class_name') or wc.get('land_cover_at_event')

    return {
        "event": dict(event_row._mapping),
        "facility": dict(facility_row._mapping) if facility_row else None,
        "features": feature_dict,
        "satellites": satellites
    }

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Get actual database total counts for dashboard.
    """
    events_count = db.execute(text("SELECT COUNT(*) FROM thermal_events")).scalar()
    facilities_count = db.execute(text("SELECT COUNT(*) FROM industrial_facilities")).scalar()
    return {
        "total_events": events_count,
        "total_facilities": facilities_count
    }

from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.schemas.osm import OSMIngestRequest, OSMIngestResponse
from backend.app.services.osm import async_ingest_osm_facilities
from backend.app.services.spatial import match_thermal_events_to_facilities
from backend.app.models.industrial_facility import IndustrialFacility


router = APIRouter()

@router.post("/ingest", response_model=OSMIngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest_osm(request: OSMIngestRequest, db: Session = Depends(get_db)) -> Any:
    """
    Ingests OpenStreetMap industrial facilities for a given bounding box.
    """
    try:
        result = await async_ingest_osm_facilities(db, request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/match", status_code=status.HTTP_200_OK)
def match_facilities(
    max_distance_meters: float = Query(5000.0, description="Max distance in meters"),
    db: Session = Depends(get_db)
) -> Any:
    """
    Triggers spatial matching between all thermal events and industrial facilities.
    """
    try:
        associations = match_thermal_events_to_facilities(db, max_distance_meters)
        return {"status": "success", "new_associations_created": associations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/facilities", status_code=status.HTTP_200_OK)
def list_facilities(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    facility_type: str = Query(None, description="Filter by facility type"),
    db: Session = Depends(get_db)
) -> Any:
    """
    Retrieves a paginated list of industrial facilities.
    """
    query = db.query(IndustrialFacility)
    if facility_type:
        query = query.filter(IndustrialFacility.facility_type == facility_type)
    
    facilities = query.offset(skip).limit(limit).all()
    
    # Simple serialization (in production, use a proper Pydantic response model)
    return [
        {
            "id": f.id,
            "source_id": f.source_id,
            "name": f.name,
            "facility_type": f.facility_type,
            "properties": f.properties
        }
        for f in facilities
    ]

@router.get("/facilities/{facility_id}", status_code=status.HTTP_200_OK)
def get_facility(facility_id: int, db: Session = Depends(get_db)) -> Any:
    """
    Retrieves a single industrial facility by ID.
    """
    facility = db.query(IndustrialFacility).filter(IndustrialFacility.id == facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
        
    return {
        "id": facility.id,
        "source_id": facility.source_id,
        "name": facility.name,
        "facility_type": facility.facility_type,
        "properties": facility.properties
    }

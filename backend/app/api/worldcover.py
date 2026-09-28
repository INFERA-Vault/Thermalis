from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.models.thermal_event import ThermalEvent
from backend.app.services.worldcover import worldcover_service

router = APIRouter()

@router.get(
    "/lookup/{thermal_event_id}",
    status_code=status.HTTP_200_OK,
    summary="Lookup WorldCover data for event"
)
def lookup_worldcover(thermal_event_id: int, db: Session = Depends(get_db)):
    event = db.query(ThermalEvent).filter_by(id=thermal_event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    features = worldcover_service.extract_features(event.latitude, event.longitude)
    if features.get("error"):
        raise HTTPException(status_code=500, detail=features["error"])
        
    return features

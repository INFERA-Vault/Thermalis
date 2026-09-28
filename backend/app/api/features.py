"""
API Router for Feature Engineering and Temporal Persistence.
"""

from typing import Dict, Any, List
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.services.features import FeatureEngineeringService
from backend.app.models.event_feature import EventFeature
from pydantic import BaseModel

router = APIRouter()

class FeatureGenerationResponse(BaseModel):
    thermal_event_id: int
    distance_to_facility_meters: float | None
    nearby_facility_count: int | None
    hotspot_frequency_30d: int | None
    persistence_days: float | None
    additional_features: Dict[str, Any] | None

class BatchFeatureResponse(BaseModel):
    status: str
    generated_count: int

@router.post(
    "/generate/{thermal_event_id}",
    response_model=FeatureGenerationResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate Features for Event",
    description="Calculates FIRMS, OSM, Satellite, and Temporal features for a specific thermal event."
)
def generate_event_features(
    thermal_event_id: int,
    db: Session = Depends(get_db)
):
    service = FeatureEngineeringService()
    try:
        feature_record = service.generate_features_for_event(thermal_event_id, db)
        return {
            "thermal_event_id": feature_record.thermal_event_id,
            "distance_to_facility_meters": feature_record.distance_to_facility_meters,
            "nearby_facility_count": feature_record.nearby_facility_count,
            "hotspot_frequency_30d": feature_record.hotspot_frequency_30d,
            "persistence_days": feature_record.persistence_days,
            "additional_features": feature_record.additional_features
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post(
    "/generate-batch",
    response_model=BatchFeatureResponse,
    status_code=status.HTTP_200_OK,
    summary="Batch Generate Features"
)
def batch_generate_features(
    limit: int = 100,
    force_update: bool = False,
    db: Session = Depends(get_db)
):
    service = FeatureEngineeringService()
    count = service.generate_features_batch(limit, db, force_update=force_update)
    return {"status": "success", "generated_count": count}

@router.get(
    "/{thermal_event_id}",
    response_model=FeatureGenerationResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Features for Event"
)
def get_event_features(
    thermal_event_id: int,
    db: Session = Depends(get_db)
):
    feature = db.query(EventFeature).filter(EventFeature.thermal_event_id == thermal_event_id).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Features not found for this event")
    return {
        "thermal_event_id": feature.thermal_event_id,
        "distance_to_facility_meters": feature.distance_to_facility_meters,
        "nearby_facility_count": feature.nearby_facility_count,
        "hotspot_frequency_30d": feature.hotspot_frequency_30d,
        "persistence_days": feature.persistence_days,
        "additional_features": feature.additional_features
    }

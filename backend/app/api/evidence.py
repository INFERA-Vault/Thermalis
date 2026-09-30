from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.api.deps import get_db
from backend.app.models.thermal_event import ThermalEvent
from backend.app.schemas.evidence import EvidenceAssessmentResponse
from backend.app.services.evidence_fusion import evidence_fusion_service
from backend.app.services.features import FeatureEngineeringService


router = APIRouter()


@router.post("/assess/{event_id}", response_model=EvidenceAssessmentResponse)
def assess_event_evidence(event_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Build an auditable, multi-source evidence profile for one FIRMS event."""
    event = db.query(ThermalEvent).filter(ThermalEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Thermal event not found")

    try:
        feature_record = FeatureEngineeringService().generate_features_for_event(event_id, db)
        assessment = evidence_fusion_service.assess(event, feature_record)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evidence assessment failed: {exc}") from exc

    return assessment

"""
API Router for Satellite Observations.
"""

from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.schemas.satellite import SatelliteSearchRequest, SatelliteSearchSummary, SatelliteObservationResponse
from backend.app.services.satellite import SatelliteService
from backend.app.models.satellite_observation import SatelliteObservation

router = APIRouter()

@router.post(
    "/search",
    response_model=SatelliteSearchSummary,
    status_code=status.HTTP_200_OK,
    summary="Discover Satellite Observations",
    description="Queries Sentinel-1 and Sentinel-2 STAC APIs for observations around a thermal event and persists metadata."
)
async def search_satellite_observations(
    request: SatelliteSearchRequest,
    db: Session = Depends(get_db)
) -> SatelliteSearchSummary:
    service = SatelliteService()
    result = await service.discover_observations(request=request, db=db)
    return result

@router.get(
    "/event/{thermal_event_id}",
    response_model=List[SatelliteObservationResponse],
    status_code=status.HTTP_200_OK,
    summary="Get Observations for Event"
)
def get_observations_for_event(
    thermal_event_id: int,
    db: Session = Depends(get_db)
) -> List[SatelliteObservationResponse]:
    obs = db.query(SatelliteObservation).filter(SatelliteObservation.thermal_event_id == thermal_event_id).all()
    return obs

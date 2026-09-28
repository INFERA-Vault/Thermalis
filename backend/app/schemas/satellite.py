"""
Pydantic schemas for Satellite Observation Service.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class SatelliteSearchRequest(BaseModel):
    thermal_event_id: int = Field(..., description="ID of the thermal event to query around")
    buffer_meters: float = Field(default=2000.0, description="AOI buffer in meters around the event")
    days_before: int = Field(default=30, description="Days to look back before the event")
    days_after: int = Field(default=5, description="Days to look forward after the event")
    max_cloud_cover: float = Field(default=20.0, description="Maximum cloud cover percentage (Sentinel-2 only)")

class SatelliteObservationResponse(BaseModel):
    id: int
    thermal_event_id: int
    satellite: str
    product_id: str
    acquisition_time: datetime
    cloud_coverage: Optional[float] = None
    extra_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True

class SatelliteSearchSummary(BaseModel):
    status: str
    thermal_event_id: int
    sentinel_2_found: int
    sentinel_1_found: int
    total_saved: int
    details: Optional[Dict[str, Any]] = None

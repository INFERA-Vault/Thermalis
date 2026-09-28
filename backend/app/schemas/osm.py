from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

class OSMFacilityBase(BaseModel):
    osm_id: str = Field(..., description="External OpenStreetMap identifier (e.g. node/1234, way/5678)")
    name: Optional[str] = Field(None, description="Name of the facility")
    facility_type: str = Field(..., description="Normalized facility category (e.g. REFINERY, POWER_PLANT)")
    latitude: float = Field(..., description="Center or representative latitude")
    longitude: float = Field(..., description="Center or representative longitude")
    geometry: Dict[str, Any] = Field(..., description="GeoJSON representation of the geometry")
    tags: Dict[str, Any] = Field(default_factory=dict, description="Original OSM tags")
    source: str = Field("OSM", description="Source of the data")
    retrieved_at: datetime = Field(default_factory=datetime.utcnow, description="Time the data was fetched")

class OSMFacilityCreate(OSMFacilityBase):
    pass

class OSMFacilityResponse(OSMFacilityBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class OSMIngestRequest(BaseModel):
    min_lon: float = Field(..., description="Bounding box minimum longitude")
    min_lat: float = Field(..., description="Bounding box minimum latitude")
    max_lon: float = Field(..., description="Bounding box maximum longitude")
    max_lat: float = Field(..., description="Bounding box maximum latitude")
    timeout: int = Field(60, description="Overpass API timeout in seconds")

class OSMIngestResponse(BaseModel):
    elements_received: int
    valid_facilities: int
    invalid_skipped: int
    inserted: int
    updated: int
    duplicates_skipped: int

"""
Pydantic Schemas for NASA FIRMS Ingestion Request, Validation, and Response.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, model_validator


class FIRMSSourceEnum(str, Enum):
    VIIRS_SNPP_NRT = "VIIRS_SNPP_NRT"
    VIIRS_NOAA20_NRT = "VIIRS_NOAA20_NRT"
    VIIRS_NOAA21_NRT = "VIIRS_NOAA21_NRT"
    MODIS_NRT = "MODIS_NRT"
    VIIRS_SNPP_SP = "VIIRS_SNPP_SP"
    VIIRS_NOAA20_SP = "VIIRS_NOAA20_SP"
    MODIS_SP = "MODIS_SP"


class BBoxSchema(BaseModel):
    """
    Geographic Bounding Box: [min_lon, min_lat, max_lon, max_lat]
    in WGS84 (EPSG:4326) coordinate system.
    """
    min_lon: float = Field(..., ge=-180.0, le=180.0, description="Minimum longitude (West)")
    min_lat: float = Field(..., ge=-90.0, le=90.0, description="Minimum latitude (South)")
    max_lon: float = Field(..., ge=-180.0, le=180.0, description="Maximum longitude (East)")
    max_lat: float = Field(..., ge=-90.0, le=90.0, description="Maximum latitude (North)")

    @model_validator(mode="after")
    def validate_bounds(self) -> "BBoxSchema":
        if self.min_lon > self.max_lon:
            raise ValueError(f"min_lon ({self.min_lon}) cannot be greater than max_lon ({self.max_lon})")
        if self.min_lat > self.max_lat:
            raise ValueError(f"min_lat ({self.min_lat}) cannot be greater than max_lat ({self.max_lat})")
        return self

    def to_firms_format(self) -> str:
        """Returns bbox formatted for FIRMS API: min_lon,min_lat,max_lon,max_lat (e.g. '70,18,85,28')"""
        return f"{self.min_lon},{self.min_lat},{self.max_lon},{self.max_lat}"


class FIRMSIngestRequest(BaseModel):
    """
    Request parameters for triggering NASA FIRMS ingestion.
    """
    source: FIRMSSourceEnum = Field(
        default=FIRMSSourceEnum.VIIRS_SNPP_NRT,
        description="NASA FIRMS Sensor/Product source"
    )
    bbox: Optional[BBoxSchema] = Field(
        default=None,
        description="Bounding box for spatial query"
    )
    country_code: Optional[str] = Field(
        default=None,
        description="ISO 3-letter Country Code (e.g. USA, IND, DEU)"
    )
    day_range: int = Field(
        default=1,
        ge=1,
        le=10,
        description="Number of past days of FIRMS observations to retrieve (1-10)"
    )
    date: Optional[str] = Field(
        default=None,
        description="Date in YYYY-MM-DD format (leave empty for latest)"
    )

    @model_validator(mode="after")
    def validate_target_area(self) -> "FIRMSIngestRequest":
        if not self.bbox and not self.country_code:
            raise ValueError("Either 'bbox' or 'country_code' must be provided for FIRMS ingestion.")
        return self


class FIRMSEventRecord(BaseModel):
    """
    Normalized intermediate representation of a validated NASA FIRMS thermal anomaly event.
    """
    source: str
    source_event_id: str
    detected_at: datetime
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    brightness_temperature: Optional[float] = None
    frp: Optional[float] = None
    confidence: Optional[str] = None
    satellite: Optional[str] = None


class FIRMSIngestSummary(BaseModel):
    """
    Structured summary of the FIRMS ingestion operation.
    """
    status: str = Field(..., description="Ingestion outcome status ('success', 'partial', 'failed')")
    source: str
    total_received: int
    valid_records: int
    rejected_records: int
    duplicate_records: int
    persisted_records: int
    details: Optional[Dict[str, Any]] = None

"""
ThermalEvent ORM Model.
Represents a thermal anomaly detected by NASA FIRMS (VIIRS/MODIS).
"""

from datetime import datetime
from typing import List, Optional
from sqlalchemy import BigInteger, Column, DateTime, Float, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from backend.app.core.database import Base


class ThermalEvent(Base):
    __tablename__ = "thermal_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, doc="Sensor/data source (e.g. VIIRS_SNPP, VIIRS_NOAA20, MODIS)")
    source_event_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    
    # Coordinate fields for serialization/queries
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # Canonical PostGIS Point Geometry in WGS84 (EPSG:4326)
    geometry = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False)

    # Thermal characteristics
    brightness_temperature: Mapped[Optional[float]] = mapped_column(Float, nullable=True, doc="Brightness temperature in Kelvin (e.g. Bright_ti4 / Brightness)")
    frp: Mapped[Optional[float]] = mapped_column(Float, nullable=True, doc="Fire Radiative Power in MW")
    confidence: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, doc="Detection confidence value (nominal, low, high, or 0-100)")
    satellite: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, doc="Platform name (e.g. N, 1, Terra, Aqua, Suomi-NPP)")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    facility_associations: Mapped[List["ThermalEventFacilityAssociation"]] = relationship(
        "ThermalEventFacilityAssociation",
        back_populates="thermal_event",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    satellite_observations: Mapped[List["SatelliteObservation"]] = relationship(
        "SatelliteObservation",
        back_populates="thermal_event",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    features: Mapped[Optional["EventFeature"]] = relationship(
        "EventFeature",
        back_populates="thermal_event",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    classifications: Mapped[List["Classification"]] = relationship(
        "Classification",
        back_populates="thermal_event",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    risk_assessments: Mapped[List["RiskAssessment"]] = relationship(
        "RiskAssessment",
        back_populates="thermal_event",
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    __table_args__ = (
        Index("idx_thermal_events_detected_at", "detected_at"),
        Index("idx_thermal_events_source", "source"),
    )

"""
EventFeature ORM Model.
Stores extracted spectral, spatial, temporal, and contextual features for AI modeling.
"""

from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy import BigInteger, Column, DateTime, Float, ForeignKey, Index, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class EventFeature(Base):
    __tablename__ = "event_features"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    thermal_event_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("thermal_events.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True
    )

    # Core Spectral Indices (Sentinel-2 / Multispectral)
    ndvi: Mapped[Optional[float]] = mapped_column(Float, nullable=True, doc="Normalized Difference Vegetation Index")
    ndbi: Mapped[Optional[float]] = mapped_column(Float, nullable=True, doc="Normalized Difference Built-up Index")
    swir_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True, doc="SWIR band ratio (B12/B11 or similar)")

    # Spatial Proximity Features
    distance_to_facility_meters: Mapped[Optional[float]] = mapped_column(Float, nullable=True, doc="Distance to closest industrial facility")
    nearby_facility_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, doc="Number of facilities within threshold radius (e.g. 1km/5km)")

    # Temporal & Persistence Features
    hotspot_frequency_30d: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, doc="Count of thermal anomalies at location over past 30 days")
    persistence_days: Mapped[Optional[float]] = mapped_column(Float, nullable=True, doc="Total span of observed thermal activity in days")

    # Extensible Feature Dictionary for future ML evolution (SAR backscatter, landcover class, texture, etc.)
    additional_features = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    thermal_event: Mapped["ThermalEvent"] = relationship("ThermalEvent", back_populates="features")

    __table_args__ = (
        Index("idx_features_event_id", "thermal_event_id"),
    )

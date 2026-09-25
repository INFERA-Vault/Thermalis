"""
SatelliteObservation ORM Model.
Stores metadata for satellite scenes (Sentinel-2, Sentinel-1, Landsat) matched with thermal events.
"""

from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy import BigInteger, Column, DateTime, Float, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class SatelliteObservation(Base):
    __tablename__ = "satellite_observations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    thermal_event_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("thermal_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Satellite constellation / mission (e.g. Sentinel-2A, Sentinel-2B, Sentinel-1A)
    satellite: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Granule / Scene / Product identifier
    product_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    acquisition_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    cloud_coverage: Mapped[Optional[float]] = mapped_column(Float, nullable=True, doc="Cloud cover percentage (0-100)")

    # Flexible metadata (Bands info, footprint geometry, tile ID, processing level)
    extra_metadata = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    thermal_event: Mapped["ThermalEvent"] = relationship("ThermalEvent", back_populates="satellite_observations")

    __table_args__ = (
        Index("idx_sat_obs_acquisition", "satellite", "acquisition_time"),
    )

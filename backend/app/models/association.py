"""
ThermalEventFacilityAssociation ORM Model.
Represents an N:M contextual/spatial association between a Thermal Event and an Industrial Facility.
"""

from datetime import datetime
from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class ThermalEventFacilityAssociation(Base):
    __tablename__ = "thermal_event_facility_associations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    thermal_event_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("thermal_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    facility_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("industrial_facilities.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Distance in meters calculated between the thermal event and the facility
    distance_meters: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    
    # Relationship type: nearest, within_buffer, contained_within, manual
    relationship_type: Mapped[str] = mapped_column(String(50), nullable=False, default="proximity")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    thermal_event: Mapped["ThermalEvent"] = relationship("ThermalEvent", back_populates="facility_associations")
    facility: Mapped["IndustrialFacility"] = relationship("IndustrialFacility", back_populates="event_associations")

    __table_args__ = (
        UniqueConstraint("thermal_event_id", "facility_id", name="uq_thermal_event_facility"),
        Index("idx_assoc_distance", "distance_meters"),
    )

"""
IndustrialFacility ORM Model.
Represents an infrastructure/industrial installation (OSM or custom spatial inventory).
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import BigInteger, Column, DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from backend.app.core.database import Base


class IndustrialFacility(Base):
    __tablename__ = "industrial_facilities"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="OSM", doc="Data source (e.g. OSM, manual, industrial_registry)")
    source_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True, doc="External identifier (e.g. osm_node_id, osm_way_id)")
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    
    # Flexible facility type: refinery, power_plant, factory, mine, oil_gas, lng_terminal, industrial, chemical, etc.
    facility_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # PostGIS Generic Geometry column (Point, Polygon, MultiPolygon) in WGS84 (EPSG:4326)
    geometry = Column(Geometry(geometry_type="GEOMETRY", srid=4326, spatial_index=True), nullable=False)

    # Extensible attributes (OSM tags, operator, capacity, hazard ratings)
    properties = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    event_associations: Mapped[List["ThermalEventFacilityAssociation"]] = relationship(
        "ThermalEventFacilityAssociation",
        back_populates="facility"
    )

    __table_args__ = (
        Index("idx_industrial_facilities_type", "facility_type"),
        Index("idx_industrial_facilities_source_id", "source_id"),
    )

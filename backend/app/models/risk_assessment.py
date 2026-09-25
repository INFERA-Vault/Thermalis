"""
RiskAssessment ORM Model.
Stores calculated risk scores, severity levels, and anomaly assessments.
"""

from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy import BigInteger, Column, DateTime, Float, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    thermal_event_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("thermal_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    risk_score: Mapped[float] = mapped_column(Float, nullable=False, index=True, doc="Normalized risk metric (e.g. 0.0 - 100.0)")
    risk_level: Mapped[str] = mapped_column(String(50), nullable=False, index=True, doc="Categorical risk tier (LOW, MEDIUM, HIGH, CRITICAL)")

    # Detailed risk breakdown, contributing factors, proximity hazards
    explanation = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

    assessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    thermal_event: Mapped["ThermalEvent"] = relationship("ThermalEvent", back_populates="risk_assessments")

    __table_args__ = (
        Index("idx_risk_level_score", "risk_level", "risk_score"),
    )

"""
Classification ORM Model.
Stores AI classification results for thermal events.
"""

from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy import BigInteger, Column, DateTime, Float, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class Classification(Base):
    __tablename__ = "classifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    thermal_event_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("thermal_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    model_name: Mapped[str] = mapped_column(String(100), nullable=False, doc="Identifier of model architecture (e.g. random_forest, resnet, xgboost)")
    model_version: Mapped[str] = mapped_column(String(50), nullable=False, doc="Model release or training checkpoint version")
    
    # Target Classes: industrial_fire, persistent_thermal_source, wildfire, agricultural_burning, mining_related, other, unknown
    predicted_class: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, doc="Prediction probability/confidence score (0.0 - 1.0)")

    # Full class distribution / probabilities dictionary
    class_probabilities = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

    # Optional metadata (inference time, runtime environment, input feature hash)
    extra_metadata = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)

    predicted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    thermal_event: Mapped["ThermalEvent"] = relationship("ThermalEvent", back_populates="classifications")

    __table_args__ = (
        Index("idx_classifications_pred_class", "predicted_class"),
        Index("idx_classifications_model", "model_name", "model_version"),
    )

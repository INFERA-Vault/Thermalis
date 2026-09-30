import enum
import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Integer, Enum, JSON
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class AlertType(str, enum.Enum):
    NEW_THERMAL_ANOMALY = "NEW_THERMAL_ANOMALY"
    INDUSTRIAL_HEAT_SOURCE_ALERT = "INDUSTRIAL_HEAT_SOURCE_ALERT"
    PERSISTENT_THERMAL_ACTIVITY = "PERSISTENT_THERMAL_ACTIVITY"

class AlertSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

class AlertStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"

class NotificationStatus(str, enum.Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"
    DISABLED = "DISABLED"
    NOT_APPLICABLE = "NOT_APPLICABLE"

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, index=True)
    thermal_event_id = Column(Integer, ForeignKey("thermal_events.id"), nullable=False, index=True)
    alert_type = Column(Enum(AlertType), nullable=False, index=True)
    severity = Column(Enum(AlertSeverity), nullable=False, index=True)
    status = Column(Enum(AlertStatus), nullable=False, index=True, default=AlertStatus.ACTIVE)
    
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    model_probability = Column(Float, nullable=True)
    evidence_json = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    notification_status = Column(
        Enum(NotificationStatus),
        nullable=False,
        default=NotificationStatus.NOT_APPLICABLE,
        index=True,
    )
    notification_timestamp = Column(DateTime, nullable=True)
    notification_recipient = Column(String, nullable=True)
    notification_error = Column(String, nullable=True)

    # Relationships
    thermal_event = relationship("ThermalEvent")
    dispatches = relationship("AlertDispatch", back_populates="alert", cascade="all, delete-orphan")

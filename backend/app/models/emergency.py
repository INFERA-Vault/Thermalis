"""Emergency recipients and auditable notification dispatch records."""

import datetime
import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from backend.app.core.database import Base
from backend.app.models.alert import AlertSeverity


class EmergencyRecipientType(str, enum.Enum):
    LOCAL_CONTACT = "LOCAL_CONTACT"
    FIRE_BRIGADE = "FIRE_BRIGADE"
    POLICE = "POLICE"
    RESCUE_TEAM = "RESCUE_TEAM"
    AMBULANCE = "AMBULANCE"
    SITE_OPERATOR = "SITE_OPERATOR"
    OTHER = "OTHER"


class EmergencyChannel(str, enum.Enum):
    EMAIL = "EMAIL"
    SMS = "SMS"
    VOICE = "VOICE"
    WEBHOOK = "WEBHOOK"


class DispatchStatus(str, enum.Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class EmergencyRecipient(Base):
    __tablename__ = "emergency_recipients"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    organization = Column(String, nullable=True)
    recipient_type = Column(Enum(EmergencyRecipientType), nullable=False, index=True)
    channel = Column(Enum(EmergencyChannel), nullable=False, index=True)
    endpoint = Column(String, nullable=False)
    location_latitude = Column(Float, nullable=True)
    location_longitude = Column(Float, nullable=True)
    coverage_radius_meters = Column(Float, nullable=True)
    minimum_severity = Column(
        Enum(AlertSeverity), nullable=False, default=AlertSeverity.HIGH
    )
    enabled = Column(Boolean, nullable=False, default=True, index=True)
    verified = Column(Boolean, nullable=False, default=False, index=True)
    priority = Column(Integer, nullable=False, default=100, index=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )

    dispatches = relationship("AlertDispatch", back_populates="recipient")


class AlertDispatch(Base):
    __tablename__ = "alert_dispatches"

    id = Column(String, primary_key=True, index=True)
    alert_id = Column(String, ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(
        String,
        ForeignKey("emergency_recipients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel = Column(Enum(EmergencyChannel), nullable=False)
    status = Column(Enum(DispatchStatus), nullable=False, index=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    provider_message_id = Column(String, nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    sent_at = Column(DateTime, nullable=True)

    alert = relationship("Alert", back_populates="dispatches")
    recipient = relationship("EmergencyRecipient", back_populates="dispatches")

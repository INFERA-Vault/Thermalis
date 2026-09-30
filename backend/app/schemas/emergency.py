"""API contracts for configured emergency recipients and dispatch audits."""

import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.models.alert import AlertSeverity
from backend.app.models.emergency import (
    DispatchStatus,
    EmergencyChannel,
    EmergencyRecipientType,
)


class EmergencyRecipientCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    organization: Optional[str] = Field(default=None, max_length=200)
    recipient_type: EmergencyRecipientType
    channel: EmergencyChannel
    endpoint: str = Field(min_length=3, max_length=500)
    location_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    location_longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    coverage_radius_meters: Optional[float] = Field(default=None, gt=0, le=1_000_000)
    minimum_severity: AlertSeverity = AlertSeverity.HIGH
    priority: int = Field(default=100, ge=0, le=10_000)
    metadata_json: Optional[Dict[str, Any]] = None
    verified: bool = False

    @field_validator("endpoint")
    @classmethod
    def endpoint_must_be_trimmed(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("endpoint must not be blank")
        return value


class EmergencyRecipientUpdate(BaseModel):
    enabled: Optional[bool] = None
    verified: Optional[bool] = None
    priority: Optional[int] = Field(default=None, ge=0, le=10_000)
    coverage_radius_meters: Optional[float] = Field(default=None, gt=0, le=1_000_000)


class EmergencyRecipientResponse(EmergencyRecipientCreate):
    id: str
    enabled: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class AlertDispatchResponse(BaseModel):
    id: str
    alert_id: str
    recipient_id: str
    channel: EmergencyChannel
    status: DispatchStatus
    attempt_count: int
    provider_message_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime.datetime
    sent_at: Optional[datetime.datetime] = None
    recipient_name: Optional[str] = None
    organization: Optional[str] = None
    recipient_type: Optional[EmergencyRecipientType] = None


class EmergencyDispatchSummary(BaseModel):
    alert_id: str
    enabled: bool
    attempted: int
    sent: int
    failed: int
    skipped: int
    dispatches: List[AlertDispatchResponse]
    message: str

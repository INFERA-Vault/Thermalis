from typing import Optional, Any, Dict
from pydantic import BaseModel, ConfigDict
import datetime
from backend.app.models.alert import AlertType, AlertSeverity, AlertStatus

class AlertBase(BaseModel):
    title: str
    message: str
    alert_type: AlertType
    severity: AlertSeverity
    thermal_event_id: int
    model_probability: Optional[float] = None
    evidence_json: Optional[Dict[str, Any]] = None

class AlertCreate(AlertBase):
    pass

class AlertResponse(AlertBase):
    id: str
    status: AlertStatus
    created_at: datetime.datetime
    updated_at: datetime.datetime
    acknowledged_at: Optional[datetime.datetime] = None
    resolved_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)

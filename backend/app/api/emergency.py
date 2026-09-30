"""Protected operator API for emergency recipients and dispatch audits."""

import hmac
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.api.deps import get_db
from backend.app.core.config import settings
from backend.app.models.alert import Alert
from backend.app.models.emergency import AlertDispatch, EmergencyRecipient
from backend.app.schemas.emergency import (
    AlertDispatchResponse,
    EmergencyDispatchSummary,
    EmergencyRecipientCreate,
    EmergencyRecipientResponse,
    EmergencyRecipientUpdate,
)
from backend.app.services.emergency_dispatch import emergency_dispatch_service

router = APIRouter()


def require_emergency_admin(
    x_emergency_admin_key: Optional[str] = Header(default=None),
) -> None:
    """Protect contact-management and manual dispatch operations."""
    if not settings.EMERGENCY_ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Emergency admin key is not configured; emergency administration is disabled.",
        )
    if not x_emergency_admin_key or not hmac.compare_digest(
        x_emergency_admin_key, settings.EMERGENCY_ADMIN_KEY
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid emergency admin key")


def _dispatch_dict(dispatch: AlertDispatch) -> Dict[str, Any]:
    recipient = dispatch.recipient
    return {
        "id": dispatch.id,
        "alert_id": dispatch.alert_id,
        "recipient_id": dispatch.recipient_id,
        "channel": dispatch.channel,
        "status": dispatch.status,
        "attempt_count": dispatch.attempt_count,
        "provider_message_id": dispatch.provider_message_id,
        "error_message": dispatch.error_message,
        "created_at": dispatch.created_at,
        "sent_at": dispatch.sent_at,
        "recipient_name": recipient.name if recipient else None,
        "organization": recipient.organization if recipient else None,
        "recipient_type": recipient.recipient_type if recipient else None,
    }


def _summary(alert_id: str, dispatches: List[AlertDispatch], message: str) -> Dict[str, Any]:
    return {
        "alert_id": alert_id,
        "enabled": settings.EMERGENCY_DISPATCH_ENABLED,
        "attempted": len(dispatches),
        "sent": sum(item.status.value == "SENT" for item in dispatches),
        "failed": sum(item.status.value == "FAILED" for item in dispatches),
        "skipped": sum(item.status.value == "SKIPPED" for item in dispatches),
        "dispatches": [_dispatch_dict(item) for item in dispatches],
        "message": message,
    }


@router.get("/status")
def emergency_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Return safe operational status without exposing contact details or secrets."""
    verified_count = (
        db.query(EmergencyRecipient)
        .filter(EmergencyRecipient.enabled.is_(True), EmergencyRecipient.verified.is_(True))
        .count()
    )
    return {
        "dispatch_enabled": settings.EMERGENCY_DISPATCH_ENABLED,
        "admin_configured": bool(settings.EMERGENCY_ADMIN_KEY),
        "verified_recipient_count": verified_count,
        "minimum_severity": settings.EMERGENCY_MIN_SEVERITY,
        "message": "No external emergency notification is sent unless dispatch is enabled and recipients are verified.",
    }


@router.get("/recipients", response_model=List[EmergencyRecipientResponse], dependencies=[Depends(require_emergency_admin)])
def list_recipients(db: Session = Depends(get_db)) -> List[EmergencyRecipient]:
    return db.query(EmergencyRecipient).order_by(EmergencyRecipient.priority.asc()).all()


@router.post("/recipients", response_model=EmergencyRecipientResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_emergency_admin)])
def create_recipient(payload: EmergencyRecipientCreate, db: Session = Depends(get_db)) -> EmergencyRecipient:
    recipient = EmergencyRecipient(id=str(uuid.uuid4()), **payload.model_dump())
    db.add(recipient)
    db.commit()
    db.refresh(recipient)
    return recipient


@router.patch("/recipients/{recipient_id}", response_model=EmergencyRecipientResponse, dependencies=[Depends(require_emergency_admin)])
def update_recipient(
    recipient_id: str,
    payload: EmergencyRecipientUpdate,
    db: Session = Depends(get_db),
) -> EmergencyRecipient:
    recipient = db.query(EmergencyRecipient).filter(EmergencyRecipient.id == recipient_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Emergency recipient not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(recipient, key, value)
    db.commit()
    db.refresh(recipient)
    return recipient


@router.delete("/recipients/{recipient_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_emergency_admin)])
def disable_recipient(recipient_id: str, db: Session = Depends(get_db)) -> None:
    recipient = db.query(EmergencyRecipient).filter(EmergencyRecipient.id == recipient_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Emergency recipient not found")
    recipient.enabled = False
    db.commit()


@router.post("/dispatch/{alert_id}", response_model=EmergencyDispatchSummary, dependencies=[Depends(require_emergency_admin)])
def dispatch_alert(
    alert_id: str,
    force: bool = False,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    result = emergency_dispatch_service.dispatch_for_alert(db, alert, force=force)
    return {
        **result,
        "dispatches": [_dispatch_dict(item) for item in result.get("dispatches", [])],
    }


@router.get("/dispatches/{alert_id}", response_model=EmergencyDispatchSummary, dependencies=[Depends(require_emergency_admin)])
def get_alert_dispatches(alert_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    if not db.query(Alert).filter(Alert.id == alert_id).first():
        raise HTTPException(status_code=404, detail="Alert not found")
    dispatches = (
        db.query(AlertDispatch)
        .filter(AlertDispatch.alert_id == alert_id)
        .order_by(AlertDispatch.created_at.desc())
        .all()
    )
    return _summary(alert_id, dispatches, "Audited dispatch outcomes retrieved.")

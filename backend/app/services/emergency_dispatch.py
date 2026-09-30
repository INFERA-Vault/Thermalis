"""Fail-closed emergency notification and escalation service.

The service never discovers or guesses emergency contacts. Operators must add
verified recipients explicitly. It supports email, Twilio SMS/voice, and
generic HTTPS webhooks, while persisting every attempted dispatch.
"""

from __future__ import annotations

import datetime
import html
import logging
import math
import uuid
from typing import Any, Dict, Iterable, Optional

import httpx
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.alert import AlertSeverity
from backend.app.models.emergency import (
    AlertDispatch,
    DispatchStatus,
    EmergencyChannel,
    EmergencyRecipient,
)
from backend.app.models.thermal_event import ThermalEvent
from backend.app.services.email_service import EmailService

logger = logging.getLogger(__name__)


class EmergencyDispatchService:
    SEVERITY_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}

    @classmethod
    def _severity_rank(cls, value: Any) -> int:
        name = getattr(value, "value", value)
        return cls.SEVERITY_RANK.get(str(name).upper(), 0)

    @staticmethod
    def distance_meters(
        latitude_a: Optional[float],
        longitude_a: Optional[float],
        latitude_b: Optional[float],
        longitude_b: Optional[float],
    ) -> Optional[float]:
        """Return great-circle distance, or None when either location is absent."""
        if None in (latitude_a, longitude_a, latitude_b, longitude_b):
            return None
        earth_radius = 6_371_000.0
        lat1, lat2 = math.radians(float(latitude_a)), math.radians(float(latitude_b))
        dlat = lat2 - lat1
        dlon = math.radians(float(longitude_b) - float(longitude_a))
        haversine = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        return 2 * earth_radius * math.asin(math.sqrt(min(1.0, haversine)))

    @classmethod
    def recipient_matches(cls, recipient: Any, event: Any, severity: Any) -> bool:
        """Apply verification, severity, enablement and geographic coverage rules."""
        if not getattr(recipient, "enabled", False) or not getattr(recipient, "verified", False):
            return False
        if cls._severity_rank(severity) < cls._severity_rank(getattr(recipient, "minimum_severity", "HIGH")):
            return False

        radius = getattr(recipient, "coverage_radius_meters", None)
        if radius is None:
            radius = settings.EMERGENCY_DEFAULT_RADIUS_METERS
        distance = cls.distance_meters(
            getattr(event, "latitude", None),
            getattr(event, "longitude", None),
            getattr(recipient, "location_latitude", None),
            getattr(recipient, "location_longitude", None),
        )
        # A recipient without coordinates is an explicitly configured global contact.
        return distance is None or distance <= float(radius)

    @staticmethod
    def _message(alert: Any, event: Any) -> str:
        return (
            "PS-162 EMERGENCY THERMAL EVENT ALERT. "
            f"Severity: {getattr(alert.severity, 'value', alert.severity)}. "
            f"Type: {getattr(alert.alert_type, 'value', alert.alert_type)}. "
            f"Event ID: {event.id}. "
            f"Coordinates: {event.latitude:.6f}, {event.longitude:.6f}. "
            f"Detected: {event.detected_at}. "
            "This is an automated decision-support notification; verify locally before dispatching resources."
        )

    @staticmethod
    def _details(alert: Any, event: Any) -> Dict[str, Any]:
        return {
            "alert_id": alert.id,
            "event_id": event.id,
            "severity": getattr(alert.severity, "value", alert.severity),
            "alert_type": getattr(alert.alert_type, "value", alert.alert_type),
            "latitude": event.latitude,
            "longitude": event.longitude,
            "detected_at": str(event.detected_at),
            "frp": event.frp,
            "brightness_temperature": event.brightness_temperature,
            "confidence": event.confidence,
            "model_probability": alert.model_probability,
            "message": EmergencyDispatchService._message(alert, event),
        }

    def _twilio_request(self, path: str, data: Dict[str, str]) -> str:
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN or not settings.TWILIO_FROM_PHONE:
            raise RuntimeError("Twilio credentials and TWILIO_FROM_PHONE are required")
        url = f"{settings.TWILIO_API_BASE.rstrip('/')}/Accounts/{settings.TWILIO_ACCOUNT_SID}{path}"
        with httpx.Client(timeout=settings.EMERGENCY_REQUEST_TIMEOUT_SECONDS) as client:
            response = client.post(
                url,
                data=data,
                auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
            )
            response.raise_for_status()
            body = response.json()
        return str(body.get("sid", ""))

    def _send(self, recipient: Any, alert: Any, event: Any) -> str:
        details = self._details(alert, event)
        channel = getattr(recipient.channel, "value", recipient.channel)
        endpoint = recipient.endpoint

        if channel == EmergencyChannel.EMAIL.value:
            ok = EmailService.send_alert_notification(
                alert_id=alert.id,
                event_id=event.id,
                severity=details["severity"],
                alert_type=details["alert_type"],
                details=details,
                recipient=endpoint,
                enabled=True,
            )
            if not ok:
                raise RuntimeError("Email provider rejected or could not deliver the message")
            return endpoint

        if channel == EmergencyChannel.SMS.value:
            return self._twilio_request(
                f"/Messages.json",
                {"To": endpoint, "From": settings.TWILIO_FROM_PHONE, "Body": details["message"]},
            )

        if channel == EmergencyChannel.VOICE.value:
            message = html.escape(details["message"])
            twiml = f"<Response><Say language=\"en-IN\">{message}</Say></Response>"
            return self._twilio_request(
                "/Calls.json",
                {"To": endpoint, "From": settings.TWILIO_FROM_PHONE, "Twiml": twiml},
            )

        if channel == EmergencyChannel.WEBHOOK.value:
            payload = self._details(alert, event)
            with httpx.Client(timeout=settings.EMERGENCY_REQUEST_TIMEOUT_SECONDS) as client:
                response = client.post(endpoint, json=payload)
                response.raise_for_status()
            return response.headers.get("x-request-id", "webhook-accepted")

        raise RuntimeError(f"Unsupported emergency channel: {channel}")

    def dispatch_for_alert(
        self,
        db: Session,
        alert: Any,
        *,
        force: bool = False,
    ) -> Dict[str, Any]:
        """Dispatch one alert to verified, in-coverage recipients and record outcomes."""
        if not settings.EMERGENCY_DISPATCH_ENABLED:
            return {
                "alert_id": alert.id,
                "enabled": False,
                "attempted": 0,
                "sent": 0,
                "failed": 0,
                "skipped": 0,
                "dispatches": [],
                "message": "Emergency dispatch is disabled by configuration.",
            }

        if self._severity_rank(alert.severity) < self._severity_rank(settings.EMERGENCY_MIN_SEVERITY):
            return {
                "alert_id": alert.id,
                "enabled": True,
                "attempted": 0,
                "sent": 0,
                "failed": 0,
                "skipped": 0,
                "dispatches": [],
                "message": "Alert severity is below the configured emergency-dispatch threshold.",
            }

        event = db.query(ThermalEvent).filter(ThermalEvent.id == alert.thermal_event_id).first()
        if not event:
            raise ValueError(f"Thermal event {alert.thermal_event_id} was not found")

        recipients = (
            db.query(EmergencyRecipient)
            .filter(EmergencyRecipient.enabled.is_(True), EmergencyRecipient.verified.is_(True))
            .order_by(EmergencyRecipient.priority.asc(), EmergencyRecipient.created_at.asc())
            .limit(settings.EMERGENCY_MAX_RECIPIENTS)
            .all()
        )
        dispatches = []
        for recipient in recipients:
            if not self.recipient_matches(recipient, event, alert.severity):
                continue

            previous = (
                db.query(AlertDispatch)
                .filter(
                    AlertDispatch.alert_id == alert.id,
                    AlertDispatch.recipient_id == recipient.id,
                    AlertDispatch.channel == recipient.channel,
                )
                .order_by(AlertDispatch.created_at.desc())
                .first()
            )
            if previous and previous.status == DispatchStatus.SENT and not force:
                dispatches.append(previous)
                continue

            dispatch = AlertDispatch(
                id=str(uuid.uuid4()),
                alert_id=alert.id,
                recipient_id=recipient.id,
                channel=recipient.channel,
                status=DispatchStatus.PENDING,
                attempt_count=1,
            )
            db.add(dispatch)
            try:
                db.flush()
                dispatch.provider_message_id = self._send(recipient, alert, event)
                dispatch.status = DispatchStatus.SENT
                dispatch.sent_at = datetime.datetime.utcnow()
            except Exception as exc:
                dispatch.status = DispatchStatus.FAILED
                dispatch.error_message = str(exc)[:1000]
                logger.warning("Emergency dispatch failed for %s: %s", recipient.id, exc)
            try:
                db.commit()
                db.refresh(dispatch)
                dispatches.append(dispatch)
            except Exception:
                db.rollback()
                logger.exception("Could not persist emergency dispatch outcome for %s", alert.id)

        sent = sum(item.status == DispatchStatus.SENT for item in dispatches)
        failed = sum(item.status == DispatchStatus.FAILED for item in dispatches)
        return {
            "alert_id": alert.id,
            "enabled": True,
            "attempted": len(dispatches),
            "sent": sent,
            "failed": failed,
            "skipped": 0,
            "dispatches": dispatches,
            "message": "Emergency dispatch completed with auditable per-recipient outcomes.",
        }


emergency_dispatch_service = EmergencyDispatchService()

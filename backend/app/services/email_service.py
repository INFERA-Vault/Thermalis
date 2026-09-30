"""SMTP notifications for newly-created high-severity alerts."""

import logging
import smtplib
from email.message import EmailMessage
from typing import Any, Dict

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    @staticmethod
    def send_alert_notification(
        alert_id: str,
        event_id: int,
        severity: str,
        alert_type: str,
        details: Dict[str, Any],
        recipient: str | None = None,
        enabled: bool | None = None,
    ) -> bool:
        email_enabled = settings.ALERT_EMAIL_ENABLED if enabled is None else enabled
        target = recipient or settings.ALERT_EMAIL_TO
        if not email_enabled:
            logger.info("Alert email notifications are disabled.")
            return False

        if not target or not settings.SMTP_HOST or not settings.SMTP_FROM:
            logger.warning("Alert email configuration is incomplete. Skipping email.")
            return False

        try:
            message = EmailMessage()
            message["Subject"] = f"[{severity}] PS-162 Alert: {alert_type} (Event #{event_id})"
            message["From"] = settings.SMTP_FROM
            message["To"] = target

            content = (
                "PS-162 Industrial Fire & Thermal Anomaly Detection System\n\n"
                "ALERT NOTIFICATION\n"
                "==================\n"
                f"Alert ID: {alert_id}\n"
                f"Severity: {severity}\n"
                f"Type: {alert_type}\n"
                f"Event ID: {event_id}\n\n"
            )
            if details.get("detected_at"):
                content += f"Detection Time: {details['detected_at']}\n"
            if details.get("latitude") is not None and details.get("longitude") is not None:
                content += f"Coordinates: {details['latitude']}, {details['longitude']}\n"
            if details.get("frp") is not None:
                content += f"FRP: {details['frp']}\n"
            if details.get("brightness_temperature") is not None:
                content += f"Brightness Temp: {details['brightness_temperature']} K\n"
            if details.get("confidence") is not None:
                content += f"Confidence: {details['confidence']}\n"

            content += "\nAI CLASSIFICATION\n=================\n"
            probability = details.get("model_probability")
            if probability is not None:
                content += (
                    "Model A calibrated probability for GIHS-associated industrial "
                    f"heat-source association: {float(probability) * 100:.2f}%\n"
                )
            else:
                content += "Model A calibrated probability: Not available\n"

            content += (
                "\n*Note: Model evidence is not causal proof.\n\n"
                "DASHBOARD LINK\n"
                "==============\n"
                f"{settings.FRONTEND_URL}/events/{event_id}\n"
            )
            message.set_content(content)

            if settings.SMTP_PORT == 465:
                with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                    if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.send_message(message)
            else:
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                    try:
                        server.starttls()
                    except smtplib.SMTPNotSupportedError:
                        pass
                    if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.send_message(message)

            logger.info("Sent alert notification for %s to %s", alert_id, target)
            return True
        except Exception:
            logger.exception("Failed to send alert notification for %s", alert_id)
            return False

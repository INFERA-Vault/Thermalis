import smtplib
from email.message import EmailMessage
import logging
from typing import Optional, Dict, Any
from backend.app.core.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    def send_alert_notification(alert_id: str, event_id: int, severity: str, alert_type: str, details: Dict[str, Any]) -> bool:
        if not settings.ALERT_EMAIL_ENABLED:
            logger.info("Alert email notifications are disabled.")
            return False

        if not settings.ALERT_EMAIL_TO or not settings.SMTP_HOST:
            logger.warning("Alert email configuration is incomplete. Skipping email.")
            return False

        try:
            msg = EmailMessage()
            msg['Subject'] = f"[{severity}] PS-162 Alert: {alert_type} (Event #{event_id})"
            msg['From'] = settings.SMTP_FROM
            msg['To'] = settings.ALERT_EMAIL_TO

            # Construct content
            content = f"""PS-162 Industrial Fire & Thermal Anomaly Detection System

ALERT NOTIFICATION
==================
Alert ID: {alert_id}
Severity: {severity}
Type: {alert_type}
Event ID: {event_id}

"""
            # Extract details
            if details.get("detected_at"):
                content += f"Detection Time: {details['detected_at']}\n"
            if details.get("latitude") and details.get("longitude"):
                content += f"Coordinates: {details['latitude']}, {details['longitude']}\n"
            if details.get("frp"):
                content += f"FRP: {details['frp']}\n"
            if details.get("brightness_temperature"):
                content += f"Brightness Temp: {details['brightness_temperature']} K\n"
            if details.get("confidence"):
                content += f"Confidence: {details['confidence']}\n"
                
            content += "\nAI CLASSIFICATION\n=================\n"
            prob = details.get("model_probability")
            if prob is not None:
                prob_pct = round(prob * 100, 2)
                content += f"Model A calibrated probability for GIHS-associated industrial heat-source association: {prob_pct}%\n"
            else:
                content += "Model A calibrated probability: Not available\n"
            content += "\n*Note: Model evidence is not causal proof.\n"
            
            content += "\nDASHBOARD LINK\n==============\n"
            # Using VITE_API_URL or config for link? Let's use FRONTEND_URL
            content += f"{settings.FRONTEND_URL}/events/{event_id}\n"
            
            msg.set_content(content)

            # Send email
            if settings.SMTP_PORT == 465:
                # SSL
                with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                    if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.send_message(msg)
            else:
                # TLS
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                    # In test environments we might not have starttls
                    try:
                        server.starttls()
                    except smtplib.SMTPNotSupportedError:
                        pass
                    if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.send_message(msg)
                    
            logger.info(f"Successfully sent alert notification for alert {alert_id} to {settings.ALERT_EMAIL_TO}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send alert email for {alert_id}: {str(e)}")
            return False

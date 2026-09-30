import logging
import uuid
from typing import List, Optional, Tuple
import datetime
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
from sqlalchemy import exc

from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.alert import Alert, AlertType, AlertSeverity, AlertStatus, NotificationStatus
from backend.app.services.features import FeatureEngineeringService
from backend.app.api.classification import get_model
from backend.app.services.email_service import EmailService

logger = logging.getLogger(__name__)

class AlertService:
    def process_new_events(self, db: Session, event_ids: List[int]) -> List[Alert]:
        """
        Process newly ingested thermal events and generate alerts if rules are met.
        Returns the list of generated Alert models.
        """
        new_alerts = []
        feat_svc = FeatureEngineeringService()
        
        try:
            model, meta = get_model()
            model_available = True
        except Exception:
            model_available = False
            model = None
            meta = None
            
        for eid in event_ids:
            try:
                event = db.query(ThermalEvent).filter(ThermalEvent.id == eid).first()
                if not event:
                    continue
                    
                # 1. NEW_THERMAL_ANOMALY (LOW)
                alert1 = self._create_alert_if_unique(
                    db=db,
                    thermal_event_id=eid,
                    alert_type=AlertType.NEW_THERMAL_ANOMALY,
                    severity=AlertSeverity.LOW,
                    title="New Thermal Anomaly Detected",
                    message=f"A new thermal anomaly was detected by {event.satellite} at {event.detected_at}.",
                    evidence_json={
                        "satellite": event.satellite,
                        "frp": event.frp,
                        "brightness_temperature": event.brightness_temperature,
                        "confidence": event.confidence
                    }
                )
                if alert1:
                    new_alerts.append(alert1)
                    
                # Generate Features
                try:
                    feature_record = feat_svc.generate_features_for_event(eid, db)
                except Exception as e:
                    logger.warning(f"Feature generation failed for event {eid} during alert processing: {e}")
                    continue
                    
                if not feature_record:
                    continue
                    
                # 2. PERSISTENT_THERMAL_ACTIVITY (MEDIUM)
                # Rule: persistence_days >= 3 OR hotspot_frequency_30d >= 5
                persistence_days = feature_record.persistence_days or 0
                freq_30d = feature_record.hotspot_frequency_30d or 0
                if persistence_days >= 3 or freq_30d >= 5:
                    alert2 = self._create_alert_if_unique(
                        db=db,
                        thermal_event_id=eid,
                        alert_type=AlertType.PERSISTENT_THERMAL_ACTIVITY,
                        severity=AlertSeverity.MEDIUM,
                        title="Persistent Thermal Activity",
                        message=f"Thermal activity shows persistence (days: {persistence_days}) or high 30-day frequency ({freq_30d}).",
                        evidence_json={
                            "persistence_days": persistence_days,
                            "hotspot_frequency_30d": freq_30d
                        }
                    )
                    if alert2:
                        new_alerts.append(alert2)

                # 3. INDUSTRIAL_HEAT_SOURCE_ALERT (HIGH)
                # Rule: Model A probability > 0.7
                if model_available:
                    prob = self._run_model_a(feature_record, model, meta)
                    if prob is not None and prob > 0.7:
                        alert3 = self._create_alert_if_unique(
                            db=db,
                            thermal_event_id=eid,
                            alert_type=AlertType.INDUSTRIAL_HEAT_SOURCE_ALERT,
                            severity=AlertSeverity.HIGH,
                            title="Industrial Heat Source Alert",
                            message=f"Model A classified this event as an industrial heat source with {prob:.1%} probability.",
                            model_probability=prob,
                            evidence_json={
                                "model_probability": prob,
                                "distance_to_facility_meters": feature_record.distance_to_facility_meters,
                                "nearby_facility_count": feature_record.nearby_facility_count
                            }
                        )
                        if alert3:
                            new_alerts.append(alert3)
                            
            except Exception as e:
                logger.error(f"Error processing alerts for event {eid}: {e}")
                
        from backend.app.core.config import settings
        
        # Process emails for newly created HIGH alerts
        for alert in new_alerts:
            if alert.severity == AlertSeverity.HIGH and alert.notification_status == NotificationStatus.PENDING:
                # Compile details for the email
                event = db.query(ThermalEvent).filter(ThermalEvent.id == alert.thermal_event_id).first()
                if not event:
                    continue
                    
                details = {
                    "detected_at": str(event.detected_at),
                    "latitude": event.latitude,
                    "longitude": event.longitude,
                    "frp": event.frp,
                    "brightness_temperature": event.brightness_temperature,
                    "confidence": event.confidence,
                    "model_probability": alert.model_probability
                }
                
                if settings.ALERT_EMAIL_ENABLED:
                    success = EmailService.send_alert_notification(
                        alert_id=alert.id,
                        event_id=alert.thermal_event_id,
                        severity=alert.severity.value,
                        alert_type=alert.alert_type.value,
                        details=details
                    )
                    
                    alert.notification_status = NotificationStatus.SENT if success else NotificationStatus.FAILED
                    alert.notification_timestamp = datetime.datetime.utcnow()
                    alert.notification_recipient = settings.ALERT_EMAIL_TO
                    if not success:
                        alert.notification_error = "SMTP transmission failed"
                else:
                    alert.notification_status = NotificationStatus.DISABLED
                    alert.notification_timestamp = datetime.datetime.utcnow()
                    
                try:
                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.error(f"Failed to update alert notification status for {alert.id}: {e}")
                    
        return new_alerts

    def _create_alert_if_unique(
        self, 
        db: Session, 
        thermal_event_id: int, 
        alert_type: AlertType, 
        severity: AlertSeverity, 
        title: str, 
        message: str, 
        model_probability: Optional[float] = None,
        evidence_json: Optional[dict] = None
    ) -> Optional[Alert]:
        
        # Deduplication check
        existing = db.query(Alert).filter(
            Alert.thermal_event_id == thermal_event_id,
            Alert.alert_type == alert_type
        ).first()
        
        if existing:
            return None
            
        new_alert = Alert(
            id=str(uuid.uuid4()),
            thermal_event_id=thermal_event_id,
            alert_type=alert_type,
            severity=severity,
            status=AlertStatus.ACTIVE,
            title=title,
            message=message,
            model_probability=model_probability,
            evidence_json=evidence_json,
            notification_status=NotificationStatus.PENDING if severity == AlertSeverity.HIGH else NotificationStatus.NOT_APPLICABLE
        )
        db.add(new_alert)
        try:
            db.commit()
            db.refresh(new_alert)
            return new_alert
        except exc.IntegrityError:
            db.rollback()
            return None

    def _run_model_a(self, feature_record, model, meta) -> Optional[float]:
        try:
            required_features = meta['feature_list']
            
            raw_dict = {
                "distance_to_facility_meters": feature_record.distance_to_facility_meters,
                "nearby_facility_count": feature_record.nearby_facility_count,
                "hotspot_frequency_30d": feature_record.hotspot_frequency_30d,
                "persistence_days": feature_record.persistence_days,
            }
            
            if feature_record.additional_features:
                add = feature_record.additional_features
                firms = add.get("firms", {})
                raw_dict["frp"] = firms.get("frp")
                raw_dict["brightness_temperature"] = firms.get("brightness_temperature")
                raw_dict["day_night"] = firms.get("day_night")
                osm = add.get("osm", {})
                raw_dict["nearest_facility_type"] = osm.get("nearest_facility_type")
                wc = add.get("worldcover", {})
                raw_dict["land_cover_at_event"] = wc.get("land_cover_at_event")
                raw_dict["is_built_up"] = 1 if wc.get("land_cover_at_event") == 50 else 0
                temp = add.get("temporal", {})
                raw_dict["recurrence_rate"] = temp.get("recurrence_rate")
                
            df_pred = pd.DataFrame([raw_dict])
            
            for f in required_features:
                if f not in df_pred.columns:
                    df_pred[f] = np.nan
                    
            df_pred = df_pred[required_features]
            
            if 'day_night' in df_pred.columns:
                df_pred['day_night'] = df_pred['day_night'].astype('category')
            
            prob = float(model.predict_proba(df_pred)[0][1])
            return prob
        except Exception:
            return None

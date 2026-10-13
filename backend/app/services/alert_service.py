import logging
import uuid
from typing import List, Optional, Tuple, Set
import datetime
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
from sqlalchemy import exc, or_, and_

from backend.app.core.config import settings
from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.alert import Alert, AlertType, AlertSeverity, AlertStatus
from backend.app.services.features import FeatureEngineeringService
from backend.app.api.classification import get_model

logger = logging.getLogger(__name__)

class AlertService:
    def expire_stale_alerts(self, db: Session, now: Optional[datetime.datetime] = None) -> int:
        """
        Transitions ACTIVE alerts whose active window has elapsed to EXPIRED.
        Active window is governed by settings.ALERT_ACTIVE_WINDOW_HOURS.
        Returns the number of alerts transitioned to EXPIRED.
        """
        if not settings.ALERT_AUTO_EXPIRE_ENABLED:
            return 0

        current_time = now or datetime.datetime.utcnow()
        active_window = datetime.timedelta(hours=settings.ALERT_ACTIVE_WINDOW_HOURS)
        cutoff_time = current_time - active_window

        try:
            stale_alerts = db.query(Alert).filter(
                Alert.status == AlertStatus.ACTIVE,
                or_(
                    Alert.expires_at <= current_time,
                    and_(Alert.expires_at.is_(None), Alert.last_seen_at < cutoff_time),
                    and_(Alert.expires_at.is_(None), Alert.last_seen_at.is_(None), Alert.created_at < cutoff_time)
                )
            ).all()

            if not stale_alerts:
                return 0

            count = len(stale_alerts)
            for a in stale_alerts:
                a.status = AlertStatus.EXPIRED
                a.updated_at = current_time
                if not a.expires_at:
                    base = a.last_seen_at or a.created_at or current_time
                    a.expires_at = base + active_window

            db.commit()
            logger.info("Expired %d stale alerts outside %dh active window", count, settings.ALERT_ACTIVE_WINDOW_HOURS)
            return count
        except Exception as exc_err:
            logger.error("Error expiring stale alerts: %s", exc_err)
            db.rollback()
            return 0

    def touch_existing_events(
        self,
        db: Session,
        source_event_ids: List[str],
        seen_time: Optional[datetime.datetime] = None
    ) -> int:
        """
        Updates last_seen_at and expires_at for alerts belonging to existing FIRMS observations.
        Does not create duplicate alerts; refreshes the active state if currently EXPIRED/ACTIVE.
        """
        if not source_event_ids:
            return 0

        current_time = seen_time or datetime.datetime.utcnow()
        new_expiry = current_time + datetime.timedelta(hours=settings.ALERT_ACTIVE_WINDOW_HOURS)

        try:
            # Find thermal event IDs for the source_event_ids
            event_ids = [
                row[0] for row in db.query(ThermalEvent.id)
                .filter(ThermalEvent.source_event_id.in_(source_event_ids))
                .all()
            ]
            if not event_ids:
                return 0

            alerts = db.query(Alert).filter(Alert.thermal_event_id.in_(event_ids)).all()
            updated_count = 0
            for a in alerts:
                a.last_seen_at = current_time
                a.expires_at = new_expiry
                a.updated_at = current_time
                # If it was EXPIRED, reactivate it since we re-observed it live
                if a.status == AlertStatus.EXPIRED:
                    a.status = AlertStatus.ACTIVE
                updated_count += 1

            if updated_count > 0:
                db.commit()
                logger.info("Updated activity window for %d existing alerts across %d events", updated_count, len(event_ids))
            return updated_count
        except Exception as exc_err:
            logger.error("Error touching existing event alerts: %s", exc_err)
            db.rollback()
            return 0

    def process_new_events(self, db: Session, event_ids: List[int]) -> List[Alert]:
        """
        Process newly ingested or evaluated thermal events and generate or update alerts.
        Returns the list of generated/updated Alert models.
        """
        return self.process_events(db, event_ids)

    def process_events(self, db: Session, event_ids: List[int]) -> List[Alert]:
        """
        Process thermal events, evaluating alert rules and creating or updating alert records.
        """
        processed_alerts = []
        feat_svc = FeatureEngineeringService()
        now = datetime.datetime.utcnow()
        active_window = datetime.timedelta(hours=settings.ALERT_ACTIVE_WINDOW_HOURS)

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

                # Determine base time and expiry time for event alerts
                event_time = event.detected_at
                if event_time and hasattr(event_time, "tzinfo") and event_time.tzinfo:
                    event_time = event_time.replace(tzinfo=None)
                if not event_time:
                    event_time = now

                expires_at = event_time + active_window
                is_currently_active = (expires_at > now) or (not settings.ALERT_AUTO_EXPIRE_ENABLED)
                initial_status = AlertStatus.ACTIVE if is_currently_active else AlertStatus.EXPIRED

                # 1. NEW_THERMAL_ANOMALY (LOW)
                alert1 = self._create_or_update_alert(
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
                    },
                    event_time=event_time,
                    expires_at=expires_at,
                    initial_status=initial_status
                )
                if alert1:
                    processed_alerts.append(alert1)

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
                    alert2 = self._create_or_update_alert(
                        db=db,
                        thermal_event_id=eid,
                        alert_type=AlertType.PERSISTENT_THERMAL_ACTIVITY,
                        severity=AlertSeverity.MEDIUM,
                        title="Persistent Thermal Activity",
                        message=f"Thermal activity shows persistence (days: {persistence_days}) or high 30-day frequency ({freq_30d}).",
                        evidence_json={
                            "persistence_days": persistence_days,
                            "hotspot_frequency_30d": freq_30d
                        },
                        event_time=event_time,
                        expires_at=expires_at,
                        initial_status=initial_status
                    )
                    if alert2:
                        processed_alerts.append(alert2)

                # 3. INDUSTRIAL_HEAT_SOURCE_ALERT (HIGH)
                # Rule: Model A probability > 0.7
                if model_available:
                    prob = self._run_model_a(feature_record, model, meta)
                    if prob is not None and prob > 0.7:
                        alert3 = self._create_or_update_alert(
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
                            },
                            event_time=event_time,
                            expires_at=expires_at,
                            initial_status=initial_status
                        )
                        if alert3:
                            processed_alerts.append(alert3)

            except Exception as e:
                logger.error(f"Error processing alerts for event {eid}: {e}")

        return processed_alerts

    def _create_or_update_alert(
        self,
        db: Session,
        thermal_event_id: int,
        alert_type: AlertType,
        severity: AlertSeverity,
        title: str,
        message: str,
        model_probability: Optional[float] = None,
        evidence_json: Optional[dict] = None,
        event_time: Optional[datetime.datetime] = None,
        expires_at: Optional[datetime.datetime] = None,
        initial_status: AlertStatus = AlertStatus.ACTIVE
    ) -> Optional[Alert]:
        """
        Creates a new alert or updates an existing alert for the same (event_id, alert_type).
        Avoids creating duplicate rows while maintaining current activity and expiry timestamps.
        """
        now = datetime.datetime.utcnow()
        effective_event_time = event_time or now
        effective_expires_at = expires_at or (effective_event_time + datetime.timedelta(hours=settings.ALERT_ACTIVE_WINDOW_HOURS))

        # Check for existing alert for this event + alert_type
        existing = db.query(Alert).filter(
            Alert.thermal_event_id == thermal_event_id,
            Alert.alert_type == alert_type
        ).first()

        if existing:
            # Update existing alert record
            existing.last_seen_at = effective_event_time
            existing.expires_at = effective_expires_at
            existing.updated_at = now
            if model_probability is not None:
                existing.model_probability = model_probability
            if evidence_json:
                existing.evidence_json = evidence_json

            # Lifecycle status transition
            if existing.status == AlertStatus.EXPIRED and effective_expires_at > now:
                # Re-activated
                existing.status = AlertStatus.ACTIVE
            elif existing.status == AlertStatus.ACTIVE and effective_expires_at <= now and settings.ALERT_AUTO_EXPIRE_ENABLED:
                existing.status = AlertStatus.EXPIRED

            try:
                db.commit()
                db.refresh(existing)
                return existing
            except Exception as exc_err:
                logger.error("Failed to update existing alert %s: %s", existing.id, exc_err)
                db.rollback()
                return existing

        # Create genuinely new alert
        new_alert = Alert(
            id=str(uuid.uuid4()),
            thermal_event_id=thermal_event_id,
            alert_type=alert_type,
            severity=severity,
            status=initial_status,
            title=title,
            message=message,
            model_probability=model_probability,
            evidence_json=evidence_json,
            created_at=now,
            updated_at=now,
            last_seen_at=effective_event_time,
            expires_at=effective_expires_at
        )
        db.add(new_alert)
        try:
            db.commit()
            db.refresh(new_alert)
            return new_alert
        except exc.IntegrityError:
            db.rollback()
            # If concurrent insert happened, fetch and return
            existing_after = db.query(Alert).filter(
                Alert.thermal_event_id == thermal_event_id,
                Alert.alert_type == alert_type
            ).first()
            return existing_after
        except Exception as exc_err:
            logger.error("Failed to insert alert: %s", exc_err)
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


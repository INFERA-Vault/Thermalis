import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
import datetime
import uuid
from geoalchemy2.elements import WKTElement

from backend.app.models.alert import Alert, AlertType, AlertSeverity, AlertStatus
from backend.app.models.thermal_event import ThermalEvent
from backend.app.services.alert_service import AlertService
from backend.app.core.config import settings


def test_alert_api_lifecycle(client: TestClient, db_session: Session):
    # 1. Create a dummy thermal event
    event = ThermalEvent(
        source="MOCK",
        source_event_id=f"mock_evt_{uuid.uuid4()}",
        detected_at=datetime.datetime.utcnow(),
        latitude=10.0,
        longitude=10.0,
        geometry=WKTElement("POINT(10.0 10.0)", srid=4326),
        confidence="High"
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)

    # 2. Create an alert directly in DB
    alert_id = str(uuid.uuid4())
    alert = Alert(
        id=alert_id,
        thermal_event_id=event.id,
        alert_type=AlertType.NEW_THERMAL_ANOMALY,
        severity=AlertSeverity.LOW,
        status=AlertStatus.ACTIVE,
        title="Test Alert",
        message="This is a test alert",
        created_at=datetime.datetime.utcnow(),
        last_seen_at=datetime.datetime.utcnow(),
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    )
    db_session.add(alert)
    db_session.commit()

    # 3. Test listing alerts
    resp = client.get("/api/v1/alerts/")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert any(a["id"] == alert_id for a in data)

    # 4. Test filtering
    resp = client.get(f"/api/v1/alerts/?alert_type={AlertType.NEW_THERMAL_ANOMALY.value}")
    assert resp.status_code == 200
    data = resp.json()
    assert any(a["id"] == alert_id for a in data)

    # 5. Test count endpoint returns all categories
    resp_count = client.get("/api/v1/alerts/count")
    assert resp_count.status_code == 200
    count_data = resp_count.json()
    assert "active_alerts" in count_data
    assert "acknowledged_alerts" in count_data
    assert "resolved_alerts" in count_data
    assert "expired_alerts" in count_data
    assert "total_alerts" in count_data

    # 6. Test acknowledge
    resp = client.post(f"/api/v1/alerts/{alert_id}/acknowledge")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ACKNOWLEDGED"

    # 7. Test resolve
    resp = client.post(f"/api/v1/alerts/{alert_id}/resolve")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "RESOLVED"
    
    # 8. Test invalid resolve
    resp = client.post(f"/api/v1/alerts/nonexistent/resolve")
    assert resp.status_code == 404

    # Cleanup
    db_session.delete(alert)
    db_session.delete(event)
    db_session.commit()


def test_scenario_a_repeated_refresh_deduplication(db_session: Session):
    """
    A. Same FIRMS event + same alert type refreshed repeatedly -> one alert record, not many.
    """
    event = ThermalEvent(
        source="MOCK",
        source_event_id=f"mock_dup_{uuid.uuid4()}",
        detected_at=datetime.datetime.utcnow(),
        latitude=12.5,
        longitude=77.5,
        geometry=WKTElement("POINT(77.5 12.5)", srid=4326),
        confidence="nominal"
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)

    alert_svc = AlertService()
    # Process 3 times consecutively
    alerts_run1 = alert_svc.process_new_events(db_session, [event.id])
    alerts_run2 = alert_svc.process_new_events(db_session, [event.id])
    alerts_run3 = alert_svc.process_new_events(db_session, [event.id])

    # Count alert records for this event
    total_records = db_session.query(Alert).filter(
        Alert.thermal_event_id == event.id,
        Alert.alert_type == AlertType.NEW_THERMAL_ANOMALY
    ).count()

    assert total_records == 1, f"Expected exactly 1 alert record for this event+type, got {total_records}"

    # Cleanup
    db_session.query(Alert).filter(Alert.thermal_event_id == event.id).delete()
    db_session.delete(event)
    db_session.commit()


def test_scenario_b_multiple_distinct_alert_types(db_session: Session):
    """
    B. Same event can still have multiple different alert types -> allowed.
    """
    event = ThermalEvent(
        source="MOCK",
        source_event_id=f"mock_multi_{uuid.uuid4()}",
        detected_at=datetime.datetime.utcnow(),
        latitude=13.0,
        longitude=80.0,
        geometry=WKTElement("POINT(80.0 13.0)", srid=4326),
        confidence="high"
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)

    alert_svc = AlertService()
    alert1 = alert_svc._create_or_update_alert(
        db=db_session,
        thermal_event_id=event.id,
        alert_type=AlertType.NEW_THERMAL_ANOMALY,
        severity=AlertSeverity.LOW,
        title="Anomaly 1",
        message="Message 1"
    )
    alert2 = alert_svc._create_or_update_alert(
        db=db_session,
        thermal_event_id=event.id,
        alert_type=AlertType.PERSISTENT_THERMAL_ACTIVITY,
        severity=AlertSeverity.MEDIUM,
        title="Persistent 2",
        message="Message 2"
    )

    distinct_types = db_session.query(Alert.alert_type).filter(Alert.thermal_event_id == event.id).all()
    assert len(distinct_types) == 2
    types_set = {t[0] for t in distinct_types}
    assert AlertType.NEW_THERMAL_ANOMALY in types_set
    assert AlertType.PERSISTENT_THERMAL_ACTIVITY in types_set

    # Cleanup
    db_session.query(Alert).filter(Alert.thermal_event_id == event.id).delete()
    db_session.delete(event)
    db_session.commit()


def test_scenario_c_newly_detected_event_creates_active_alert(db_session: Session):
    """
    C. Newly detected event -> creates appropriate ACTIVE alert(s).
    """
    now = datetime.datetime.utcnow()
    event = ThermalEvent(
        source="MOCK",
        source_event_id=f"mock_new_{uuid.uuid4()}",
        detected_at=now,
        latitude=14.0,
        longitude=75.0,
        geometry=WKTElement("POINT(75.0 14.0)", srid=4326),
        confidence="high"
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)

    alert_svc = AlertService()
    created_alerts = alert_svc.process_new_events(db_session, [event.id])
    assert len(created_alerts) >= 1
    new_anomaly_alert = [a for a in created_alerts if a.alert_type == AlertType.NEW_THERMAL_ANOMALY][0]
    assert new_anomaly_alert.status == AlertStatus.ACTIVE
    assert new_anomaly_alert.expires_at > now

    # Cleanup
    db_session.query(Alert).filter(Alert.thermal_event_id == event.id).delete()
    db_session.delete(event)
    db_session.commit()


def test_scenario_d_old_event_outside_window_is_expired(client: TestClient, db_session: Session):
    """
    D. Old event outside the configured active window -> no longer counted as ACTIVE.
    """
    old_time = datetime.datetime.utcnow() - datetime.timedelta(hours=48)
    event = ThermalEvent(
        source="MOCK",
        source_event_id=f"mock_old_{uuid.uuid4()}",
        detected_at=old_time,
        latitude=15.0,
        longitude=76.0,
        geometry=WKTElement("POINT(76.0 15.0)", srid=4326),
        confidence="high"
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)

    alert_svc = AlertService()
    created = alert_svc.process_new_events(db_session, [event.id])
    assert len(created) >= 1
    old_alert = created[0]
    assert old_alert.status == AlertStatus.EXPIRED

    # Check /count endpoint
    resp = client.get("/api/v1/alerts/count")
    data = resp.json()
    assert data["expired_alerts"] >= 1

    # Cleanup
    db_session.query(Alert).filter(Alert.thermal_event_id == event.id).delete()
    db_session.delete(event)
    db_session.commit()


def test_scenario_e_resolved_alert_lifecycle(client: TestClient, db_session: Session):
    """
    E. Resolved alert -> remains in history but is not counted as ACTIVE.
    """
    event = ThermalEvent(
        source="MOCK",
        source_event_id=f"mock_res_{uuid.uuid4()}",
        detected_at=datetime.datetime.utcnow(),
        latitude=16.0,
        longitude=77.0,
        geometry=WKTElement("POINT(77.0 16.0)", srid=4326),
        confidence="high"
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)

    alert_svc = AlertService()
    created = alert_svc.process_new_events(db_session, [event.id])
    alert = created[0]
    alert_id = alert.id

    # Active count before resolve
    before_resp = client.get("/api/v1/alerts/count").json()
    active_before = before_resp["active_alerts"]
    resolved_before = before_resp["resolved_alerts"]

    # Resolve
    resolve_resp = client.post(f"/api/v1/alerts/{alert_id}/resolve")
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["status"] == "RESOLVED"

    # Active count after resolve
    after_resp = client.get("/api/v1/alerts/count").json()
    assert after_resp["active_alerts"] == active_before - 1
    assert after_resp["resolved_alerts"] == resolved_before + 1

    # Historical query still includes it
    get_resp = client.get(f"/api/v1/alerts/{alert_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "RESOLVED"

    # Cleanup
    db_session.query(Alert).filter(Alert.thermal_event_id == event.id).delete()
    db_session.delete(event)
    db_session.commit()


def test_scenario_f_repeated_refresh_count_stability(client: TestClient, db_session: Session):
    """
    F. Repeated FIRMS refresh with no genuinely new observations -> Active Alerts count remains stable.
    """
    event = ThermalEvent(
        source="MOCK",
        source_event_id=f"mock_stable_{uuid.uuid4()}",
        detected_at=datetime.datetime.utcnow(),
        latitude=17.0,
        longitude=78.0,
        geometry=WKTElement("POINT(78.0 17.0)", srid=4326),
        confidence="high"
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)

    alert_svc = AlertService()
    alert_svc.process_new_events(db_session, [event.id])

    # Initial count
    count1 = client.get("/api/v1/alerts/count").json()["active_alerts"]

    # Simulate 3 identical refresh cycles touching existing observations
    for _ in range(3):
        alert_svc.touch_existing_events(db_session, [event.source_event_id])
        alert_svc.expire_stale_alerts(db_session)
        count_n = client.get("/api/v1/alerts/count").json()["active_alerts"]
        assert count_n == count1, f"Active alerts count changed! Expected {count1}, got {count_n}"

    # Cleanup
    db_session.query(Alert).filter(Alert.thermal_event_id == event.id).delete()
    db_session.delete(event)
    db_session.commit()


def test_scenario_g_new_observation_increases_active_count(client: TestClient, db_session: Session):
    """
    G. New FIRMS observation that creates a genuinely new alert condition -> Active Alerts increases appropriately.
    """
    initial_count = client.get("/api/v1/alerts/count").json()["active_alerts"]

    event = ThermalEvent(
        source="MOCK",
        source_event_id=f"mock_increase_{uuid.uuid4()}",
        detected_at=datetime.datetime.utcnow(),
        latitude=18.0,
        longitude=79.0,
        geometry=WKTElement("POINT(79.0 18.0)", srid=4326),
        confidence="high"
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)

    alert_svc = AlertService()
    new_alerts = alert_svc.process_new_events(db_session, [event.id])
    active_new = sum(1 for a in new_alerts if a.status == AlertStatus.ACTIVE)

    updated_count = client.get("/api/v1/alerts/count").json()["active_alerts"]
    assert updated_count == initial_count + active_new

    # Cleanup
    db_session.query(Alert).filter(Alert.thermal_event_id == event.id).delete()
    db_session.delete(event)
    db_session.commit()


def test_scenario_h_existing_active_alert_updated_not_duplicated(db_session: Session):
    """
    H. Existing active alert seen again -> update existing record rather than incrementing count.
    """
    t1 = datetime.datetime.utcnow() - datetime.timedelta(hours=2)
    event = ThermalEvent(
        source="MOCK",
        source_event_id=f"mock_update_{uuid.uuid4()}",
        detected_at=t1,
        latitude=19.0,
        longitude=80.0,
        geometry=WKTElement("POINT(80.0 19.0)", srid=4326),
        confidence="high"
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)

    alert_svc = AlertService()
    a1 = alert_svc.process_new_events(db_session, [event.id])[0]
    initial_alert_id = a1.id
    initial_seen = a1.last_seen_at

    # Seen again at t2
    t2 = datetime.datetime.utcnow()
    alert_svc.touch_existing_events(db_session, [event.source_event_id], seen_time=t2)

    db_session.refresh(a1)
    # Alert ID remains the same
    assert a1.id == initial_alert_id
    # last_seen_at was updated to t2
    assert a1.last_seen_at >= initial_seen
    # Total count for this event is still 1
    count = db_session.query(Alert).filter(Alert.thermal_event_id == event.id).count()
    assert count == 1

    # Cleanup
    db_session.query(Alert).filter(Alert.thermal_event_id == event.id).delete()
    db_session.delete(event)
    db_session.commit()


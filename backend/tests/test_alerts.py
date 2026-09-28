import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from backend.app.models.alert import Alert, AlertType, AlertSeverity, AlertStatus
from backend.app.models.thermal_event import ThermalEvent
import datetime
import uuid

from geoalchemy2.elements import WKTElement

def test_alert_api(client: TestClient, db_session: Session):
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
        message="This is a test alert"
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

    # 5. Test acknowledge
    resp = client.post(f"/api/v1/alerts/{alert_id}/acknowledge")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ACKNOWLEDGED"

    # 6. Test resolve
    resp = client.post(f"/api/v1/alerts/{alert_id}/resolve")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "RESOLVED"
    
    # 7. Test invalid resolve
    resp = client.post(f"/api/v1/alerts/nonexistent/resolve")
    assert resp.status_code == 404

    # Cleanup
    db_session.delete(alert)
    db_session.delete(event)
    db_session.commit()

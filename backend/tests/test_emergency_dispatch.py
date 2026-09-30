from types import SimpleNamespace

from backend.app.models.alert import AlertSeverity
from backend.app.services.emergency_dispatch import EmergencyDispatchService


def _recipient(**overrides):
    values = {
        "enabled": True,
        "verified": True,
        "minimum_severity": AlertSeverity.HIGH,
        "coverage_radius_meters": 5_000.0,
        "location_latitude": 28.6139,
        "location_longitude": 77.2090,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _event(**overrides):
    values = {"latitude": 28.6140, "longitude": 77.2091}
    values.update(overrides)
    return SimpleNamespace(**values)


def test_recipient_matches_when_verified_and_inside_coverage():
    recipient = _recipient()

    assert EmergencyDispatchService.recipient_matches(recipient, _event(), AlertSeverity.HIGH)


def test_recipient_does_not_match_when_outside_coverage():
    recipient = _recipient(coverage_radius_meters=100.0)

    assert not EmergencyDispatchService.recipient_matches(
        recipient,
        _event(latitude=28.7041, longitude=77.1025),
        AlertSeverity.HIGH,
    )


def test_recipient_requires_verification_and_threshold():
    assert not EmergencyDispatchService.recipient_matches(
        _recipient(verified=False), _event(), AlertSeverity.HIGH
    )
    assert not EmergencyDispatchService.recipient_matches(
        _recipient(minimum_severity=AlertSeverity.HIGH), _event(), AlertSeverity.MEDIUM
    )


def test_verified_global_contact_matches_without_coordinates():
    recipient = _recipient(location_latitude=None, location_longitude=None)

    assert EmergencyDispatchService.recipient_matches(recipient, _event(), AlertSeverity.HIGH)

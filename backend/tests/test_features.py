import pytest
from datetime import datetime, timezone
from backend.app.services.features import FeatureEngineeringService
from backend.app.models.thermal_event import ThermalEvent
from geoalchemy2.elements import WKTElement

@pytest.fixture
def feature_service():
    return FeatureEngineeringService(temporal_window_days=30, spatial_radius_meters=2000.0)

def test_get_firms_features(feature_service):
    dt = datetime(2023, 1, 1, 12, 0, tzinfo=timezone.utc)
    event = ThermalEvent(
        id=1,
        brightness_temperature=320.5,
        frp=15.2,
        confidence="h",
        satellite="Aqua",
        detected_at=dt,
        latitude=18.0,
        longitude=74.0,
        geometry=WKTElement("POINT(74.0 18.0)", srid=4326)
    )
    
    feats = feature_service._get_firms_features(event)
    assert feats["brightness_temperature"] == 320.5
    assert feats["frp"] == 15.2
    assert feats["confidence"] == "h"
    assert feats["day_night"] == "D"
    assert feats["satellite"] == "Aqua"
    assert feats["acquisition_hour"] == 12

def test_get_firms_features_night(feature_service):
    dt = datetime(2023, 1, 1, 2, 0, tzinfo=timezone.utc)
    event = ThermalEvent(
        id=1,
        detected_at=dt,
        latitude=18.0,
        longitude=74.0,
        geometry=WKTElement("POINT(74.0 18.0)", srid=4326)
    )
    
    feats = feature_service._get_firms_features(event)
    assert feats["day_night"] == "N"
    assert feats["acquisition_hour"] == 2

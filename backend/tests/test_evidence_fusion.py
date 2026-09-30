from backend.app.services.evidence_fusion import EvidenceFusionService


def _features(**overrides):
    base = {
        "distance_to_facility_meters": 50,
        "nearby_facility_count": 2,
        "hotspot_frequency_30d": 8,
        "persistence_days": 10,
        "additional_features": {
            "firms": {"frp": 80, "brightness_temperature": 375, "confidence": "high"},
            "temporal": {"active_days": 5, "observation_count": 8, "persistence_duration_days": 10},
            "osm": {"nearest_facility_distance": 50, "nearby_industrial_facility_count": 2},
            "satellite": {"sentinel1_observations": 0, "sentinel2_observations": 1},
            "worldcover": {"land_cover_at_event": 50},
        },
    }
    base.update(overrides)
    return base


def test_fusion_identifies_persistent_industrial_context():
    result = EvidenceFusionService().assess(
        {"id": 101, "frp": 80, "brightness_temperature": 375, "confidence": "high"},
        _features(),
    )

    assert result["method_version"] == "TCEF-v1"
    assert result["evidence_score"] >= 75
    assert result["interpretation"] == "PERSISTENT_INDUSTRIAL_HEAT_CONTEXT"
    assert result["data_coverage"] == 100.0
    assert result["reference_model_used"] is False


def test_fusion_keeps_cropland_event_out_of_industrial_escalation():
    features = _features(
        distance_to_facility_meters=None,
        nearby_facility_count=0,
        hotspot_frequency_30d=1,
        persistence_days=0,
        additional_features={
            "firms": {"frp": 3, "brightness_temperature": 310, "confidence": "low"},
            "temporal": {"active_days": 1, "observation_count": 1, "persistence_duration_days": 0},
            "osm": {"nearest_facility_distance": None, "nearby_industrial_facility_count": 0},
            "satellite": {"sentinel1_observations": 0, "sentinel2_observations": 0},
            "worldcover": {"land_cover_at_event": 40},
        },
    )
    result = EvidenceFusionService().assess(
        {"id": 102, "frp": 3, "brightness_temperature": 310, "confidence": "low"},
        features,
    )

    assert result["interpretation"] == "POSSIBLE_NON_INDUSTRIAL_BURNING"
    assert result["priority"] == "LOW"
    assert result["signals"][2]["score"] == 0.0


def test_fusion_reports_data_coverage_and_missing_signals():
    result = EvidenceFusionService().assess(
        {"id": 103, "confidence": None},
        {"additional_features": {}},
    )

    assert result["data_coverage"] == 0.0
    assert result["interpretation"] == "INSUFFICIENT_EVIDENCE"
    assert len(result["missing_signals"]) == 6
    assert "not a calibrated probability" in result["caution"]


def test_fusion_separates_natural_vegetation_context_from_cropland():
    features = _features(
        distance_to_facility_meters=None,
        nearby_facility_count=0,
        hotspot_frequency_30d=1,
        persistence_days=0,
        additional_features={
            "firms": {"frp": 30, "brightness_temperature": 350, "confidence": "high"},
            "temporal": {"active_days": 1, "observation_count": 1, "persistence_duration_days": 0},
            "osm": {"nearest_facility_distance": None, "nearby_industrial_facility_count": 0},
            "satellite": {"sentinel1_observations": 0, "sentinel2_observations": 0},
            "worldcover": {"land_cover_at_event": 10},
        },
    )
    result = EvidenceFusionService().assess(
        {"id": 104, "frp": 30, "brightness_temperature": 350, "confidence": "high"},
        features,
    )

    assert result["interpretation"] == "POSSIBLE_WILDFIRE_OR_NATURAL_BURNING"

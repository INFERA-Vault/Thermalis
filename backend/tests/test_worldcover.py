import pytest
from backend.app.services.worldcover import WorldCoverService

def test_get_tile_name():
    service = WorldCoverService()
    # Test positive coordinates
    assert service._get_tile_name(10.5, 75.2) == "N09E075"
    # Test zero
    assert service._get_tile_name(0.5, 0.5) == "N00E000"
    # Test negative coordinates
    assert service._get_tile_name(-10.5, -75.2) == "S12W078"

def test_extract_features_invalid_location():
    service = WorldCoverService()
    # A location in the ocean where there is no tile or no landcover
    res = service.extract_features(0.0, -179.0)
    # The URL will probably 403 or 404
    assert res["error"] is not None
    assert res["tile"] == "N00W180"

# Note: Integration test for a valid tile would require a live request which might be slow.
# We've tested the math and the extraction logic handles errors gracefully.

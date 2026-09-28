import pytest
import math
from backend.app.services.satellite import SatelliteService
from backend.app.schemas.satellite import SatelliteSearchRequest

@pytest.fixture
def satellite_service():
    return SatelliteService()

def test_generate_bbox(satellite_service):
    lat = 18.0
    lon = 74.0
    buffer_meters = 2000.0
    
    bbox = satellite_service._generate_bbox(lat, lon, buffer_meters)
    
    # 2000m should be approx 0.0179 degrees of latitude
    # 2000m should be approx 0.0189 degrees of longitude at lat=18
    
    min_lon, min_lat, max_lon, max_lat = bbox
    assert min_lon < lon < max_lon
    assert min_lat < lat < max_lat
    
    assert math.isclose(max_lat - lat, 2000.0 / 111320.0, rel_tol=1e-3)
    assert math.isclose(max_lon - lon, 2000.0 / (111320.0 * math.cos(math.radians(lat))), rel_tol=1e-3)

@pytest.mark.asyncio
async def test_satellite_search_request_schema():
    req = SatelliteSearchRequest(thermal_event_id=1)
    assert req.buffer_meters == 2000.0
    assert req.days_before == 30
    assert req.days_after == 5
    assert req.max_cloud_cover == 20.0

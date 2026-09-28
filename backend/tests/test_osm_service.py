import pytest
from unittest.mock import AsyncMock, patch
from backend.app.services.osm import (
    normalize_facility_type,
    parse_osm_elements,
    build_overpass_query,
    fetch_osm_data
)
from backend.app.schemas.osm import OSMIngestRequest

def test_normalize_facility_type():
    assert normalize_facility_type({"industrial": "refinery"}) == "REFINERY"
    assert normalize_facility_type({"man_made": "refinery"}) == "REFINERY"
    assert normalize_facility_type({"power": "plant"}) == "POWER_PLANT"
    assert normalize_facility_type({"generator:source": "coal"}) == "POWER_PLANT"
    assert normalize_facility_type({"man_made": "flare"}) == "FLARE"
    assert normalize_facility_type({"industrial": "chemical"}) == "CHEMICAL_PLANT"
    assert normalize_facility_type({"industrial": "mine"}) == "MINE"
    assert normalize_facility_type({"landuse": "quarry"}) == "MINE"
    assert normalize_facility_type({"industrial": "gas"}) == "GAS_FACILITY"
    assert normalize_facility_type({"industrial": "factory"}) == "FACTORY"
    assert normalize_facility_type({"landuse": "industrial"}) == "INDUSTRIAL_AREA"
    assert normalize_facility_type({"industrial": "something_else"}) == "OTHER_INDUSTRIAL"

def test_build_overpass_query():
    request = OSMIngestRequest(min_lon=70.0, min_lat=15.0, max_lon=80.0, max_lat=25.0)
    query = build_overpass_query(request)
    assert "15.0,70.0,25.0,80.0" in query
    assert 'node["industrial"]' in query
    assert "out center" in query

def test_parse_osm_elements_node():
    data = {
        "elements": [
            {
                "type": "node",
                "id": 12345,
                "lat": 28.6,
                "lon": 77.2,
                "tags": {
                    "name": "Test Refinery",
                    "industrial": "refinery"
                }
            }
        ]
    }
    parsed = parse_osm_elements(data)
    assert len(parsed) == 1
    fac = parsed[0]
    assert fac["source_id"] == "osm_node_12345"
    assert fac["name"] == "Test Refinery"
    assert fac["facility_type"] == "REFINERY"
    assert fac["geometry"] == "POINT (77.2 28.6)"
    assert fac["lat"] == 28.6
    assert fac["lon"] == 77.2

def test_parse_osm_elements_way():
    data = {
        "elements": [
            {
                "type": "way",
                "id": 67890,
                "center": {"lat": 19.1, "lon": 72.8},
                "tags": {
                    "power": "plant"
                }
            }
        ]
    }
    parsed = parse_osm_elements(data)
    assert len(parsed) == 1
    fac = parsed[0]
    assert fac["source_id"] == "osm_way_67890"
    assert fac["name"] is None
    assert fac["facility_type"] == "POWER_PLANT"
    assert fac["geometry"] == "POINT (72.8 19.1)"

def test_parse_osm_elements_no_tags_skipped():
    data = {
        "elements": [
            {
                "type": "node",
                "id": 111,
                "lat": 10.0,
                "lon": 20.0,
                # missing tags
            }
        ]
    }
    parsed = parse_osm_elements(data)
    assert len(parsed) == 0

@pytest.mark.asyncio
async def test_fetch_osm_data_success():
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = AsyncMock()
        # mock_resp.json is a regular method that returns dict
        mock_resp.json = lambda: {"elements": []}
        # raise_for_status is a regular method that does nothing on success
        mock_resp.raise_for_status = lambda: None
        mock_post.return_value = mock_resp
        
        data = await fetch_osm_data("query")
        assert data == {"elements": []}

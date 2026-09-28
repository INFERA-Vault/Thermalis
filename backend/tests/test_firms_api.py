"""
API Tests for NASA FIRMS Ingestion endpoint.
"""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.schemas.firms import FIRMSSourceEnum

SAMPLE_VIIRS_RESPONSE = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
28.6139,77.2090,342.5,0.39,0.36,2026-03-24,0530,N,VIIRS,nominal,2.0NRT,295.2,14.8,D
"""


def test_firms_ingest_endpoint_validation_error_missing_area(client):
    """
    Test that request without bbox or country_code returns 422 Unprocessable Entity.
    """
    response = client.post(
        "/api/v1/firms/ingest",
        json={
            "source": "VIIRS_SNPP_NRT",
            "day_range": 1
        },
        
    )
    assert response.status_code == 422


@patch("backend.app.services.firms.FIRMSService.fetch_raw_data", new_callable=AsyncMock)
def test_firms_ingest_endpoint_success_with_bbox(mock_fetch, client, ):
    """
    Test triggering FIRMS ingestion with a valid Bounding Box.
    """
    mock_fetch.return_value = SAMPLE_VIIRS_RESPONSE

    payload = {
        "source": "VIIRS_SNPP_NRT",
        "bbox": {
            "min_lon": 70.0,
            "min_lat": 20.0,
            "max_lon": 80.0,
            "max_lat": 30.0
        },
        "day_range": 1
    }

    response = client.post("/api/v1/firms/ingest", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["success", "partial"]
    assert data["source"] == "VIIRS_SNPP_NRT"
    assert data["total_received"] == 1
    assert data["valid_records"] == 1
    assert data["rejected_records"] == 0
    assert data["duplicate_records"] in [0, 1]


@patch("backend.app.services.firms.FIRMSService.fetch_raw_data", new_callable=AsyncMock)
def test_firms_ingest_endpoint_success_with_country(mock_fetch, client, ):
    """
    Test triggering FIRMS ingestion with a Country Code.
    """
    mock_fetch.return_value = SAMPLE_VIIRS_RESPONSE

    payload = {
        "source": "VIIRS_NOAA20_NRT",
        "country_code": "IND",
        "day_range": 2
    }

    response = client.post("/api/firms/ingest", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["success", "partial"]
    assert data["source"] == "VIIRS_NOAA20_NRT"
    assert data["valid_records"] == 1


@patch("backend.app.services.firms.FIRMSService.fetch_raw_data", new_callable=AsyncMock)
def test_firms_refresh_endpoint_success(mock_fetch, client, ):
    """
    Test triggering FIRMS live refresh safely configured.
    """
    mock_fetch.return_value = SAMPLE_VIIRS_RESPONSE
    response = client.post("/api/v1/firms/refresh")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["success", "partial"]
    assert "source" in data

def test_firms_refresh_endpoint_disabled(client):
    """
    Test refresh when disabled in config.
    """
    from backend.app.core.config import settings
    settings.LIVE_REFRESH_ENABLED = False
    response = client.post("/api/v1/firms/refresh")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "failed"
    assert data["details"]["error"] == "Live refresh is disabled in configuration."
    settings.LIVE_REFRESH_ENABLED = True

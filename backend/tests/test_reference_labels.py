import pytest
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
from backend.app.services.reference_labels import ReferenceMatchingService
from backend.app.models.thermal_event import ThermalEvent

def test_spatial_match():
    service = ReferenceMatchingService()
    # Mock some data
    df = pd.DataFrame({"lat": [10.005], "lon": [20.005], "OBJECTID": [1]})
    gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df.lon, df.lat))
    
    event_point = Point(20.0, 10.0)
    match = service._spatial_match(event_point, gdf, 0.01)
    
    assert match is not None
    assert match["OBJECTID"] == 1
    assert "match_distance_deg" in match

def test_match_event_unknown():
    service = ReferenceMatchingService()
    # By default, without loading real files, or if coordinates are far away
    event = ThermalEvent(latitude=0.0, longitude=0.0)
    result = service.match_event(event)
    
    assert result["source_label"] == "UNKNOWN"
    assert result["review_status"] == "NEEDS_REVIEW"

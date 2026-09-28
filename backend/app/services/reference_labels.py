import os
import json
import logging
from typing import Dict, Any, List, Optional
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
from sqlalchemy.orm import Session
from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.event_feature import EventFeature
from datetime import datetime

logger = logging.getLogger(__name__)

RAW_DIR = "ml/datasets/raw"
GIHS_PATH = os.path.join(RAW_DIR, "gihs/GIHS_2000_2023/GIHS_2000_2023.shp")
CROP1_PATH = os.path.join(RAW_DIR, "crop_burning/partially_completely_burnt_2020_11_10.geojson")
CROP2_PATH = os.path.join(RAW_DIR, "crop_burning/partially_completely_burnt_2021_10_29.geojson")
WILDFIRE_PATH = os.path.join(RAW_DIR, "wildfire/metadata_asia.csv")

class ReferenceMatchingService:
    def __init__(self):
        self.gihs_gdf = self._load_gihs()
        self.crop_gdf = self._load_crop()
        self.wildfire_gdf = self._load_wildfire()

    def _load_gihs(self) -> Optional[gpd.GeoDataFrame]:
        if not os.path.exists(GIHS_PATH):
            return None
        return gpd.read_file(GIHS_PATH)

    def _load_crop(self) -> Optional[gpd.GeoDataFrame]:
        if not os.path.exists(CROP1_PATH) or not os.path.exists(CROP2_PATH):
            return None
        g1 = gpd.read_file(CROP1_PATH)
        g1['burn_date'] = '2020-11-10'
        g2 = gpd.read_file(CROP2_PATH)
        g2['burn_date'] = '2021-10-29'
        return gpd.GeoDataFrame(pd.concat([g1, g2], ignore_index=True))

    def _load_wildfire(self) -> Optional[gpd.GeoDataFrame]:
        if not os.path.exists(WILDFIRE_PATH):
            return None
        df = pd.read_csv(WILDFIRE_PATH)
        lat_col = 'event_lat'
        lon_col = 'event_lon'
        if lat_col not in df.columns or lon_col not in df.columns:
            return None
        return gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df[lon_col], df[lat_col]), crs="EPSG:4326")

    def _spatial_match(self, event_point: Point, ref_gdf: gpd.GeoDataFrame, distance_deg: float) -> Optional[pd.Series]:
        if ref_gdf is None or ref_gdf.empty:
            return None
        
        event_gdf = gpd.GeoDataFrame([{'geometry': event_point}], crs="EPSG:4326")
        
        try:
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                joined = gpd.sjoin_nearest(event_gdf, ref_gdf, max_distance=distance_deg, distance_col="match_distance_deg")
            if not joined.empty:
                return joined.iloc[0].copy()
        except Exception:
            pass
            
        return None

    def match_event(self, event: ThermalEvent) -> Dict[str, Any]:
        """Matches event against all reference datasets. Uses a conservative distance of 0.01 deg (~1km)."""
        event_point = Point(event.longitude, event.latitude)
        
        # 1. GIHS Match (Industrial)
        gihs_match = self._spatial_match(event_point, self.gihs_gdf, distance_deg=0.01)
        if gihs_match is not None:
            return {
                "source_label": "INDUSTRIAL_HEAT_SOURCE_REFERENCE",
                "source": "GIHS",
                "source_record_id": str(gihs_match.get("OBJECTID", "Unknown")),
                "match_distance_m": float(gihs_match['match_distance_deg'] * 111000), # approx conversion
                "time_difference": None, # Persistent
                "confidence": "HIGH" if gihs_match['match_distance_deg'] < 0.005 else "LOW",
                "review_status": "AUTO_MATCHED"
            }
            
        # 2. Crop Burning Match (Agricultural)
        crop_match = self._spatial_match(event_point, self.crop_gdf, distance_deg=0.01)
        if crop_match is not None:
            # Time matching
            time_diff = None
            if 'burn_date' in crop_match:
                try:
                    burn_dt = pd.to_datetime(crop_match['burn_date']).tz_localize('UTC')
                    time_diff = abs((event.detected_at - burn_dt).total_seconds() / 86400.0)
                except:
                    pass
            
            # Require temporal proximity (e.g. within 10 days) for High confidence
            conf = "MEDIUM"
            if time_diff is not None and time_diff <= 10:
                conf = "HIGH"
                
            return {
                "source_label": "AGRICULTURAL_BURNING_REFERENCE",
                "source": "PUNJAB_CROP",
                "source_record_id": str(crop_match.get("id", "Unknown")),
                "match_distance_m": float(crop_match['match_distance_deg'] * 111000),
                "time_difference": time_diff, 
                "confidence": conf,
                "review_status": "AUTO_MATCHED"
            }
            
        # 3. Wildfire Match
        wf_match = self._spatial_match(event_point, self.wildfire_gdf, distance_deg=0.01)
        if wf_match is not None:
            time_diff = None
            if 'burn_date' in wf_match:
                try:
                    burn_dt = pd.to_datetime(wf_match['burn_date']).tz_localize('UTC')
                    time_diff = abs((event.detected_at - burn_dt).total_seconds() / 86400.0)
                except:
                    pass
                    
            conf = "MEDIUM"
            if time_diff is not None and time_diff <= 30:
                conf = "HIGH"
                
            return {
                "source_label": "WILDFIRE_REFERENCE",
                "source": "HF_WILDFIRE",
                "source_record_id": str(wf_match.name),
                "match_distance_m": float(wf_match['match_distance_deg'] * 111000),
                "time_difference": time_diff, 
                "confidence": conf,
                "review_status": "AUTO_MATCHED"
            }
            
        return {
            "source_label": "UNKNOWN",
            "source": "None",
            "source_record_id": None,
            "match_distance_m": None,
            "time_difference": None,
            "confidence": "NONE",
            "review_status": "NEEDS_REVIEW"
        }

    def generate_candidate_dataset(self, db: Session, output_dir: str = "ml/datasets"):
        os.makedirs(output_dir, exist_ok=True)
        events = db.query(ThermalEvent).join(EventFeature).all()
        
        dataset = []
        for event in events:
            feat = db.query(EventFeature).filter_by(thermal_event_id=event.id).first()
            match_info = self.match_event(event)
            
            row = {
                "event_id": event.id,
                "latitude": event.latitude,
                "longitude": event.longitude,
                "detected_at": event.detected_at,
                
                # Labels
                "candidate_label": match_info["source_label"],
                "label_source": match_info["source"],
                "source_record_id": match_info["source_record_id"],
                "match_distance_m": match_info["match_distance_m"],
                "label_confidence": match_info["confidence"],
                "review_status": match_info["review_status"],
                
                # Features
                "distance_to_facility_meters": feat.distance_to_facility_meters,
                "nearby_facility_count": feat.nearby_facility_count,
                "hotspot_frequency_30d": feat.hotspot_frequency_30d,
                "persistence_days": feat.persistence_days,
            }
            
            add_feats = feat.additional_features or {}
            if "firms" in add_feats:
                row["frp"] = add_feats["firms"].get("frp")
            if "worldcover" in add_feats:
                row["land_cover_at_event"] = add_feats["worldcover"].get("land_cover_at_event")
                
            dataset.append(row)
            
        df = pd.DataFrame(dataset)
        
        # Save Parquet + CSV
        df.to_parquet(os.path.join(output_dir, "candidate_training_dataset.parquet"))
        df.to_csv(os.path.join(output_dir, "candidate_training_dataset.csv"), index=False)
        
        # Create Ambiguous/Review dataset
        review_df = df[df["review_status"] == "NEEDS_REVIEW"]
        review_df.to_csv(os.path.join(output_dir, "review_dataset.csv"), index=False)
        
        return df

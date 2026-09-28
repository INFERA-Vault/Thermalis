import pandas as pd
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.event_feature import EventFeature
from shapely.geometry import Point
import geopandas as gpd
import json
import os

class LabelingService:
    def __init__(self):
        self.labels_dir = "data/processed"
        os.makedirs(self.labels_dir, exist_ok=True)
        self.reference_data_path = os.path.join(self.labels_dir, "reference_labels.csv")
        
    def load_reference_data(self) -> Optional[gpd.GeoDataFrame]:
        """Loads reference datasets (e.g., GIHS, Climate TRACE, VIIRS Nightfire flares)"""
        if not os.path.exists(self.reference_data_path):
            return None
            
        df = pd.read_csv(self.reference_data_path)
        # Expecting at minimum: lat, lon, label, source, confidence
        gdf = gpd.GeoDataFrame(
            df, geometry=gpd.points_from_xy(df.lon, df.lat), crs="EPSG:4326"
        )
        return gdf

    def match_event_to_reference(self, event: ThermalEvent, reference_gdf: gpd.GeoDataFrame, distance_deg: float = 0.01) -> Dict[str, Any]:
        """Matches a FIRMS event to the nearest reference point within distance_deg."""
        if reference_gdf is None or reference_gdf.empty:
            return {"label": "UNKNOWN", "confidence": 0.0, "source": "None"}
            
        event_point = Point(event.longitude, event.latitude)
        
        # Calculate distances
        distances = reference_gdf.geometry.distance(event_point)
        min_idx = distances.idxmin()
        min_dist = distances[min_idx]
        
        if min_dist <= distance_deg:
            matched_record = reference_gdf.loc[min_idx]
            return {
                "label": matched_record["label"],
                "confidence": matched_record.get("confidence", 1.0),
                "source": matched_record.get("source", "reference_match"),
                "distance_deg": float(min_dist)
            }
            
        return {"label": "UNKNOWN", "confidence": 0.0, "source": "No Match"}

    def generate_training_dataset(self, db: Session, output_path: str = "ml/datasets/training_data_v1.csv"):
        """Generates the training CSV with features and labels."""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        reference_gdf = self.load_reference_data()
        
        events = db.query(ThermalEvent).join(EventFeature).all()
        
        dataset = []
        for event in events:
            feature_record = db.query(EventFeature).filter_by(thermal_event_id=event.id).first()
            if not feature_record:
                continue
                
            match_info = self.match_event_to_reference(event, reference_gdf)
            
            # Combine all features
            row = {
                "event_id": event.id,
                "latitude": event.latitude,
                "longitude": event.longitude,
                "detected_at": event.detected_at,
                
                # Target
                "target_label": match_info["label"],
                "label_confidence": match_info["confidence"],
                "label_source": match_info["source"],
                
                # Features
                "distance_to_facility_meters": feature_record.distance_to_facility_meters,
                "nearby_facility_count": feature_record.nearby_facility_count,
                "hotspot_frequency_30d": feature_record.hotspot_frequency_30d,
                "persistence_days": feature_record.persistence_days,
            }
            
            # Unpack JSONB features
            additional = feature_record.additional_features or {}
            
            # FIRMS
            if "firms" in additional:
                row["frp"] = additional["firms"].get("frp")
                row["confidence"] = additional["firms"].get("confidence")
                row["is_day"] = additional["firms"].get("is_day")
                
            # WorldCover
            if "worldcover" in additional:
                wc = additional["worldcover"]
                row["land_cover_at_event"] = wc.get("land_cover_at_event")
                fractions = wc.get("fractions", {})
                for k, v in fractions.items():
                    row[k] = v
                    
            # Satellite (Sentinel) - If available
            if "satellite" in additional:
                sat = additional["satellite"]
                row["has_satellite_data"] = sat.get("has_s2") or sat.get("has_s1")
                row["cloud_cover_percent"] = sat.get("mean_cloud_cover")
            else:
                row["has_satellite_data"] = False
                row["cloud_cover_percent"] = None
                
            dataset.append(row)
            
        df = pd.DataFrame(dataset)
        df.to_csv(output_path, index=False)
        return df

import os
import pandas as pd
import logging
import math
from typing import List, Dict, Any
from backend.app.core.database import SessionLocal
from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.event_feature import EventFeature
from backend.app.services.reference_labels import ReferenceMatchingService
from backend.app.services.features import FeatureEngineeringService
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_geographic_group(lat: float, lon: float, resolution_deg: float = 0.5) -> str:
    """Group events into ~50km grid cells for spatial CV."""
    lat_g = math.floor(lat / resolution_deg) * resolution_deg
    lon_g = math.floor(lon / resolution_deg) * resolution_deg
    return f"{lat_g:.1f}_{lon_g:.1f}"

def run():
    db = SessionLocal()
    ref_svc = ReferenceMatchingService()
    feat_svc = FeatureEngineeringService(temporal_window_days=30, spatial_radius_meters=2000.0)
    
    logger.info("Matching events to reference data...")
    events = db.query(ThermalEvent).all()
    logger.info(f"Loaded {len(events)} events.")
    
    records = []
    
    # 1. Matching
    for event in events:
        match = ref_svc.match_event(event)
        
        # Categorize Target
        target_label = "UNKNOWN"
        tier = "UNKNOWN"
        
        if match["source_label"] == "INDUSTRIAL_HEAT_SOURCE_REFERENCE":
            target_label = 1
            tier = "TIER_A" if match["confidence"] == "HIGH" else "TIER_B"
        elif match["source_label"] in ["AGRICULTURAL_BURNING_REFERENCE", "WILDFIRE_REFERENCE"]:
            target_label = 0
            # We want high confidence (close in time and space)
            tier = "TIER_A" if match["confidence"] == "HIGH" else "TIER_B"
            
        if tier == "UNKNOWN":
            # For the dataset, we will keep UNKNOWN for review
            tier = "REVIEW"
            
        record = {
            "event_id": event.id,
            "detected_at": event.detected_at,
            "latitude": event.latitude,
            "longitude": event.longitude,
            "geographic_group": generate_geographic_group(event.latitude, event.longitude),
            "target_label": target_label,
            "source_label": match["source_label"],
            "label_source": match["source"],
            "source_record_id": match["source_record_id"],
            "match_distance_m": match["match_distance_m"],
            "time_difference": match["time_difference"],
            "confidence": match["confidence"],
            "review_status": match["review_status"],
            "tier": tier
        }
        records.append((event, record))
        
    # 2. Select Candidates
    # We want ALL TIER_A and TIER_B, plus a sample of REVIEW if we need to. Let's just output them all.
    logger.info(f"Total matched records: {len(records)}")
    
    df_meta = pd.DataFrame([r[1] for r in records])
    logger.info("Tiers count:\n" + str(df_meta['tier'].value_counts()))
    
    # Generate features ONLY for TIER_A and TIER_B (to save time, or we can just do all)
    # Actually, WorldCover is fast enough if we don't have too many, but for 20k events it'll take time.
    # Let's generate features for ALL Tier A and Tier B.
    
    labeled_records = [r for r in records if r[1]['tier'] in ['TIER_A', 'TIER_B']]
    logger.info(f"Generating features for {len(labeled_records)} labeled records...")
    
    final_rows = []
    
    for event, meta in labeled_records:
        feat = db.query(EventFeature).filter_by(thermal_event_id=event.id).first()
        if not feat:
            try:
                feat = feat_svc.generate_features_for_event(event.id, db)
            except Exception as e:
                logger.error(f"Feature generation failed for {event.id}: {e}")
                continue
                
        # Flatten features
        row = meta.copy()
        row["distance_to_facility_meters"] = feat.distance_to_facility_meters
        row["nearby_facility_count"] = feat.nearby_facility_count
        row["hotspot_frequency_30d"] = feat.hotspot_frequency_30d
        row["persistence_days"] = feat.persistence_days
        
        # Flatten additional
        if feat.additional_features:
            add = feat.additional_features
            # FIRMS
            firms = add.get("firms", {})
            row["frp"] = firms.get("frp")
            row["brightness_temperature"] = firms.get("brightness_temperature")
            row["day_night"] = firms.get("day_night")
            # OSM
            osm = add.get("osm", {})
            row["nearest_facility_type"] = osm.get("nearest_facility_type")
            # WorldCover
            wc = add.get("worldcover", {})
            row["land_cover_at_event"] = wc.get("land_cover_at_event")
            row["is_built_up"] = 1 if wc.get("land_cover_at_event") == 50 else 0
            
            # Temporal
            temp = add.get("temporal", {})
            row["recurrence_rate"] = temp.get("recurrence_rate")
            
        final_rows.append(row)
        
    df_final = pd.DataFrame(final_rows)
    
    # 3. Leakage Audit
    logger.info("Running Leakage Audit...")
    if len(df_final) > 0:
        # Check if any ID overlaps
        dups = df_final['event_id'].duplicated().sum()
        logger.info(f"Duplicate events: {dups}")
        
        # Ensure no label columns are pretending to be features
        feature_cols = [c for c in df_final.columns if c not in meta.keys()]
        logger.info(f"Feature columns extracted: {feature_cols}")
        
        # Sparsity
        missing = df_final[feature_cols].isnull().sum()
        logger.info(f"Missing Values in Features:\n{missing}")
        
    # 4. Export
    os.makedirs("ml/datasets", exist_ok=True)
    df_final.to_csv("ml/datasets/candidate_training_dataset.csv", index=False)
    df_final.to_parquet("ml/datasets/candidate_training_dataset.parquet", index=False)
    
    # Also save the raw matches for review
    df_meta.to_csv("ml/datasets/review_dataset.csv", index=False)
    
    logger.info("Done. Dataset ready.")

if __name__ == "__main__":
    run()

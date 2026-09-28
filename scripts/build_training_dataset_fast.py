import os
import pandas as pd
import geopandas as gpd
import logging
import math
import warnings
from backend.app.core.database import SessionLocal
from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.event_feature import EventFeature
from backend.app.services.features import FeatureEngineeringService
from backend.app.services.reference_labels import ReferenceMatchingService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_geographic_group(lat: float, lon: float, resolution_deg: float = 0.5) -> str:
    lat_g = math.floor(lat / resolution_deg) * resolution_deg
    lon_g = math.floor(lon / resolution_deg) * resolution_deg
    return f"{lat_g:.1f}_{lon_g:.1f}"

def run():
    db = SessionLocal()
    ref_svc = ReferenceMatchingService()
    feat_svc = FeatureEngineeringService(temporal_window_days=30, spatial_radius_meters=2000.0)
    
    events = db.query(ThermalEvent).all()
    logger.info(f"Loaded {len(events)} events.")
    if not events: return
    
    # 1. Vectorized Match
    event_dicts = [{
        "event_id": e.id,
        "latitude": e.latitude,
        "longitude": e.longitude,
        "detected_at": pd.to_datetime(e.detected_at).tz_convert('UTC'),
        "event": e
    } for e in events]
    
    events_df = pd.DataFrame(event_dicts)
    events_gdf = gpd.GeoDataFrame(
        events_df, 
        geometry=gpd.points_from_xy(events_df.longitude, events_df.latitude),
        crs="EPSG:4326"
    )
    
    results = []
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        
        # Match GIHS
        if ref_svc.gihs_gdf is not None:
            gihs_joined = gpd.sjoin_nearest(events_gdf, ref_svc.gihs_gdf, max_distance=0.01, distance_col="match_distance_deg")
        else: gihs_joined = pd.DataFrame()
            
        # Match Crop
        if ref_svc.crop_gdf is not None:
            crop_joined = gpd.sjoin_nearest(events_gdf, ref_svc.crop_gdf, max_distance=0.01, distance_col="match_distance_deg")
        else: crop_joined = pd.DataFrame()
            
        # Match Wildfire
        if ref_svc.wildfire_gdf is not None:
            wf_joined = gpd.sjoin_nearest(events_gdf, ref_svc.wildfire_gdf, max_distance=0.01, distance_col="match_distance_deg")
        else: wf_joined = pd.DataFrame()

    for idx, row in events_gdf.iterrows():
        matched = False
        
        # Check GIHS
        if not gihs_joined.empty and idx in gihs_joined.index:
            match = gihs_joined.loc[idx]
            if isinstance(match, pd.DataFrame): match = match.iloc[0] # handle multiple
            results.append({
                "event_id": row.event_id,
                "event": row.event,
                "geographic_group": generate_geographic_group(row.latitude, row.longitude),
                "target_label": 1,
                "source_label": "INDUSTRIAL_HEAT_SOURCE_REFERENCE",
                "label_source": "GIHS",
                "source_record_id": str(match.get("OBJECTID", "Unknown")),
                "match_distance_m": match.match_distance_deg * 111000,
                "time_difference": None,
                "confidence": "HIGH" if match.match_distance_deg < 0.005 else "LOW",
                "review_status": "AUTO_MATCHED",
                "tier": "TIER_A" if match.match_distance_deg < 0.005 else "TIER_B"
            })
            matched = True
            continue
            
        # Check Crop
        if not crop_joined.empty and idx in crop_joined.index:
            match = crop_joined.loc[idx]
            if isinstance(match, pd.DataFrame): match = match.iloc[0]
            time_diff = None
            if 'burn_date' in match:
                try:
                    burn_dt = pd.to_datetime(match['burn_date']).tz_localize('UTC')
                    time_diff = abs((row.detected_at - burn_dt).total_seconds() / 86400.0)
                except: pass
                
            conf = "MEDIUM"
            if time_diff is not None and time_diff <= 10: conf = "HIGH"
            
            results.append({
                "event_id": row.event_id,
                "event": row.event,
                "geographic_group": generate_geographic_group(row.latitude, row.longitude),
                "target_label": 0,
                "source_label": "AGRICULTURAL_BURNING_REFERENCE",
                "label_source": "PUNJAB_CROP",
                "source_record_id": str(match.get("id", "Unknown")),
                "match_distance_m": match.match_distance_deg * 111000,
                "time_difference": time_diff,
                "confidence": conf,
                "review_status": "AUTO_MATCHED",
                "tier": "TIER_A" if conf == "HIGH" else "TIER_B"
            })
            matched = True
            continue
            
        # Check Wildfire
        if not wf_joined.empty and idx in wf_joined.index:
            match = wf_joined.loc[idx]
            if isinstance(match, pd.DataFrame): match = match.iloc[0]
            time_diff = None
            if 'burn_date' in match:
                try:
                    burn_dt = pd.to_datetime(match['burn_date']).tz_localize('UTC')
                    time_diff = abs((row.detected_at - burn_dt).total_seconds() / 86400.0)
                except: pass
                
            conf = "MEDIUM"
            if time_diff is not None and time_diff <= 30: conf = "HIGH"
            
            results.append({
                "event_id": row.event_id,
                "event": row.event,
                "geographic_group": generate_geographic_group(row.latitude, row.longitude),
                "target_label": 0,
                "source_label": "WILDFIRE_REFERENCE",
                "label_source": "HF_WILDFIRE",
                "source_record_id": str(match.name),
                "match_distance_m": match.match_distance_deg * 111000,
                "time_difference": time_diff,
                "confidence": conf,
                "review_status": "AUTO_MATCHED",
                "tier": "TIER_A" if conf == "HIGH" else "TIER_B"
            })
            matched = True
            continue
            
        if not matched:
            results.append({
                "event_id": row.event_id,
                "event": row.event,
                "geographic_group": generate_geographic_group(row.latitude, row.longitude),
                "target_label": "UNKNOWN",
                "source_label": "UNKNOWN",
                "label_source": "None",
                "source_record_id": None,
                "match_distance_m": None,
                "time_difference": None,
                "confidence": "NONE",
                "review_status": "NEEDS_REVIEW",
                "tier": "REVIEW"
            })

    df_meta = pd.DataFrame(results)
    logger.info("Tiers count:\n" + str(df_meta['tier'].value_counts()))
    
    labeled = [r for r in results if r['tier'] in ['TIER_A', 'TIER_B']]
    logger.info(f"Generating features for {len(labeled)} labeled records...")
    
    final_rows = []
    
    for r in labeled:
        event = r.pop('event')
        feat = db.query(EventFeature).filter_by(thermal_event_id=event.id).first()
        if not feat:
            try:
                feat = feat_svc.generate_features_for_event(event.id, db)
            except Exception as e:
                logger.error(f"Feature gen failed for {event.id}: {e}")
                continue
                
        r["distance_to_facility_meters"] = feat.distance_to_facility_meters
        r["nearby_facility_count"] = feat.nearby_facility_count
        r["hotspot_frequency_30d"] = feat.hotspot_frequency_30d
        r["persistence_days"] = feat.persistence_days
        
        if feat.additional_features:
            add = feat.additional_features
            firms = add.get("firms", {})
            r["frp"] = firms.get("frp")
            r["brightness_temperature"] = firms.get("brightness_temperature")
            r["day_night"] = firms.get("day_night")
            osm = add.get("osm", {})
            r["nearest_facility_type"] = osm.get("nearest_facility_type")
            wc = add.get("worldcover", {})
            r["land_cover_at_event"] = wc.get("land_cover_at_event")
            r["is_built_up"] = 1 if wc.get("land_cover_at_event") == 50 else 0
            temp = add.get("temporal", {})
            r["recurrence_rate"] = temp.get("recurrence_rate")
            
        final_rows.append(r)
        
    df_final = pd.DataFrame(final_rows)
    
    logger.info("Running Leakage Audit...")
    if len(df_final) > 0:
        dups = df_final['event_id'].duplicated().sum()
        logger.info(f"Duplicate events: {dups}")
        feature_cols = [c for c in df_final.columns if c not in df_meta.columns and c != "event"]
        logger.info(f"Feature columns extracted: {feature_cols}")
        missing = df_final[feature_cols].isnull().sum()
        logger.info(f"Missing Values in Features:\n{missing}")
        
    os.makedirs("ml/datasets", exist_ok=True)
    df_final.to_csv("ml/datasets/candidate_training_dataset.csv", index=False)
    df_final.to_parquet("ml/datasets/candidate_training_dataset.parquet", index=False)
    
    for r in results:
        if 'event' in r: del r['event']
    pd.DataFrame(results).to_csv("ml/datasets/review_dataset.csv", index=False)
    logger.info("Done.")

if __name__ == "__main__":
    run()

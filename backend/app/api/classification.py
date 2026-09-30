from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any
import json
import os
import joblib
import pandas as pd
import numpy as np

from backend.app.core.database import get_db
from backend.app.models.thermal_event import ThermalEvent
from backend.app.services.features import FeatureEngineeringService


router = APIRouter()

# Global model cache
model_cache = {}

def get_model():
    if 'clf' not in model_cache:
        model_path = 'ml/models/model_a_calibrated.joblib'
        meta_path = 'ml/models/model_a_metadata.json'
        
        if not os.path.exists(model_path) or not os.path.exists(meta_path):
            raise HTTPException(status_code=503, detail="Model A not yet trained or deployed.")
            
        clf_model = joblib.load(model_path)
        
        with open(meta_path, 'r') as f:
            metadata = json.load(f)
            
        model_cache['clf'] = clf_model
        model_cache['meta'] = metadata
        
    return model_cache['clf'], model_cache['meta']


def get_multiclass_model():
    """Load Model B only when a validated three-way artifact exists."""
    if 'multiclass_clf' not in model_cache:
        model_path = 'ml/models/model_b_multiclass_calibrated.joblib'
        meta_path = 'ml/models/model_b_multiclass_metadata.json'

        if not os.path.exists(model_path) or not os.path.exists(meta_path):
            raise HTTPException(
                status_code=503,
                detail=(
                    "Three-way source classifier is not deployed. Build event-level "
                    "industrial, agricultural, and wildfire reference labels first."
                ),
            )

        model_cache['multiclass_clf'] = joblib.load(model_path)
        with open(meta_path, 'r') as f:
            model_cache['multiclass_meta'] = json.load(f)

    return model_cache['multiclass_clf'], model_cache['multiclass_meta']


@router.post("/predict/{event_id}", response_model=Dict[str, Any])
def predict_event_class(
    event_id: int, 
    db: Session = Depends(get_db)
):
    """
    Predicts whether a thermal event matches a GIHS industrial heat source or 
    agricultural burning reference.
    
    This does NOT classify general industrial fires.
    """
    model, meta = get_model()
    
    # 1. Fetch feature vector
    feat_svc = FeatureEngineeringService()
    try:
        feature_record = feat_svc.generate_features_for_event(event_id, db)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Failed to generate features for {event_id}: {e}")
        
    if feature_record is None:
        raise HTTPException(status_code=404, detail=f"Feature generation failed for {event_id}")

    # Map features exactly as defined in the training metadata
    required_features = meta['feature_list']
    
    raw_dict = {
        "distance_to_facility_meters": feature_record.distance_to_facility_meters,
        "nearby_facility_count": feature_record.nearby_facility_count,
        "hotspot_frequency_30d": feature_record.hotspot_frequency_30d,
        "persistence_days": feature_record.persistence_days,
    }
    
    if feature_record.additional_features:
        add = feature_record.additional_features
        firms = add.get("firms", {})
        raw_dict["frp"] = firms.get("frp")
        raw_dict["brightness_temperature"] = firms.get("brightness_temperature")
        raw_dict["day_night"] = firms.get("day_night")
        osm = add.get("osm", {})
        raw_dict["nearest_facility_type"] = osm.get("nearest_facility_type")
        wc = add.get("worldcover", {})
        raw_dict["land_cover_at_event"] = wc.get("land_cover_at_event")
        raw_dict["is_built_up"] = 1 if wc.get("land_cover_at_event") == 50 else 0
        temp = add.get("temporal", {})
        raw_dict["recurrence_rate"] = temp.get("recurrence_rate")
        
    df_pred = pd.DataFrame([raw_dict])
    
    # Filter to exact feature list
    for f in required_features:
        if f not in df_pred.columns:
            df_pred[f] = np.nan
            
    df_pred = df_pred[required_features]
    
    if 'day_night' in df_pred.columns:
        df_pred['day_night'] = df_pred['day_night'].astype('category')
    
    try:
        prob = float(model.predict_proba(df_pred)[0][1])
        pred = int(model.predict(df_pred)[0])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model prediction failed: {e}")
        
    return {
        "event_id": event_id,
        "predicted_class": pred,
        "prediction_label": "INDUSTRIAL_HEAT_SOURCE_ASSOCIATION" if pred == 1 else "AGRICULTURAL_BURNING_REFERENCE",
        "model_probability": prob,
        "model_version": meta.get('training_timestamp', 'Unknown'),
        "feature_list": required_features,
        "disclaimer": "This model distinguishes GIHS-associated industrial heat-source reference events from agricultural-burning reference events. It is not a validated general industrial-fire detector."
    }


@router.post("/predict-source/{event_id}", response_model=Dict[str, Any])
def predict_event_source_class(event_id: int, db: Session = Depends(get_db)):
    """Predict industrial, agricultural, or wildfire/natural reference class.

    This endpoint fails closed until Model B has been trained on all three
    event-level reference classes. TCEF remains available for transparent
    operational triage while that evidence gap is being closed.
    """
    model, meta = get_multiclass_model()
    event = db.query(ThermalEvent).filter_by(id=event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Thermal event not found")

    try:
        feature_record = FeatureEngineeringService().generate_features_for_event(event_id, db)
        required_features = meta['feature_list']
        raw_dict = {
            "distance_to_facility_meters": feature_record.distance_to_facility_meters,
            "nearby_facility_count": feature_record.nearby_facility_count,
            "hotspot_frequency_30d": feature_record.hotspot_frequency_30d,
            "persistence_days": feature_record.persistence_days,
        }
        add = feature_record.additional_features or {}
        firms = add.get("firms", {})
        raw_dict.update({
            "frp": firms.get("frp"),
            "brightness_temperature": firms.get("brightness_temperature"),
            "day_night": firms.get("day_night"),
        })
        osm = add.get("osm", {})
        raw_dict["nearest_facility_type"] = osm.get("nearest_facility_type")
        wc = add.get("worldcover", {})
        raw_dict["land_cover_at_event"] = wc.get("land_cover_at_event")
        raw_dict["is_built_up"] = 1 if wc.get("land_cover_at_event") == 50 else 0
        raw_dict["recurrence_rate"] = (add.get("temporal", {}) or {}).get("recurrence_rate")

        df_pred = pd.DataFrame([raw_dict])
        for feature in required_features:
            if feature not in df_pred.columns:
                df_pred[feature] = np.nan
        df_pred = df_pred[required_features]
        if 'day_night' in df_pred.columns:
            df_pred['day_night'] = df_pred['day_night'].astype('category')

        probabilities = model.predict_proba(df_pred)[0]
        predicted_class = int(model.predict(df_pred)[0])
        class_mapping = meta.get('class_mapping', {})
        return {
            "event_id": event_id,
            "predicted_class": predicted_class,
            "prediction_label": class_mapping.get(str(predicted_class), str(predicted_class)),
            "class_probabilities": {
                class_mapping.get(str(index), str(index)): float(probability)
                for index, probability in enumerate(probabilities)
            },
            "model_version": meta.get('training_timestamp', 'Model B'),
            "feature_list": required_features,
            "disclaimer": "Reference-class prediction only. This is not autonomous confirmation of an industrial fire or wildfire.",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Three-way source prediction failed: {exc}") from exc


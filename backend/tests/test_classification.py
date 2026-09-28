import pytest
from backend.app.api.classification import get_model
import os

def test_model_loading():
    """Verify the model loads successfully from disk"""
    model_path = 'ml/models/model_a_xgboost.json'
    meta_path = 'ml/models/model_a_metadata.json'
    
    assert os.path.exists(model_path), "Model JSON file is missing."
    assert os.path.exists(meta_path), "Metadata JSON file is missing."
    
    # Check cache loading
    xgb_model, meta = get_model()
    
    assert xgb_model is not None
    assert meta is not None
    assert 'feature_list' in meta
    assert len(meta['feature_list']) > 0

def test_classification_api_invalid_event(client):
    """Test API behavior for a non-existent event"""
    response = client.post("/api/v1/classification/predict/999999")
    assert response.status_code == 404
    assert "Failed to generate features" in response.json()["detail"] or "Feature generation failed" in response.json()["detail"]

def test_classification_api_valid_event(client):
    """Test API behavior for a real event (using a known ID if possible, else we just test structure)"""
    # Grab the first thermal event from the db for testing
    from backend.app.core.database import SessionLocal
    from backend.app.models.thermal_event import ThermalEvent
    
    db = SessionLocal()
    event = db.query(ThermalEvent).first()
    db.close()
    
    if not event:
        pytest.skip("No thermal events in database to test classification.")
        
    response = client.post(f"/api/v1/classification/predict/{event.id}")
    assert response.status_code == 200
    
    data = response.json()
    assert "predicted_class" in data
    assert data["predicted_class"] in [0, 1]
    
    assert "prediction_label" in data
    assert data["prediction_label"] in ["INDUSTRIAL_HEAT_SOURCE_ASSOCIATION", "AGRICULTURAL_BURNING_REFERENCE"]
    
    assert "model_probability" in data
    prob = data["model_probability"]
    assert 0.0 <= prob <= 1.0, f"Probability out of range: {prob}"
    
    assert "feature_list" in data
    assert len(data["feature_list"]) > 0
    assert "model_version" in data
    assert "disclaimer" in data
    assert "GIHS-associated" in data["disclaimer"]

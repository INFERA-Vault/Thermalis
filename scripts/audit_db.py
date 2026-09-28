import json
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.app.core.database import SessionLocal
from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.industrial_facility import IndustrialFacility
from backend.app.models.association import ThermalEventFacilityAssociation
from backend.app.models.event_feature import EventFeature
from backend.app.models.satellite_observation import SatelliteObservation

def audit():
    db = SessionLocal()
    
    counts = {
        "thermal_events": db.query(ThermalEvent).count(),
        "industrial_facilities": db.query(IndustrialFacility).count(),
        "associations": db.query(ThermalEventFacilityAssociation).count(),
        "satellite_observations": db.query(SatelliteObservation).count(),
        "event_features": db.query(EventFeature).count(),
        "orphan_associations": db.query(ThermalEventFacilityAssociation).filter(~ThermalEventFacilityAssociation.thermal_event_id.in_(db.query(ThermalEvent.id))).count(),
        "s1_obs": db.query(SatelliteObservation).filter(SatelliteObservation.instrument == "SENTINEL-1").count(),
        "s2_obs": db.query(SatelliteObservation).filter(SatelliteObservation.instrument == "SENTINEL-2").count(),
        "s_obs_events": db.query(SatelliteObservation.thermal_event_id).distinct().count()
    }
    
    # Trace 5 events
    events = db.query(ThermalEvent).limit(5).all()
    lineage = []
    for e in events:
        assoc = db.query(ThermalEventFacilityAssociation).filter_by(thermal_event_id=e.id).all()
        feat = db.query(EventFeature).filter_by(thermal_event_id=e.id).first()
        sats = db.query(SatelliteObservation).filter_by(thermal_event_id=e.id).all()
        
        has_worldcover = False
        has_firms = False
        if feat and feat.additional_features:
            has_worldcover = "worldcover" in feat.additional_features
            has_firms = "firms" in feat.additional_features
            
        lineage.append({
            "id": e.id,
            "has_assoc": len(assoc) > 0,
            "has_feat": feat is not None,
            "has_sat": len(sats) > 0,
            "has_worldcover": has_worldcover,
            "has_firms": has_firms,
            "persistence_days": feat.persistence_days if feat else None
        })
        
    print(json.dumps({"counts": counts, "lineage": lineage}, indent=2, default=str))

if __name__ == "__main__":
    audit()

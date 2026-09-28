"""
Feature Engineering Service.
Aggregates FIRMS, OSM, and Satellite data into consolidated feature sets.
"""

from typing import Dict, Any, List, Optional
from datetime import timedelta
import math
from sqlalchemy.orm import Session
from sqlalchemy import func
from geoalchemy2.functions import ST_Distance, ST_DWithin

from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.association import ThermalEventFacilityAssociation
from backend.app.models.industrial_facility import IndustrialFacility
from backend.app.models.satellite_observation import SatelliteObservation
from backend.app.models.event_feature import EventFeature

class FeatureEngineeringService:
    def __init__(self, temporal_window_days: int = 30, spatial_radius_meters: float = 2000.0):
        self.temporal_window = temporal_window_days
        self.spatial_radius = spatial_radius_meters

    def _get_firms_features(self, event: ThermalEvent) -> Dict[str, Any]:
        """Extracts FIRMS-specific features."""
        return {
            "brightness_temperature": event.brightness_temperature,
            "frp": event.frp,
            "confidence": event.confidence,
            "day_night": "D" if 6 <= event.detected_at.hour <= 18 else "N", # Approximation if exact field missing
            "satellite": event.satellite,
            "acquisition_hour": event.detected_at.hour
        }

    def _get_temporal_features(self, event: ThermalEvent, db: Session) -> Dict[str, Any]:
        """Calculates temporal persistence features by grouping nearby FIRMS events."""
        # Find all events within spatial radius and temporal window BEFORE this event
        start_date = event.detected_at - timedelta(days=self.temporal_window)
        
        from geoalchemy2.types import Geography
        from sqlalchemy import cast
        
        # Spatial grouping using PostGIS
        nearby_events = db.query(ThermalEvent).filter(
            func.ST_DWithin(
                cast(ThermalEvent.geometry, Geography),
                cast(func.ST_SetSRID(func.ST_MakePoint(event.longitude, event.latitude), 4326), Geography),
                self.spatial_radius
            ),
            ThermalEvent.detected_at >= start_date,
            ThermalEvent.detected_at <= event.detected_at
        ).order_by(ThermalEvent.detected_at).all()
        
        obs_count = len(nearby_events)
        if obs_count == 0:
            return {}
            
        first_seen = nearby_events[0].detected_at
        last_seen = nearby_events[-1].detected_at
        persistence_duration = (last_seen - first_seen).total_seconds() / 86400.0
        
        active_days_set = {e.detected_at.date() for e in nearby_events}
        active_days = len(active_days_set)
        
        recurrence_rate = obs_count / (self.temporal_window if self.temporal_window > 0 else 1)
        
        return {
            "observation_count": obs_count,
            "active_days": active_days,
            "first_seen": first_seen.isoformat(),
            "last_seen": last_seen.isoformat(),
            "persistence_duration_days": persistence_duration,
            "recurrence_rate": recurrence_rate
        }

    def _get_osm_features(self, event: ThermalEvent, db: Session) -> Dict[str, Any]:
        """Calculates OSM contextual features."""
        assocs = db.query(ThermalEventFacilityAssociation, IndustrialFacility).join(
            IndustrialFacility
        ).filter(
            ThermalEventFacilityAssociation.thermal_event_id == event.id
        ).all()
        
        features = {
            "nearest_facility_distance": None,
            "nearby_industrial_facility_count": len(assocs),
            "nearest_facility_type": None,
            "categories": []
        }
        
        if not assocs:
            return features
            
        # Find nearest
        min_dist = float('inf')
        nearest_type = None
        
        for assoc, facility in assocs:
            features["categories"].append(facility.facility_type)
            if assoc.distance_meters is not None and assoc.distance_meters < min_dist:
                min_dist = assoc.distance_meters
                nearest_type = facility.facility_type
                
        if min_dist != float('inf'):
            features["nearest_facility_distance"] = min_dist
            features["nearest_facility_type"] = nearest_type
            
        features["categories"] = list(set(features["categories"]))
        return features

    def _get_satellite_features(self, event: ThermalEvent, db: Session) -> Dict[str, Any]:
        """Extracts purely factual satellite metadata (no fabrication of ML values)."""
        obs = db.query(SatelliteObservation).filter_by(thermal_event_id=event.id).all()
        
        features = {
            "sentinel2_observations": 0,
            "sentinel1_observations": 0,
            "avg_cloud_cover": None,
            "s1_polarizations": []
        }
        
        cloud_covers = []
        for o in obs:
            if o.satellite == "Sentinel-2":
                features["sentinel2_observations"] += 1
                if o.cloud_coverage is not None:
                    cloud_covers.append(o.cloud_coverage)
            elif o.satellite == "Sentinel-1":
                features["sentinel1_observations"] += 1
                if o.extra_metadata and "polarizations" in o.extra_metadata:
                    features["s1_polarizations"].extend(o.extra_metadata["polarizations"])
                    
        if cloud_covers:
            features["avg_cloud_cover"] = sum(cloud_covers) / len(cloud_covers)
            
        features["s1_polarizations"] = list(set(features["s1_polarizations"]))
        return features

    def _get_worldcover_features(self, event: ThermalEvent) -> Dict[str, Any]:
        from backend.app.services.worldcover import worldcover_service
        return worldcover_service.extract_features(event.latitude, event.longitude)

    def generate_features_for_event(self, thermal_event_id: int, db: Session, force_update: bool = False) -> EventFeature:
        """Generates all features for a single thermal event and persists to DB."""
        event = db.query(ThermalEvent).filter_by(id=thermal_event_id).first()
        if not event:
            raise ValueError(f"ThermalEvent {thermal_event_id} not found")
            
        firms_feats = self._get_firms_features(event)
        temp_feats = self._get_temporal_features(event, db)
        osm_feats = self._get_osm_features(event, db)
        sat_feats = self._get_satellite_features(event, db)
        wc_feats = self._get_worldcover_features(event)
        
        # Combine additional features
        additional = {
            "firms": firms_feats,
            "temporal": temp_feats,
            "osm": osm_feats,
            "satellite": sat_feats,
            "worldcover": wc_feats
        }
        
        # Update or Create EventFeature
        feature_record = db.query(EventFeature).filter_by(thermal_event_id=event.id).first()
        if not feature_record:
            feature_record = EventFeature(thermal_event_id=event.id)
            db.add(feature_record)
            
        # Map core columns
        feature_record.distance_to_facility_meters = osm_feats.get("nearest_facility_distance")
        feature_record.nearby_facility_count = osm_feats.get("nearby_industrial_facility_count")
        feature_record.hotspot_frequency_30d = temp_feats.get("observation_count")
        feature_record.persistence_days = temp_feats.get("persistence_duration_days")
        feature_record.additional_features = additional
        
        db.commit()
        db.refresh(feature_record)
        return feature_record

    def generate_features_batch(self, limit: int, db: Session, force_update: bool = False) -> int:
        """Generates features for recent events missing them, or all if forced."""
        query = db.query(ThermalEvent)
        if not force_update:
            query = query.outerjoin(
                EventFeature, ThermalEvent.id == EventFeature.thermal_event_id
            ).filter(
                EventFeature.id.is_(None)
            )
            
        missing_events = query.limit(limit).all()
        
        count = 0
        for event in missing_events:
            self.generate_features_for_event(event.id, db, force_update)
            count += 1
            
        return count

"""
Tests for SQLAlchemy Models, PostGIS configuration, and Alembic metadata registration.
"""

import pytest
from sqlalchemy import inspect
from geoalchemy2 import Geometry

from backend.app.core.database import Base
from backend.app.models import (
    ThermalEvent,
    IndustrialFacility,
    ThermalEventFacilityAssociation,
    SatelliteObservation,
    EventFeature,
    Classification,
    RiskAssessment,
)


def test_models_registered_in_metadata():
    """
    Verify all 7 core entities are registered in SQLAlchemy Base.metadata.
    """
    expected_tables = {
        "thermal_events",
        "industrial_facilities",
        "thermal_event_facility_associations",
        "satellite_observations",
        "event_features",
        "classifications",
        "risk_assessments",
    }
    registered_tables = set(Base.metadata.tables.keys())
    for table_name in expected_tables:
        assert table_name in registered_tables, f"Table {table_name} missing from Base.metadata"


def test_thermal_event_model_structure():
    """
    Verify ThermalEvent columns, spatial geometry configuration, and relationships.
    """
    mapper = inspect(ThermalEvent)
    column_names = set(mapper.columns.keys())
    expected_columns = {
        "id", "source", "source_event_id", "detected_at",
        "latitude", "longitude", "geometry",
        "brightness_temperature", "frp", "confidence", "satellite", "created_at"
    }
    assert expected_columns.issubset(column_names)

    # Validate PostGIS Geometry config
    geom_col = mapper.columns["geometry"]
    assert isinstance(geom_col.type, Geometry)
    assert geom_col.type.geometry_type == "POINT"
    assert geom_col.type.srid == 4326

    # Validate Relationships
    relationships = {rel.key for rel in mapper.relationships}
    expected_relationships = {
        "facility_associations", "satellite_observations", "features",
        "classifications", "risk_assessments"
    }
    assert expected_relationships.issubset(relationships)


def test_industrial_facility_model_structure():
    """
    Verify IndustrialFacility columns, spatial geometry configuration, and relationships.
    """
    mapper = inspect(IndustrialFacility)
    column_names = set(mapper.columns.keys())
    expected_columns = {
        "id", "source", "source_id", "name", "facility_type",
        "geometry", "properties", "created_at", "updated_at"
    }
    assert expected_columns.issubset(column_names)

    # Validate PostGIS Geometry config
    geom_col = mapper.columns["geometry"]
    assert isinstance(geom_col.type, Geometry)
    assert geom_col.type.geometry_type == "GEOMETRY"
    assert geom_col.type.srid == 4326


def test_thermal_event_facility_association():
    """
    Verify N:M association model foreign keys and relationship targets.
    """
    mapper = inspect(ThermalEventFacilityAssociation)
    relationships = {rel.key: rel.target.name for rel in mapper.relationships}
    assert relationships.get("thermal_event") == "thermal_events"
    assert relationships.get("facility") == "industrial_facilities"


def test_event_feature_relationship():
    """
    Verify EventFeature model has 1:1 relationship with ThermalEvent.
    """
    mapper = inspect(EventFeature)
    relationships = {rel.key: rel.target.name for rel in mapper.relationships}
    assert relationships.get("thermal_event") == "thermal_events"


def test_classification_and_risk_models():
    """
    Verify Classification and RiskAssessment entities.
    """
    class_mapper = inspect(Classification)
    risk_mapper = inspect(RiskAssessment)
    
    assert "predicted_class" in set(class_mapper.columns.keys())
    assert "confidence" in set(class_mapper.columns.keys())
    
    assert "risk_score" in set(risk_mapper.columns.keys())
    assert "risk_level" in set(risk_mapper.columns.keys())

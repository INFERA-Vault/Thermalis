"""
SQLAlchemy ORM Data Models Package.
All application database entities are exposed here for metadata registration.
"""

from backend.app.core.database import Base
from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.industrial_facility import IndustrialFacility
from backend.app.models.association import ThermalEventFacilityAssociation
from backend.app.models.satellite_observation import SatelliteObservation
from backend.app.models.event_feature import EventFeature
from backend.app.models.classification import Classification
from backend.app.models.risk_assessment import RiskAssessment
from backend.app.models.alert import Alert
from backend.app.models.emergency import AlertDispatch, EmergencyRecipient

__all__ = [
    "Base",
    "ThermalEvent",
    "IndustrialFacility",
    "ThermalEventFacilityAssociation",
    "SatelliteObservation",
    "EventFeature",
    "Classification",
    "RiskAssessment",
    "Alert",
    "EmergencyRecipient",
    "AlertDispatch",
]

"""
Central API Router uniting all modular endpoint routers.
"""

from fastapi import APIRouter
from backend.app.api.health import router as health_router
from backend.app.api.firms import router as firms_router

from backend.app.api.osm import router as osm_router
from backend.app.api.satellite import router as satellite_router
from backend.app.api.features import router as features_router
from backend.app.api.worldcover import router as worldcover_router
api_router = APIRouter()


# Health check endpoints
api_router.include_router(health_router, tags=["Health"])

# NASA FIRMS Ingestion endpoints
api_router.include_router(firms_router, prefix="/firms", tags=["FIRMS Ingestion"])

# OpenStreetMap Integration
api_router.include_router(osm_router, prefix="/osm", tags=["OpenStreetMap"])

# Satellite Observations
api_router.include_router(satellite_router, prefix="/satellite", tags=["Satellite Processing"])

# Feature Engineering
api_router.include_router(features_router, prefix="/features", tags=["Feature Engineering"])

# WorldCover Data
api_router.include_router(worldcover_router, prefix="/worldcover", tags=["WorldCover"])

# Future Phase Modules will be mounted here cleanly:
from backend.app.api.classification import router as classification_router
api_router.include_router(classification_router, prefix="/classification", tags=["AI Predictions"])
from backend.app.api.dashboard import router as dashboard_router
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["Dashboard UI"])
from backend.app.api.alerts import router as alerts_router
api_router.include_router(alerts_router, prefix="/alerts", tags=["Alerts"])
from backend.app.api.evidence import router as evidence_router
api_router.include_router(evidence_router, prefix="/evidence", tags=["Evidence Fusion"])
from backend.app.api.emergency import router as emergency_router
api_router.include_router(emergency_router, prefix="/emergency", tags=["Emergency Dispatch"])

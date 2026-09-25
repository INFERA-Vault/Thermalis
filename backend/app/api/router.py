"""
Central API Router uniting all modular endpoint routers.
"""

from fastapi import APIRouter
from backend.app.api.health import router as health_router
from backend.app.api.firms import router as firms_router

api_router = APIRouter()

# Health check endpoints
api_router.include_router(health_router, tags=["Health"])

# NASA FIRMS Ingestion endpoints
api_router.include_router(firms_router, prefix="/firms", tags=["FIRMS Ingestion"])

# Future Phase Modules will be mounted here cleanly:
# e.g.,
# api_router.include_router(osm.router, prefix="/osm", tags=["OpenStreetMap"])
# api_router.include_router(satellite.router, prefix="/satellite", tags=["Satellite Processing"])
# api_router.include_router(predictions.router, prefix="/predictions", tags=["AI Predictions"])
# api_router.include_router(alerts.router, prefix="/alerts", tags=["Alerts & Monitoring"])

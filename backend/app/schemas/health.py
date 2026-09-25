"""
Health check schema.
"""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(..., description="Service health status", json_schema_extra={"example": "ok"})
    service: str = Field(..., description="Name of the service")
    version: str = Field(..., description="Version of the application")
    environment: str = Field(..., description="Current running environment")

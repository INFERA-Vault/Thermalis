from typing import Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(..., description="Service health status", json_schema_extra={"example": "ok"})
    service: str = Field(..., description="Name of the service")
    version: str = Field(..., description="Version of the application")
    environment: str = Field(..., description="Current running environment")
    last_firms_sync_at: Optional[str] = Field(None, description="ISO timestamp of last successful FIRMS sync")
    firms_sync_status: Optional[str] = Field(None, description="Current sync status (e.g. success, syncing, error, idle)")

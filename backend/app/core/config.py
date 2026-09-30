"""
Application configuration management using Pydantic Settings.
All settings can be configured via environment variables or a .env file.
"""

from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Application Info
    PROJECT_NAME: str = "Industrial Fire & Thermal Anomaly Detection System"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: Union[bool, None] = None
    
    @field_validator("DEBUG", mode="before")
    @classmethod
    def set_debug_based_on_env(cls, v: Union[bool, str, None], info) -> bool:
        if v is not None:
            if isinstance(v, str):
                return v.lower() in ("true", "1", "yes")
            return bool(v)
        env = info.data.get("ENVIRONMENT", "development")
        return env == "development"

    API_V1_PREFIX: str = "/api/v1"

    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    # Database Configuration (PostgreSQL + PostGIS)
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/geospatial_fires_db"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_ECHO: bool = False

    # NASA FIRMS API Configuration
    FIRMS_API_KEY: str = ""
    
    JWT_SECRET_KEY: str = "local_development_secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    FIRMS_BASE_URL: str = "https://firms.modaps.eosdis.nasa.gov/api"
    FIRMS_TIMEOUT: int = 30

    # OpenStreetMap / Overpass API Configuration
    OVERPASS_URL: str = "https://overpass.openstreetmap.fr/api/interpreter"
    OVERPASS_TIMEOUT: int = 60

    # Satellite STAC API Configuration (Element84 Earth Search)
    STAC_API_URL: str = "https://earth-search.aws.element84.com/v1/search"
    STAC_TIMEOUT: int = 60

    # Live Refresh Configuration
    LIVE_REFRESH_ENABLED: bool = True
    LIVE_REFRESH_INTERVAL_SECONDS: int = 60
    LIVE_REFRESH_COUNTRY_CODE: str = "IND"
    LIVE_REFRESH_SOURCE: str = "VIIRS_SNPP_NRT"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()

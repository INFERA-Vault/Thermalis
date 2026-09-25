"""
Core configuration, database session handling, logging, and exceptions.
"""

from backend.app.core.config import settings
from backend.app.core.database import Base, get_db

__all__ = ["settings", "Base", "get_db"]

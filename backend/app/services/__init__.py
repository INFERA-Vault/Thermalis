"""Backend services package.

The public service is loaded lazily so lightweight, dependency-free services
such as evidence fusion can be unit-tested without importing the HTTP/database
ingestion stack first.
"""

__all__ = ["FIRMSService"]


def __getattr__(name):
    if name == "FIRMSService":
        from backend.app.services.firms import FIRMSService

        return FIRMSService
    raise AttributeError(name)

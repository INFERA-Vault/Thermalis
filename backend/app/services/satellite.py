import math
import httpx
from datetime import timedelta, datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.core.exceptions import AppException
from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.satellite_observation import SatelliteObservation
from backend.app.schemas.satellite import SatelliteSearchRequest, SatelliteSearchSummary

class SatelliteService:
    def __init__(self):
        self.stac_url = settings.STAC_API_URL
        self.timeout = settings.STAC_TIMEOUT

    def _generate_bbox(self, lat: float, lon: float, buffer_meters: float) -> List[float]:
        """
        Generates a WGS84 bounding box [min_lon, min_lat, max_lon, max_lat]
        around a point given a buffer in meters.
        """
        # 1 degree of latitude is approx 111,320 meters
        lat_diff = buffer_meters / 111320.0
        # Longitude diff depends on latitude
        lon_diff = buffer_meters / (111320.0 * math.cos(math.radians(lat)))
        
        min_lon = lon - lon_diff
        max_lon = lon + lon_diff
        min_lat = lat - lat_diff
        max_lat = lat + lat_diff
        
        return [min_lon, min_lat, max_lon, max_lat]

    async def _query_stac(self, collection: str, bbox: List[float], start_time: str, end_time: str, cloud_cover: Optional[float] = None) -> List[Dict[str, Any]]:
        """
        Queries the Element84 Earth Search STAC API.
        """
        payload = {
            "collections": [collection],
            "bbox": bbox,
            "datetime": f"{start_time}/{end_time}",
            "limit": 100
        }
        if cloud_cover is not None:
            payload["query"] = {"eo:cloud_cover": {"lte": cloud_cover}}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(self.stac_url, json=payload)
                response.raise_for_status()
                data = response.json()
                return data.get("features", [])
        except httpx.HTTPStatusError as e:
            logger.error(f"STAC API HTTP error: {e.response.text}")
            raise AppException(message=f"Satellite API error: {e.response.status_code}", status_code=502)
        except Exception as e:
            logger.error(f"STAC API Request failed: {str(e)}")
            raise AppException(message="Failed to contact Satellite API", status_code=503)

    async def discover_observations(self, request: SatelliteSearchRequest, db: Session) -> SatelliteSearchSummary:
        """
        Discovers Sentinel-1 and Sentinel-2 observations for a thermal event and persists them.
        """
        event = db.query(ThermalEvent).filter(ThermalEvent.id == request.thermal_event_id).first()
        if not event:
            raise AppException(message="Thermal event not found", status_code=404)

        bbox = self._generate_bbox(event.latitude, event.longitude, request.buffer_meters)
        
        start_time = (event.detected_at - timedelta(days=request.days_before)).strftime("%Y-%m-%dT%H:%M:%SZ")
        end_time = (event.detected_at + timedelta(days=request.days_after)).strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # Query Sentinel-2
        s2_features = await self._query_stac(
            collection="sentinel-2-l2a",
            bbox=bbox,
            start_time=start_time,
            end_time=end_time,
            cloud_cover=request.max_cloud_cover
        )
        
        # Query Sentinel-1
        s1_features = await self._query_stac(
            collection="sentinel-1-grd",
            bbox=bbox,
            start_time=start_time,
            end_time=end_time
        )
        
        saved_count = 0
        
        def save_feature(feature: dict, sat_name: str, get_cloud: bool = False):
            nonlocal saved_count
            product_id = feature["id"]
            # Remove 'Z' for fromisoformat if needed
            dt_str = feature["properties"]["datetime"].replace("Z", "+00:00")
            acq_time = datetime.fromisoformat(dt_str)
            
            # Idempotency check: does it exist for this event?
            exists = db.query(SatelliteObservation).filter_by(
                thermal_event_id=event.id,
                product_id=product_id
            ).first()
            
            if exists:
                return

            cloud_val = feature["properties"].get("eo:cloud_cover") if get_cloud else None
            
            # Extract basic assets metadata to extra_metadata
            assets = {k: v.get("href") for k,v in feature.get("assets", {}).items() if "href" in v}
            extra = {
                "bbox": feature.get("bbox"),
                "assets": assets,
                "platform": feature["properties"].get("platform")
            }
            if not get_cloud:
                # Sentinel-1 specific metadata
                extra["polarizations"] = feature["properties"].get("sar:polarizations")
                extra["instrument_mode"] = feature["properties"].get("sar:instrument_mode")
                extra["orbit_state"] = feature["properties"].get("sat:orbit_state")

            obs = SatelliteObservation(
                thermal_event_id=event.id,
                satellite=sat_name,
                product_id=product_id,
                acquisition_time=acq_time,
                cloud_coverage=cloud_val,
                extra_metadata=extra
            )
            db.add(obs)
            try:
                db.commit()
                saved_count += 1
            except IntegrityError:
                db.rollback()

        for f in s2_features:
            save_feature(f, sat_name="Sentinel-2", get_cloud=True)
            
        for f in s1_features:
            save_feature(f, sat_name="Sentinel-1", get_cloud=False)
            
        return SatelliteSearchSummary(
            status="success",
            thermal_event_id=event.id,
            sentinel_2_found=len(s2_features),
            sentinel_1_found=len(s1_features),
            total_saved=saved_count
        )

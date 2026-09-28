import math
import logging
import rasterio
from rasterio.windows import from_bounds
import numpy as np
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# ESA WorldCover 2021 v200 class mapping
WORLDCOVER_CLASSES = {
    10: "Tree cover",
    20: "Shrubland",
    30: "Grassland",
    40: "Cropland",
    50: "Built-up",
    60: "Bare / sparse vegetation",
    70: "Snow and ice",
    80: "Permanent water bodies",
    90: "Herbaceous wetland",
    95: "Mangroves",
    100: "Moss and lichen"
}

class WorldCoverService:
    def __init__(self, buffer_degrees: float = 0.009):
        # 0.009 degrees is roughly 1000m near the equator
        self.buffer_degrees = buffer_degrees
        self.base_url = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
    
    def _get_tile_name(self, lat: float, lon: float) -> str:
        """Calculate the 3x3 degree tile name for ESA WorldCover."""
        tile_lat = math.floor(lat / 3.0) * 3
        tile_lon = math.floor(lon / 3.0) * 3
        
        lat_str = f"N{abs(tile_lat):02d}" if tile_lat >= 0 else f"S{abs(tile_lat):02d}"
        lon_str = f"E{abs(tile_lon):03d}" if tile_lon >= 0 else f"W{abs(tile_lon):03d}"
        
        return f"{lat_str}{lon_str}"

    def extract_features(self, lat: float, lon: float) -> Dict[str, Any]:
        """Extract land cover features around a point using remote streaming (vsicurl)."""
        tile_name = self._get_tile_name(lat, lon)
        filename = f"ESA_WorldCover_10m_2021_v200_{tile_name}_Map.tif"
        url = self.base_url + filename
        
        features = {
            "source": "ESA WorldCover 2021 v200",
            "tile": tile_name,
            "land_cover_at_event": None,
            "land_cover_class_name": None,
            "fractions": {},
            "error": None
        }
        
        try:
            # Using vsicurl for remote streaming without downloading the full tile
            with rasterio.Env(CPL_VSIL_CURL_ALLOWED_EXTENSIONS='tif', GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
                with rasterio.open(url) as src:
                    # Point value (exact location)
                    row, col = src.index(lon, lat)
                    window_1x1 = rasterio.windows.Window(col, row, 1, 1)
                    val = src.read(1, window=window_1x1)
                    if val.size > 0 and val[0,0] != src.nodata:
                        class_code = int(val[0,0])
                        features["land_cover_at_event"] = class_code
                        features["land_cover_class_name"] = WORLDCOVER_CLASSES.get(class_code, "Unknown")
                    
                    # Neighborhood fractions
                    bounds = (
                        lon - self.buffer_degrees,
                        lat - self.buffer_degrees,
                        lon + self.buffer_degrees,
                        lat + self.buffer_degrees
                    )
                    window = from_bounds(*bounds, transform=src.transform)
                    data = src.read(1, window=window)
                    
                    if data.size > 0:
                        unique, counts = np.unique(data, return_counts=True)
                        total_valid_pixels = sum([c for u, c in zip(unique, counts) if u != src.nodata])
                        
                        if total_valid_pixels > 0:
                            for u, c in zip(unique, counts):
                                if u != src.nodata:
                                    class_name = WORLDCOVER_CLASSES.get(int(u), f"Class_{u}")
                                    key = f"nearby_{class_name.lower().replace(' / ', '_').replace(' ', '_')}_fraction"
                                    features["fractions"][key] = float(c) / total_valid_pixels
                                    
        except rasterio.errors.RasterioIOError:
            features["error"] = f"Tile not found or inaccessible: {filename}"
            logger.warning(f"WorldCover tile inaccessible: {filename}")
        except Exception as e:
            features["error"] = str(e)
            logger.error(f"Error reading WorldCover data: {str(e)}")
            
        return features

worldcover_service = WorldCoverService()

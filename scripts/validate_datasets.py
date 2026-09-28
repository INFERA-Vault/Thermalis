import json
import os
import geopandas as gpd
import pandas as pd
import hashlib

RAW_DIR = "ml/datasets/raw"
MANIFEST_PATH = os.path.join(RAW_DIR, "DATASET_MANIFEST.json")

def get_hash(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b""):
            h.update(chunk)
    return h.hexdigest()

def validate():
    manifest = []
    
    # 1. GIHS
    gihs_path = os.path.join(RAW_DIR, "gihs/GIHS_2000_2023/GIHS_2000_2023.shp")
    if os.path.exists(gihs_path):
        gdf = gpd.read_file(gihs_path)
        manifest.append({
            "source": "Global Industrial Heat Sources (GIHS)",
            "url_doi": "10.5281/zenodo.20960492",
            "license": "CC-BY",
            "local_file": gihs_path,
            "size_bytes": os.path.getsize(gihs_path),
            "record_count": len(gdf),
            "geometry_type": str(gdf.geom_type.unique()[0]),
            "crs": str(gdf.crs),
            "date_range": "2000-2023",
            "label_meaning": "INDUSTRIAL_HEAT_SOURCE_REFERENCE",
            "important_attributes": list(gdf.columns),
            "limitations": "These are persistent heat sources (e.g. cement, steel, flares), not necessarily 'industrial fires'. Spatial polygon/point representation."
        })
        
    # 2. Crop Burning
    crop1_path = os.path.join(RAW_DIR, "crop_burning/partially_completely_burnt_2020_11_10.geojson")
    crop2_path = os.path.join(RAW_DIR, "crop_burning/partially_completely_burnt_2021_10_29.geojson")
    if os.path.exists(crop1_path) and os.path.exists(crop2_path):
        gdf1 = gpd.read_file(crop1_path)
        gdf2 = gpd.read_file(crop2_path)
        manifest.append({
            "source": "Punjab Crop-Residue Burning",
            "url_doi": "10.5281/zenodo.20179137",
            "license": "CC-BY",
            "local_file": f"{crop1_path}, {crop2_path}",
            "size_bytes": os.path.getsize(crop1_path) + os.path.getsize(crop2_path),
            "record_count": len(gdf1) + len(gdf2),
            "geometry_type": str(gdf1.geom_type.unique()[0]),
            "crs": str(gdf1.crs),
            "date_range": "Nov 2020, Oct 2021",
            "label_meaning": "AGRICULTURAL_BURNING_REFERENCE",
            "important_attributes": list(gdf1.columns),
            "limitations": "Temporally restricted to specific dates in 2020/2021. Polygons represent burned areas."
        })
        
    # 3. Wildfire
    wildfire_path = os.path.join(RAW_DIR, "wildfire/metadata_asia.csv")
    if os.path.exists(wildfire_path):
        df = pd.read_csv(wildfire_path)
        manifest.append({
            "source": "Global Wildfire Dataset (Asia Subset)",
            "url_doi": "HuggingFace: moritzrengert1/wildfire_global",
            "license": "Open Data Commons Open Database License (ODbL)",
            "local_file": wildfire_path,
            "size_bytes": os.path.getsize(wildfire_path),
            "record_count": len(df),
            "geometry_type": "Point (from lat/lon columns)",
            "crs": "EPSG:4326 (assumed)",
            "date_range": f"{df['acq_date'].min()} to {df['acq_date'].max()}" if 'acq_date' in df.columns else "Unknown",
            "label_meaning": "WILDFIRE_REFERENCE",
            "important_attributes": list(df.columns),
            "limitations": "Tabular metadata only; polygons/images not downloaded. Represents only a subset (Asia)."
        })
        
    with open(MANIFEST_PATH, 'w') as f:
        json.dump(manifest, f, indent=4)
        
    print(f"Validation complete. Found {len(manifest)} datasets.")

if __name__ == "__main__":
    validate()

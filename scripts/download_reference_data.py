import os
import urllib.request
import zipfile
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RAW_DIR = "ml/datasets/raw"
MANIFEST_PATH = os.path.join(RAW_DIR, "DATASET_MANIFEST.json")

DATASETS = {
    "gihs": {
        "url": "https://zenodo.org/api/records/20960492/files/GIHS_2000_2023.zip/content",
        "type": "zip",
        "dir": "gihs"
    },
    "crop_burning_1": {
        "url": "https://zenodo.org/api/records/20179137/files/partially_completely_burnt_2020_11_10.geojson/content",
        "type": "file",
        "dir": "crop_burning",
        "filename": "partially_completely_burnt_2020_11_10.geojson"
    },
    "crop_burning_2": {
        "url": "https://zenodo.org/api/records/20179137/files/partially_completely_burnt_2021_10_29.geojson/content",
        "type": "file",
        "dir": "crop_burning",
        "filename": "partially_completely_burnt_2021_10_29.geojson"
    },
    "wildfire_asia": {
        "url": "https://huggingface.co/datasets/moritzrengert1/wildfire_global/resolve/main/metadata_asia.csv",
        "type": "file",
        "dir": "wildfire",
        "filename": "metadata_asia.csv"
    }
}

def download_datasets():
    for name, info in DATASETS.items():
        out_dir = os.path.join(RAW_DIR, info["dir"])
        os.makedirs(out_dir, exist_ok=True)
        
        if info["type"] == "zip":
            zip_path = os.path.join(out_dir, "temp.zip")
            if not os.path.exists(zip_path):
                logger.info(f"Downloading {name}...")
                urllib.request.urlretrieve(info["url"], zip_path)
                logger.info(f"Extracting {name}...")
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(out_dir)
                # Keep the zip or remove it based on preference, let's keep it for manifest
        elif info["type"] == "file":
            file_path = os.path.join(out_dir, info["filename"])
            if not os.path.exists(file_path):
                logger.info(f"Downloading {name}...")
                urllib.request.urlretrieve(info["url"], file_path)
                logger.info(f"Downloaded {file_path}")

if __name__ == "__main__":
    download_datasets()

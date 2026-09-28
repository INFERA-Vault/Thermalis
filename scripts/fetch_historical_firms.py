import asyncio
import os
import httpx
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv

from backend.app.core.database import SessionLocal
from backend.app.services.firms import FIRMSService, FIRMSIngestRequest
from backend.app.models.thermal_event import ThermalEvent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
MAP_KEY = os.environ.get('FIRMS_API_KEY')
BBOX_PUNJAB = "75.0,30.0,76.5,31.0"
BBOX_INDIA_WEST = "70.0,18.0,74.0,22.0" # Just an arbitrary box in India for GIHS matches

async def fetch_and_ingest(bbox, start_date_str, source="VIIRS_SNPP_SP"):
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{source}/{bbox}/5/{start_date_str}"
    logger.info(f"Fetching {source} for {bbox} from {start_date_str}...")
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url)
            
        if resp.status_code != 200:
            logger.error(f"Failed to fetch FIRMS data: {resp.status_code} {resp.text[:100]}")
            return
            
        csv_text = resp.text
        if "latitude" not in csv_text:
            logger.warning(f"No data or invalid CSV returned: {csv_text[:100]}")
            return
            
        # Write to raw cache
        os.makedirs("ml/datasets/raw/firms", exist_ok=True)
        filename = f"ml/datasets/raw/firms/firms_{source}_{start_date_str}.csv"
        with open(filename, "w") as f:
            f.write(csv_text)
            
        # Use our parser and ingest
        svc = FIRMSService()
        db = SessionLocal()
        
        valid_records, rejected_count, rejection_reasons = svc.parse_and_validate(csv_text, source)
        logger.info(f"Parsed {len(valid_records)} valid records, {rejected_count} rejected.")
        
        unique_records, duplicate_count = svc.deduplicate(valid_records, db)
        
        if unique_records:
            orm_events = svc.to_thermal_events(unique_records)
            db.add_all(orm_events)
            db.commit()
            logger.info(f"Persisted {len(orm_events)} new ThermalEvents to database.")
            
        db.close()
        
    except Exception as e:
        logger.error(f"Error processing {start_date_str}: {e}")

async def main():
    # Fetch Punjab (Crop Burning targets)
    await fetch_and_ingest(BBOX_PUNJAB, "2020-11-05")
    await fetch_and_ingest(BBOX_PUNJAB, "2020-11-10")
    await fetch_and_ingest(BBOX_PUNJAB, "2021-10-25")
    await fetch_and_ingest(BBOX_PUNJAB, "2021-10-30")

    # Fetch West India (To guarantee more GIHS / Industrial matches)
    await fetch_and_ingest(BBOX_INDIA_WEST, "2022-03-01")
    await fetch_and_ingest(BBOX_INDIA_WEST, "2022-03-06")

if __name__ == "__main__":
    asyncio.run(main())

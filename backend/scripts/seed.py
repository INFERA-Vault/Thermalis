import datetime
import json
import os

from geoalchemy2.elements import WKBElement

from backend.app.core.database import SessionLocal
from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.industrial_facility import IndustrialFacility


def parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime.datetime):
        return value
    return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def parse_geometry(value):
    if not value:
        return None
    if isinstance(value, str):
        return WKBElement(bytes.fromhex(value), srid=4326)
    return value


def seed_db():
    events_path = os.path.join(os.path.dirname(__file__), "../data/sample_events.json")
    facs_path = os.path.join(os.path.dirname(__file__), "../data/sample_facilities.json")
    
    with SessionLocal() as db:
        if os.path.exists(events_path):
            with open(events_path, "r") as f:
                events = json.load(f)
                inserted_events = 0
                for raw in events:
                    e_data = dict(raw)
                    source_event_id = e_data.get("source_event_id")
                    if source_event_id and db.query(ThermalEvent).filter_by(source_event_id=source_event_id).first():
                        continue
                    e_data.pop("id", None)
                    e_data.pop("created_at", None)
                    e_data["detected_at"] = parse_datetime(e_data.get("detected_at"))
                    e_data["geometry"] = parse_geometry(e_data.get("geometry"))
                    db.add(ThermalEvent(**e_data))
                    inserted_events += 1
            print(f"Loaded {inserted_events} new sample thermal events.")
            
        if os.path.exists(facs_path):
            with open(facs_path, "r") as f:
                facs = json.load(f)
                inserted_facilities = 0
                for raw in facs:
                    f_data = dict(raw)
                    source = f_data.get("source", "OSM")
                    source_id = f_data.get("source_id")
                    if source_id and db.query(IndustrialFacility).filter_by(source=source, source_id=source_id).first():
                        continue
                    f_data.pop("id", None)
                    f_data.pop("created_at", None)
                    f_data.pop("updated_at", None)
                    f_data["geometry"] = parse_geometry(f_data.get("geometry"))
                    db.add(IndustrialFacility(**f_data))
                    inserted_facilities += 1
            print(f"Loaded {inserted_facilities} new sample facilities.")
            
        try:
            db.commit()
            print("Successfully seeded sample data.")
        except Exception as e:
            db.rollback()
            print("Failed to seed data:", str(e))

if __name__ == "__main__":
    seed_db()

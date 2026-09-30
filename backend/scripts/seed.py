import json
import os
from sqlalchemy.orm import Session
from backend.app.core.database import SessionLocal
from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.industrial_facility import IndustrialFacility

def seed_db():
    events_path = os.path.join(os.path.dirname(__file__), "../data/sample_events.json")
    facs_path = os.path.join(os.path.dirname(__file__), "../data/sample_facilities.json")
    
    with SessionLocal() as db:
        if os.path.exists(events_path):
            with open(events_path, "r") as f:
                events = json.load(f)
                for e_data in events:
                    # Remove fields that might cause issues or generate dynamically
                    e_data.pop("id", None)
                    event = ThermalEvent(**e_data)
                    db.add(event)
            print(f"Loaded {len(events)} sample thermal events.")
            
        if os.path.exists(facs_path):
            with open(facs_path, "r") as f:
                facs = json.load(f)
                for f_data in facs:
                    f_data.pop("id", None)
                    fac = IndustrialFacility(**f_data)
                    db.add(fac)
            print(f"Loaded {len(facs)} sample facilities.")
            
        try:
            db.commit()
            print("Successfully seeded sample data.")
        except Exception as e:
            db.rollback()
            print("Failed to seed data:", str(e))

if __name__ == "__main__":
    seed_db()

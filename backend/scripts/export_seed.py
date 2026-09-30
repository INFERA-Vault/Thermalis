import asyncio
import json
from sqlalchemy import select
from backend.app.core.database import SessionLocal
from backend.app.models.thermal_event import ThermalEvent
from backend.app.models.industrial_facility import IndustrialFacility

def export():
    with SessionLocal() as session:
        # Get 50 thermal events
        result = session.execute(select(ThermalEvent).limit(50))
        events = result.scalars().all()
        
        events_data = []
        for e in events:
            d = e.__dict__.copy()
            d.pop('_sa_instance_state', None)
            if 'acq_date' in d and d['acq_date']:
                d['acq_date'] = d['acq_date'].isoformat()
            if 'acq_time' in d and d['acq_time']:
                d['acq_time'] = str(d['acq_time'])
            if 'created_at' in d and d['created_at']:
                d['created_at'] = d['created_at'].isoformat()
            if 'updated_at' in d and d['updated_at']:
                d['updated_at'] = d['updated_at'].isoformat()
            if 'location' in d:
                d.pop('location', None)
            events_data.append(d)
            
        with open("backend/data/sample_events.json", "w") as f:
            json.dump(events_data, f, indent=2, default=str)
            
        # Get 50 facilities
        result = session.execute(select(IndustrialFacility).limit(50))
        facilities = result.scalars().all()
        
        fac_data = []
        for f in facilities:
            d = f.__dict__.copy()
            d.pop('_sa_instance_state', None)
            if 'created_at' in d and d['created_at']:
                d['created_at'] = str(d['created_at'])
            if 'updated_at' in d and d['updated_at']:
                d['updated_at'] = str(d['updated_at'])
            if 'location' in d:
                d.pop('location', None)
            fac_data.append(d)
            
        with open("backend/data/sample_facilities.json", "w") as f:
            json.dump(fac_data, f, indent=2, default=str)

if __name__ == "__main__":
    export()

# AI-Based Detection & Classification of Industrial Fires and Persistent Thermal Sources

> **Geospatial Intelligence Platform using NASA FIRMS, OpenStreetMap, Multi-Mission Satellite Imagery (Sentinel-2/1), and PostGIS**

---

## 📌 Overview

This platform provides an automated end-to-end pipeline for detecting, contextualizing, and classifying industrial fires and persistent thermal anomalies across regions of interest. By combining near-real-time satellite thermal detections (NASA FIRMS) with spatial infrastructure inventories (OpenStreetMap), multi-spectral/SAR satellite data (Sentinel-2, Sentinel-1), and deep spatial modeling in PostgreSQL/PostGIS, the system distinguishes persistent industrial flares and high-temperature manufacturing sources from natural wildfires, agricultural burning, and mining operations.

---

## 🏛️ System Architecture

```
                                  +-----------------------+
                                  |   NASA FIRMS API      |
                                  |  (VIIRS / MODIS NRT)  |
                                  +-----------+-----------+
                                              |
                                              v
+-----------------------+         +-----------------------+         +-----------------------+
|  OpenStreetMap (OSM)  |         |   FastAPI Backend     |         |   Sentinel-2 / SAR    |
|   Overpass API        | ------> |  - Ingestion Service  | <------ |   Multi-spectral      |
|  (Industrial Footpr.) |         |  - Deduplication      |         |   (Future Modules)    |
+-----------------------+         |  - Normalization      |         +-----------------------+
                                  +-----------+-----------+
                                              |
                                              v
                                  +-----------------------+
                                  | PostgreSQL + PostGIS  |
                                  |  - WGS84 EPSG:4326    |
                                  |  - GIST Spatial Index |
                                  |  - 7 Core Entities    |
                                  +-----------+-----------+
                                              |
                                              v
                                  +-----------------------+
                                  |   AI / ML Engine      |
                                  |  - Feature Extractor  |
                                  |  - Classifier         |
                                  |  - Risk Assessor      |
                                  +-----------------------+
```

---

## 📂 Repository Structure

```
project-root/
│
├── README.md                           # Project documentation
├── docker-compose.yml                  # Local PostgreSQL 16 + PostGIS 3.4 container
├── alembic.ini                         # Database migration configuration
├── .env.example                        # Environment template
├── .gitignore                          # Exclusions (data, weights, secrets, envs)
│
├── backend/                            # FastAPI Python Backend
│   ├── requirements.txt                # Core backend dependencies
│   ├── alembic/                        # Version-controlled PostGIS migrations
│   │   └── versions/
│   │       └── 0001_initial_postgis_schema.py
│   ├── app/
│   │   ├── main.py                     # Application factory & lifespan
│   │   ├── api/                        # Modular API routers
│   │   │   ├── router.py               # Aggregated central router
│   │   │   ├── health.py               # Health check endpoint (/api/health)
│   │   │   └── firms.py                # FIRMS ingestion endpoint (/api/v1/firms/ingest)
│   │   ├── core/                       # Settings, DB session, logging, errors
│   │   │   ├── config.py               # Pydantic Settings & environment validation
│   │   │   ├── database.py             # SQLAlchemy engine pool & Base
│   │   │   ├── logging.py              # Centralized logging formatters
│   │   │   └── exceptions.py           # Exception handlers
│   │   ├── models/                     # PostGIS SQLAlchemy ORM models
│   │   │   ├── thermal_event.py        # FIRMS thermal anomaly points
│   │   │   ├── industrial_facility.py  # OSM infrastructure geometries
│   │   │   ├── association.py          # N:M Event-Facility spatial links
│   │   │   ├── satellite_observation.py# Scene & granule metadata
│   │   │   ├── event_feature.py        # Spectral & persistence ML features
│   │   │   ├── classification.py       # AI model inference predictions
│   │   │   └── risk_assessment.py      # Severity scoring & anomaly metrics
│   │   ├── schemas/                    # Pydantic validation schemas
│   │   │   ├── health.py
│   │   │   └── firms.py
│   │   ├── services/                   # Business logic & external pipelines
│   │   │   └── firms.py                # NASA FIRMS ETL & deduplication service
│   │   ├── pipelines/                  # Scheduled data batch pipelines
│   │   └── utils/                      # Helper utilities
│   └── tests/                          # Pytest test suite (17 Unit + 3 Live DB)
│       ├── test_health.py
│       ├── test_database_models.py
│       ├── test_firms_service.py
│       ├── test_firms_api.py
│       └── test_database_integration.py
│
├── frontend/                           # Client-side UI & GIS Visualization
│   ├── public/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── services/
│       ├── hooks/
│       ├── types/
│       └── utils/
│
├── data/                               # Data directories (Strictly Git-ignored)
│   ├── raw/                            # Raw FIRMS, OSM, Sentinel-1/2, Landcover
│   ├── processed/
│   └── samples/
│
├── ml/                                 # AI/ML Models & Experimentation
│   ├── datasets/
│   ├── features/
│   ├── training/
│   ├── models/
│   └── evaluation/
│
├── scripts/                            # Automation & maintenance scripts
└── docs/                               # Architecture, research & phase reports
    └── reports/
        └── PHASE_1_TO_5_IMPLEMENTATION_REPORT.md
```

---

## 🗄️ Database & PostGIS Schema

The system implements 7 normalized tables utilizing PostGIS geometry types with spatial indexing:

| Table | Geometry Column | Spatial Index | Description |
| :--- | :--- | :--- | :--- |
| `thermal_events` | `POINT` (SRID 4326) | GIST | Thermal anomalies from VIIRS (SNPP/NOAA-20/21) & MODIS. |
| `industrial_facilities` | `GEOMETRY` (SRID 4326) | GIST | Refineries, chemical plants, power plants, mines from OSM. |
| `thermal_event_facility_associations` | N/A | B-Tree on distance | N:M decoupled spatial links with computed distance in meters. |
| `satellite_observations` | N/A | Timestamp Index | Sentinel-2/1 scene acquisition metadata. |
| `event_features` | N/A | Unique Event FK | Spectral indices (NDVI, NDBI, SWIR) and persistence duration. |
| `classifications` | N/A | Class Index | Predicted class (`industrial_fire`, `persistent_source`, etc.). |
| `risk_assessments` | N/A | Severity Index | Risk metrics, hazard tier, and breakdown factors. |

---

## 🚀 Quick Start & Development Setup

### 1. Prerequisites
- **Python 3.10+** (Tested on Python 3.13)
- **Docker Desktop** (or native PostgreSQL 16 with PostGIS 3.4)

### 2. Environment Setup
```bash
# Clone the repository
git clone https://github.com/INFERA-SIH26175/PS-162.git
cd PS-162

# Create virtual environment
python -m venv .venv
source .venv/bin/activate    # Linux / macOS
.venv\Scripts\activate       # Windows

# Install backend dependencies
pip install -r backend/requirements.txt

# Create local environment configuration
cp .env.example .env
```

### 3. Start PostgreSQL + PostGIS (Docker)
```bash
docker compose up -d
```

### 4. Run Database Migrations (Alembic)
```bash
alembic upgrade head
```

### 5. Start FastAPI Backend Server
```bash
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
Interactive API docs will be available at:
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

### 6. Run Test Suite
```bash
python -m pytest backend/tests -v
```

---

## 🛰️ NASA FIRMS API Ingestion

To trigger near-real-time ingestion via API:
```bash
curl -X POST "http://localhost:8000/api/v1/firms/ingest" \
     -H "Content-Type: application/json" \
     -d '{
       "source": "VIIRS_SNPP_NRT",
       "bbox": {
         "min_lon": 68.0,
         "min_lat": 8.0,
         "max_lon": 97.0,
         "max_lat": 37.0
       },
       "day_range": 1
     }'
```

---

## 📊 Phase Progress Summary

| Phase | Description | Status |
| :---: | :--- | :---: |
| **Phase 1** | Standardized Modular Project Structure & `.gitignore` | ✅ **Complete** |
| **Phase 2** | FastAPI Backend Foundation, Settings, Logging, Health API | ✅ **Complete** |
| **Phase 3** | PostgreSQL + PostGIS Models, Geometries, Alembic Migrations | ✅ **Complete** |
| **Phase 4** | NASA FIRMS Service ETL, Validation, Normalization, Deduplication | ✅ **Complete** |
| **Phase 5** | Local PostGIS Environment, Docker Compose, Integration Tests | ✅ **Complete** |
| **Phase 6** | OpenStreetMap / Overpass Infrastructure Ingestion & Spatial Matching | ⏳ *Next* |
| **Phase 7** | Sentinel-2 / Sentinel-1 Satellite Data Processing | ⏳ *Upcoming* |
| **Phase 8** | Feature Engineering & Temporal Persistence Analysis | ⏳ *Upcoming* |
| **Phase 9** | AI Model Training, Classification & Risk Scoring | ⏳ *Upcoming* |
| **Phase 10**| GIS Visualization Dashboard & Alerting Frontend | ⏳ *Upcoming* |

---

## 📄 License
Internal Development - SIH Project PS-162.

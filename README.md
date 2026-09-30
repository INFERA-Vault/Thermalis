# INFERA — Industrial Fire & Thermal Anomaly Intelligence Platform

**Problem Statement:** SIH PS-162

This system is an intelligent Geographic Information System (GIS) designed to detect thermal anomalies from NASA FIRMS, identify useful industrial context using OpenStreetMap, study repeated or persistent thermal activity, enrich events with land-cover metadata, classify thermal events with machine learning (Model A), generate automated alerts, and provide an interactive map-based investigation dashboard.

## Project Innovation: ThermoContext Evidence Fusion

The platform now includes `TCEF-v1`, a transparent event-level evidence layer that fuses thermal intensity, temporal persistence, industrial proximity, land cover, FIRMS confidence, and linked satellite metadata. It returns an operational evidence score, data coverage, priority, interpretation, and signal-level explanations through `POST /api/v1/evidence/assess/{event_id}` and the Event Inspector.

TCEF is explicitly not a calibrated probability of fire. Model A remains a restricted GIHS-associated industrial heat-source versus agricultural-burning reference classifier; the evidence layer prevents that limited model from being presented as a universal industrial-fire detector. See [`docs/PS162_NOVELTY_AND_SYSTEM_BLUEPRINT.md`](docs/PS162_NOVELTY_AND_SYSTEM_BLUEPRINT.md) for the novelty framing, lens map, architecture, and validation plan.

### NTRO requirement alignment

The GIS storage and overlay requirement is implemented through PostgreSQL/PostGIS, GeoJSON APIs, MapLibre FIRMS/facility layers, and the Event Inspector. Industrial-versus-natural-fire segregation is currently an honest two-layer capability: TCEF provides explicit `POSSIBLE_WILDFIRE_OR_NATURAL_BURNING` triage from natural-vegetation context, while the shipped Model A remains limited to GIHS industrial heat versus agricultural-burning references. A fail-closed three-way training path is available at `scripts/train_model_b_multiclass.py`, but the current checked-in dataset has no qualifying wildfire-matched FIRMS rows and therefore does not ship an unvalidated three-way model.

The reserved three-way inference contract is `POST /api/v1/classification/predict-source/{event_id}`. It returns `503` until Model B is trained on all three reference classes, preventing accidental overclaiming.

## What We Were Asked to Build

The goal was not just to show dots on a map. The system had to:
1. Collect thermal events from NASA APIs.
2. Store them efficiently in a spatial database.
3. Identify nearby industrial facilities to provide context.
4. Understand land-cover context (e.g., built-up vs. cropland).
5. Detect repeated or persistent thermal activity across days.
6. Use satellite information where available.
7. Create useful machine learning features.
8. Train a real ML model.
9. Provide predictions for real events.
10. Generate alerts for interesting activity.
11. Show the results in a usable GIS dashboard.
12. Continuously refresh new FIRMS observations.
13. Test the system and verify data integrity.

## Data Sources

| Source | What it provides | How we use it | Current status |
|--------|------------------|---------------|----------------|
| **NASA FIRMS** | Thermal anomaly observations | Coordinates, acquisition time, FRP, brightness temp | Active (Live Refresh) |
| **OpenStreetMap / Overpass** | Industrial facilities | Locations and types of nearby facilities | Active |
| **ESA WorldCover** | Land-cover classification | Event-level context (e.g., built-up, cropland) | Active |
| **Sentinel-1 / Sentinel-2** | Satellite scene metadata | Real observations | Limited (API rate limits restrict broad ingestion) |
| **GIHS Extended Annual 2000–2023** | Reference for industrial heat-source association (Zenodo DOI: 10.5281/zenodo.20960492) | Provides a foundation for Class 1 | Active |
| **Punjab Crop Residue Burning** | Agricultural burning reference (Zenodo DOI: 10.5281/zenodo.20179137) | Provides a foundation for Class 0 | Active |

## Phase-by-Phase Development

*(Note: The current repository uses subdivisions like 10A, 10B, 10D, 10E, but they map to these original 13 core phases.)*

### PHASE 1 — FIRMS + PostGIS
- **What it does:** Ingests NASA FIRMS data and stores it in PostgreSQL with PostGIS extensions.
- **Implementation:** Python scheduled ingestion, deduplication using timestamps and coordinates.
- **Status:** Complete.

### PHASE 2 — OSM + Spatial Enrichment
- **What it does:** Fetches nearby industrial facilities from OSM.
- **Implementation:** Queries OSM Overpass API and uses PostGIS spatial queries to find facilities within a specific radius of thermal events.
- **Status:** Complete.

### PHASE 3 — WorldCover
- **What it does:** Determines the land-cover class at the location of the event.
- **Implementation:** Checks ESA WorldCover data to identify if the event is on built-up land, cropland, etc.
- **Status:** Complete.

### PHASE 4 — Persistence / Clustering
- **What it does:** Tracks whether thermal activity happens repeatedly in the same spot over time. 
  - *Note:* Map visualization clustering simply groups nearby points visually for readability on the frontend. Analytical persistence actually calculates recurring spatial-temporal patterns in the backend.
- **Implementation:** Uses DBSCAN-based logic (`ST_ClusterDBSCAN`) to calculate hotspot frequency and persistence over rolling windows.
- **Status:** Complete.

### PHASE 5 — Sentinel-2
- **What it does:** Fetches satellite imagery metadata to corroborate thermal events.
- **Implementation:** Connects to STAC APIs for Sentinel-2 (and Sentinel-1). 
- **Limitation:** Coverage is currently extremely limited; only a few genuine observations are stored due to API limits.
- **Status:** Limited.

### PHASE 6 — FIRMS ↔ OSM Association
- **What it does:** Links thermal events to specific nearby industrial facilities.
- **Implementation:** PostGIS spatial joins. Evaluates distance threshold logic and maintains relationship tables.
- **Status:** Complete.

### PHASE 7 — Satellite Metadata / Sentinel Pipeline
- **What it does:** Pipeline to manage STAC metadata discovery.
- **Implementation:** Discovers metadata for scenes. It does not download full heavy imagery but links the metadata.
- **Status:** Complete.

### PHASE 8 — Feature Engineering
- **What it does:** Extracts data points for the ML model.
- **Features Used:** `nearby_facility_count`, `hotspot_frequency_30d`, `persistence_days`, `frp`, `brightness_temperature`, `day_night`, `land_cover_at_event`, `is_built_up`, `recurrence_rate`.
- **Status:** Complete.

### PHASE 9 — Training Dataset
- **What it does:** Prepares labels and samples.
- **Implementation:** We construct the dataset using GIHS (Tier A) as the industrial reference and Punjab Crop Residue Burning as the agricultural reference. Features (like OSM proximity) are inputs, not ground truth.
- **Status:** Complete.

### PHASE 10 — XGBoost Model A
- **What it does:** Classifies the reference datasets.
- **Implementation:** XGBoost algorithm with `CalibratedClassifierCV` (Sigmoid / Platt scaling).
- **Artifact:** `ml/models/model_a_calibrated.joblib`
- **Class Mapping:** 0 = AGRICULTURAL_BURNING_REFERENCE, 1 = INDUSTRIAL_HEAT_SOURCE_ASSOCIATION.
- **Final Verified Metrics:**
  - Accuracy: 0.9321
  - Precision: 0.9737
  - Recall: 0.9350
  - F1: 0.9540
  - ROC-AUC: 0.9621
  - PR-AUC: 0.9889
  - Brier Score: 0.0334
  - Confusion Matrix: `[[84, 7], [18, 259]]`
- **Critical Limitation:** This model does NOT prove an event is a confirmed industrial fire. It merely distinguishes between GIHS-associated industrial heat sources and agricultural burning reference events.

### PHASE 11 — Human Labels / Model B Preparation
- **What it does:** A system for humans to verify predictions.
- **Status:** Infrastructure exists, but Model B is not currently considered valid due to insufficient subtype labels. This remains future work.

### PHASE 12 — Explainability + Alerts
- **Explainability:** Global SHAP dependence is established in training. Individual-event SHAP is not implemented in the current API.
- **Alerts:** Generates alerts for `NEW_THERMAL_ANOMALY`, `INDUSTRIAL_HEAT_SOURCE_ALERT`, and `PERSISTENT_THERMAL_ACTIVITY`.
- **High-alert notifications:** New HIGH alerts can be delivered through configurable SMTP email. Delivery state is persisted as `PENDING`, `SENT`, `FAILED`, or `DISABLED` and is visible in the dashboard. An optional fail-closed emergency dispatch layer can route verified, location-aware alerts to approved email, SMS, voice, and HTTPS webhook recipients, with auditable per-recipient outcomes. It is disabled by default and does not discover or guess emergency contacts.
- **Status:** Complete. Alerts transition between ACTIVE, ACKNOWLEDGED, and RESOLVED safely (idempotent).

### PHASE 13 — Final GIS Dashboard + Testing / Deployment
- **Frontend:** React + TypeScript + Vite + MapLibre. Displays FIRMS layer (red points for unclustered hotspots, yellow/orange/red numbered circles for visual clusters), OSM facilities (purple points), and alerts.
- **Backend:** FastAPI offering routes for health, FIRMS refresh, GeoJSON events, Model A predictions, and alert resolution.
- **Testing:** Comprehensive test suite for backend logic and database integrity.
- **Deployment:** The Docker Compose stack has been built and smoke-tested with PostGIS, FastAPI, Alembic migrations, and the frontend. Public deployment has not yet happened.

## Demonstration Database Snapshot
*Compose smoke-test database after loading the checked-in sample data — 2026-10-01*

| Entity | Count |
|--------|-------|
| Thermal Events | 52 |
| Industrial Facilities | 50 |
| Event ↔ Facility Associations | 0 |
| Event Features | 0 |
| Satellite Observations | 0 |
| Total Alerts | 0 |
| Active Alerts | 0 |
| Acknowledged Alerts | 0 |
| Resolved Alerts | 0 |

*Integrity Checks:* Duplicate thermal events (1), Orphan associations (0), Orphan alerts (0).

## Frontend User Guide

1. Open `http://localhost:5173`.
2. **The Map:** Renders an English basemap with visual markers.
3. **FIRMS Points:** Red dots represent individual thermal anomalies.
4. **Numbered Clusters:** Large yellow/orange/red circles group points. Clicking a cluster zooms in to reveal the individual points.
5. **OSM Facilities:** Purple dots represent industrial facilities.
6. **Layers:** Use the left panel to toggle the FIRMS or OSM layers on/off.
7. **Event Inspector:** Click an individual red thermal anomaly to open the Event Inspector on the right.
8. **Model A:** Inside the Event Inspector, view the classification prediction.
9. **Alerts:** Use the bottom-left panel to view ACTIVE alerts. Click an alert to center the map on the event.
10. **Acknowledge/Resolve:** Click the "Acknowledge" or "Resolve" button on an active alert inside the Event Inspector to update its status.
11. **Refresh Data:** Click the "Refresh Data" button at the top to poll the NASA APIs live.
12. **Success:** Data populates, maps are visible, and alerts change state smoothly.
13. **Failure:** A red error badge will appear near the "LIVE" indicator if the backend fails to connect to NASA APIs.

## How to Run Locally

1. **Database:** Ensure PostgreSQL with PostGIS is running and credentials match the `.env` file (e.g., `DATABASE_URL=postgresql://user:pass@localhost:5432/infera`).
2. **Backend:**
   ```bash
   source .venv/bin/activate
   uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
3. **Frontend:**
   ```bash
   cd frontend
   npm run dev -- --port 5173 --host
   ```
   Requires `VITE_MAPTILER_API_KEY` in `frontend/.env`.

### Optional sample data and email notifications

For a fresh database, run the included seed script from the repository root after migrations:

```bash
python -m backend.scripts.seed
```

Email delivery is disabled by default. To enable HIGH-alert notifications, set `ALERT_EMAIL_ENABLED=True`, `ALERT_EMAIL_TO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, and `FRONTEND_URL` in `.env`. The notification status is recorded even when email is disabled or unavailable.

For controlled emergency escalation, follow [`docs/EMERGENCY_DISPATCH_RUNBOOK.md`](docs/EMERGENCY_DISPATCH_RUNBOOK.md). Configure only verified, operator-owned recipients. The service supports SMTP email, Twilio-compatible SMS/voice, and HTTPS webhooks; it does not automatically call public emergency numbers. Keep `EMERGENCY_DISPATCH_ENABLED=False` until recipient verification, sandbox testing, human acknowledgement procedures, and incident ownership are signed off.

For the consolidated setup, deployment, migration, health-check, and operations path, see [`docs/END_TO_END_OPERATIONS.md`](docs/END_TO_END_OPERATIONS.md).

## Current Test Results

- **Backend container:** 49 passed, 1 skipped against the Compose PostGIS database.
- **Frontend Build:** TypeScript and Vite production build passed (1.28 MB JavaScript bundle before compression).
- **Compose:** Database, backend, and frontend containers healthy; Alembic revision `a2f4c8e7d1b9` applied.
- **API smoke tests:** Health, OpenAPI, GeoJSON events, GeoJSON facilities, and emergency-dispatch status passed.
- **Model:** Model A was regenerated from the checked-in CSV fallback with XGBoost 2.1.4 and loads successfully in the container.
- **Alerts:** Idempotency and lifecycle verification passed; emergency dispatch remains disabled until recipients are verified.
- **Security:** Secret tracking checked; no provider credentials are committed.
- **Browser:** Frontend HTTP smoke test passed. Interactive browser acceptance testing remains a deployment-stage check.

## Known Limitations

1. **Scope:** Model A has a restricted reference-classification scope (it is not a universal industrial-fire detector).
2. **Generalization:** Broad geographic generalization is not established.
3. **Satellites:** Sentinel observations are limited due to restrictive public API rate limits.
4. **Geography:** FIRMS uses an India-focused rectangular bounding region `[8.0, 68.0, 37.0, 97.0]`, meaning some neighboring-country observations inevitably appear.
5. **Dataset coverage:** The checked-in demonstration database is intentionally small; live FIRMS/OSM refresh requires valid external credentials and provider availability.
6. **Deployment:** Public deployment has not yet been performed.
7. **Emergency dispatch:** SMS, voice, email, and webhook delivery require official, verified recipient endpoints and provider credentials; the system never guesses public emergency numbers.

## Project Structure

- `backend/`: FastAPI application, API routes, SQLAlchemy models, and background services.
- `frontend/`: React Vite application and map visualization components.
- `ml/`: Model training scripts, Jupyter notebooks, and serialized model artifacts.
- `scripts/`: Standalone Python scripts for data ingestion and utility tasks.
- `docs/`: Audit reports and technical specifications.
- `migrations/`: Alembic database migration scripts.
- `docker-compose.yml`: Containerization configuration.
- `.env.example`: Template for environment variables.

## Technology Used

| Technology | Why we use it |
|------------|---------------|
| Python | Core backend and ML logic |
| FastAPI | High-performance async API server |
| PostgreSQL | Relational database storage |
| PostGIS | Spatial extension for bounding box and radius queries |
| React | Frontend component framework |
| TypeScript | Type-safe frontend code |
| Vite | Fast frontend build tool |
| MapLibre / MapTiler | Open-source vector map rendering |
| XGBoost | High-performance gradient boosting for Model A |
| scikit-learn / joblib | ML evaluation pipelines and model serialization |

## Final Project Status

| Component | Status |
|-----------|--------|
| NASA FIRMS Ingestion | PASS |
| Spatial Database | PASS |
| Map Rendering | PASS |
| ML Model A | PASS (Within restricted scope) |
| Alerts System | PASS |
| Emergency Dispatch Layer | PASS (disabled by default until configured) |
| Satellite Integration | LIMITED (Due to API limits) |
| Hotspot Click / Event Inspector | IMPLEMENTED |
| Compose Deployment | PASS (smoke-tested) |
| Public Internet Deployment | NOT DEPLOYED |

**Overall Verdict: B — COMPLETE WITH DOCUMENTED LIMITATIONS**
The system fulfills the core PS-162 criteria, successfully ingesting live spatial data, enriching it with OSM, applying a validated reference-classification model, generating stateful alerts, and exposing a controlled location-aware emergency-dispatch layer. Limitations involve the ML scope, external-provider availability, and the need for official recipient verification before live escalation.

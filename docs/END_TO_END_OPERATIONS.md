# PS-162 End-to-End Operations Guide

This repository is the deployable PS-162 reference implementation: a FastAPI + PostgreSQL/PostGIS backend, a React/MapLibre GIS dashboard, the TCEF-v1 evidence layer, Model A reference classification, alert lifecycle management, and an opt-in emergency notification layer.

## 1. What is implemented

### Data and intelligence pipeline

1. NASA FIRMS thermal observations are validated, deduplicated, and stored in PostGIS.
2. OSM/Overpass industrial facilities are spatially associated with events.
3. ESA WorldCover and Sentinel metadata enrich event features where available.
4. Persistence and recurrence features identify repeated thermal activity.
5. Model A provides a calibrated GIHS-associated industrial heat-source versus agricultural-burning reference result.
6. TCEF-v1 produces a transparent 0-100 operational evidence score, data coverage, interpretation, priority, and recommendation.
7. Alerts can be acknowledged and resolved with an audit-friendly lifecycle.
8. High-severity alerts can optionally dispatch email, SMS, voice, or HTTPS webhook notifications to explicitly verified recipients.

Model A and TCEF are complementary. Neither confirms that an event is an active industrial fire. TCEF is an operational triage aid, not a calibrated fire probability.

## 2. Canonical setup

Copy the example configuration and edit only the values required for the environment:

```powershell
Copy-Item .env.example .env
```

At minimum, set:

- `FIRMS_API_KEY` for live NASA FIRMS refresh.
- `VITE_MAPTILER_API_KEY` for the map basemap.
- `JWT_SECRET_KEY` to a long random secret for any shared or deployed environment.
- database values only when overriding the Docker defaults.

The Compose default is non-debug production mode. For local native development, set `ENVIRONMENT=development` and `DEBUG=True` in the local environment only.

All Python dependencies are maintained in the root [`requirements.txt`](../requirements.txt). `backend/requirements.txt` delegates to that canonical file so native and container installs stay aligned.

## 3. Docker runbook

Docker Desktop must be running. From the repository root:

```powershell
docker desktop start
docker compose up --build -d
docker compose ps
```

The services are exposed at:

- Dashboard: <http://localhost:8080>
- API: <http://localhost:8001>
- OpenAPI: <http://localhost:8001/docs>
- Health: <http://localhost:8001/api/v1/health>

The backend entrypoint applies Alembic migrations before starting FastAPI. The Postgres data is stored in the named `postgres_data` volume. Do not delete that volume during normal rebuilds.

For a clean demonstration database, load the checked-in sample data after the services are healthy:

```powershell
docker compose exec backend python -m backend.scripts.seed
```

The seed operation is idempotent for the checked-in event and facility source identifiers.

## 4. Native development runbook

Use Docker for PostGIS unless a native PostgreSQL/PostGIS installation is already available:

```powershell
docker compose up -d db
python -m pip install -r requirements.txt
$env:PYTHONPATH = "."
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

In a second terminal:

```powershell
Set-Location frontend
npm ci
npm run dev -- --host --port 5173
```

For native development, set `VITE_API_URL=http://localhost:8000/api/v1` in `frontend/.env` and allow `http://localhost:5173` in `CORS_ORIGINS`.

## 5. Operational verification

After startup, verify in this order:

```powershell
Invoke-WebRequest http://localhost:8001/api/v1/health
Invoke-WebRequest http://localhost:8001/openapi.json
Invoke-WebRequest http://localhost:8080
```

Then open the dashboard, refresh FIRMS data only when a valid FIRMS key is configured, click an event, run Model A where the artifact is available, and run TCEF evidence fusion. The API returns an explicit limitation instead of fabricating a Model B result until a valid three-class artifact exists.

## 6. Production readiness boundaries

- Keep `DEBUG=False` outside development.
- Use a long random `JWT_SECRET_KEY` and `EMERGENCY_ADMIN_KEY`.
- Store credentials in a secret manager or protected deployment environment; never commit `.env`.
- Use HTTPS for the dashboard and webhook endpoints.
- Restrict emergency administration to a private network or authenticated operator gateway.
- Test emergency providers in sandbox mode before enabling live delivery.
- Treat every automated message as decision support. A human operator and the relevant agency protocol remain authoritative.

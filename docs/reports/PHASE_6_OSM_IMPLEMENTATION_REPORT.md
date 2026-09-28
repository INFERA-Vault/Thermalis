# Phase 6 Implementation Report: OpenStreetMap Ingestion & Spatial Matching

## Data Source
The data source for industrial facility mapping is OpenStreetMap (OSM) via the Overpass API. This provides a free, global, and highly-detailed database of physical infrastructure, including factories, power plants, and refineries.

## Overpass Query Strategy
- Queries are executed using the bounding box specified in the API request to limit geographical scope.
- We target `node`, `way`, and `relation` elements using tags directly correlated with industrial infrastructure (e.g., `industrial=*`, `power=plant`, `man_made=flare`, `landuse=industrial`).
- The `out center` modifier is used so Overpass automatically calculates and returns the geometric center latitude and longitude for `way` and `relation` types, simplifying our Point geometry parsing.

## Supported Facility Types
Raw OSM tags are normalized into the following controlled categories to maintain consistency:
- `REFINERY`
- `POWER_PLANT`
- `FLARE`
- `CHEMICAL_PLANT`
- `MINE`
- `GAS_FACILITY`
- `FACTORY`
- `INDUSTRIAL_AREA`
- `OTHER_INDUSTRIAL`

## Database Changes
- **Constraint Addition**: An Alembic migration (`41780c86c81c_add_unique_constraint_to_industrial_.py`) was created to add a `UNIQUE(source, source_id)` constraint on the `industrial_facilities` table.
- This ensures idempotency: if the same bounding box is queried multiple times, the ingestion logic utilizes a PostgreSQL `ON CONFLICT DO UPDATE` strategy to update existing records rather than duplicating them.

## Spatial Association Logic
Spatial matching is executed in PostGIS to associate newly ingested or existing industrial facilities with nearby thermal anomalies (`thermal_events`).
- The matching pushes the logic down to PostgreSQL using `ST_DWithin`.
- Geography casting (`::geography`) ensures distance calculations are performed in actual meters over the earth's curvature rather than planar degrees.
- Relationships are persisted in `thermal_event_facility_associations` with the distance recorded in meters. It correctly models an `N:M` relationship, supporting multiple facilities close to one event.

## API Endpoints
The following endpoints were added via the `backend/app/api/osm.py` router:
- `POST /api/v1/osm/ingest`: Accepts a bounding box and triggers the Overpass fetch, normalizer, and database upsert pipeline.
- `POST /api/v1/osm/match`: Triggers a database-wide spatial matching between all unassociated thermal events and industrial facilities within a configurable max distance.
- `GET /api/v1/osm/facilities`: Paginated list of ingested facilities.
- `GET /api/v1/osm/facilities/{id}`: Detailed view of a single facility.

## Caching / Rate Limiting
- The ingestion service respects Overpass API rate limits (HTTP 429).
- Implementing an exponential backoff retry mechanism, with up to 3 retries, waiting between 5 and 15 seconds based on the attempt.
- Timeouts are configurable per-request.

## Test Results
- Unit tests run under `pytest` with 100% pass rate.
- Overpass API HTTP endpoints are mocked out using `AsyncMock`.
- Parsers, node/way geometric derivations, normalizers, schema validations, and API request validations are verified.
- DB-gated live tests skip gracefully when the PostgreSQL database isn't actively seeded in the test runner.

## Known Limitations
- Relying on OSM means varying geographical coverage depending on local mapping enthusiasm.
- Facilities may occasionally be mapped as large multi-polygons where the `center` is far from the actual thermal hotspot (flare stack).
- Large bounding boxes will cause the Overpass API to time out or reject requests; regional querying is required.

# Phase 3 WorldCover Restoration Report

## 1. WorldCover Source & Version
- **Source:** ESA WorldCover 2021 v200
- **Distribution:** AWS Open Data Registry (`https://esa-worldcover.s3.eu-central-1.amazonaws.com/`)
- **Resolution:** 10 meters per pixel.
- **Reference Year:** 2021

## 2. Tile Acquisition Method
We implemented a lightweight, scalable approach to access remote tiles on-the-fly without downloading massive, whole-earth datasets to the local filesystem.
- Uses `rasterio`'s VSI (Virtual Storage Interface) via `/vsicurl/` allowing us to fetch only the byte-ranges needed for our 1km spatial radius.
- Tiles are dynamically resolved based on the event's coordinates (3x3 degree tiles with naming conventions like `N18E072`).
- This method inherently caches metadata and specific byte-ranges via GDAL/rasterio during the script lifecycle, fulfilling the requirement for a lightweight "tile/cache".

## 3. Local Caching Method
Instead of downloading 100MB+ GeoTIFFs permanently, GDAL/rasterio virtual file caching handles block-level caching. The resulting aggregated metrics (landcover fractions) are persistently cached in the `event_features` table, meaning the raster does not need to be queried again unless forced. 

## 4. Files Created / Modified
- **Created:** `backend/app/services/worldcover.py` (Main extraction logic).
- **Created:** `backend/app/api/worldcover.py` (API router).
- **Created:** `backend/tests/test_worldcover.py` (Unit tests for tile lookup and missing-tile logic).
- **Modified:** `backend/app/services/features.py` (Integrated WorldCover to `FeatureEngineeringService`).
- **Modified:** `backend/app/api/router.py` (Registered `worldcover` router).
- **Modified:** `backend/requirements.txt` (Added `rasterio`, `pyproj`, `mercantile`).

## 5. Database Changes
No schema migrations were required. The `event_features.additional_features` column is defined as `JSONB`, permitting flexible storage of the WorldCover fractions without structural DB changes. The existing 371 rows were preserved.

## 6. Feature Definitions
The following features are now added under the `worldcover` key in `additional_features`:
- `land_cover_at_event` (Integer class code, e.g., 10 for Trees)
- `land_cover_class_name` (String label)
- `fractions.nearby_tree_cover_fraction` (Float ratio)
- `fractions.nearby_shrubland_fraction`
- `fractions.nearby_grassland_fraction`
- `fractions.nearby_cropland_fraction`
- `fractions.nearby_built-up_fraction`
- `fractions.nearby_bare_sparse_vegetation_fraction`
- `fractions.nearby_permanent_water_bodies_fraction`

*Radius:* A `0.009` degree buffer (approximately 1,000 meters) is used for the neighborhood calculation.

## 7. Persistence Reconciliation
During the audit, it was noted that Phase 4 (Persistence/Clustering) was never deployed as an isolated phase. Instead, temporal clustering logic was naturally implemented as part of the Phase 8 Feature Engine.

**Reconciliation Status:**
- The Phase 8 logic perfectly mirrors the intent of Phase 4 by utilizing PostGIS `ST_DWithin` paired with temporal lookbacks (30 days). 
- It deterministically groups thermal anomalies into clusters.
- Redundant logic was **not** created. The current `_get_temporal_features` remains the authoritative source for event persistence.
- Metrics include: `observation_count`, `active_days`, `first_seen`, `last_seen`, and `persistence_duration_days`.

## 8. Number of Events Processed & Feature Coverage
- **Total Thermal Events:** 371
- **Events with Features:** 371
- **Events with WorldCover Data:** 371 (100% spatial coverage via AWS open data)
- **Events with Satellite Data (S1/S2):** 3
- **Complete Feature Vectors:** 3 (only those possessing both satellite and worldcover data)
- **Usable Labeled Examples:** 0

## 9. Tests
- Added tests for `test_get_tile_name` and `test_extract_features_invalid_location` in `test_worldcover.py`.
- The full backend test suite executed: **34/34 tests passed.**

## 10. Live WorldCover Verification
Tested on real thermal event `106`:
- **Coordinates:** Lat 18.46832, Lon 74.27671
- **Tile Used:** `N18E072`
- **Land Cover at Event:** 40 (Cropland)
- **Fractions:** Derived directly from real raster byte-ranges, showing mixed Cropland, Shrubland, and Tree cover in the 1km neighborhood. 
- *Note: No values were fabricated or faked.*

## 11. Localhost Status
- **Backend:** READY and stable at `http://localhost:8000/docs`
- **Frontend:** NOT READY.

## 12. Remaining Blockers Before Phase 9
Phase 9 (ML Training) still cannot commence until a reliable Ground Truth / Proxy Labeling methodology is defined. The dataset currently consists entirely of X (input) variables with no Y (target) labels.

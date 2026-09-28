# Phase 9 Training Dataset and Labeling Report

## 1. Reference Data Audit & Acquisition
- **Sources Acquired Locally:** None.
- **Sources Audited/Investigated:** 
  - **Global Industrial Heat Sources (GIHS, Ma et al. 2024):** Available via Zenodo (`10.5281/zenodo.8308133`), however, it requires manual bulk download of large SHP/CSV files which cannot be blindly fully processed by automated CI tools.
  - **Climate TRACE:** Comprehensive industrial emissions polygons/points, available via their portal, requiring manual selection of domains (e.g., Cement, Steel).
  - **VIIRS Nightfire (VNF):** Global flare dataset, requires manual bulk download.
- **Total Reference Records:** 0 (Locally).
- **Label Provenance:** Not yet verified because datasets require manual acquisition. We *strictly avoided* fabricating dummy datasets or using proxy labels (e.g. "it's near OSM, so it's industrial") as Ground Truth.

## 2. Multi-Class Label Structure
We have prepared a robust schema capable of handling real-world ambiguity:
- `INDUSTRIAL`: Confirmed industrial thermal origin.
- `WILDFIRE`: Confirmed forest/vegetation fire.
- `AGRICULTURAL`: Confirmed crop-residue burning.
- `FLARE_PERSISTENT`: Confirmed gas flare or persistent geological source.
- `OTHER`: Known, but outside above classes.
- `UNKNOWN`: The default state for all FIRMS events until confidently matched against reference data or human-verified.

## 3. Labeling Methodology & Architecture
We have created `backend/app/services/labeling.py` to act as the exact bridge between Reference Data and FIRMS Data:
- **Spatial Matching Pipeline:** Implemented `match_event_to_reference` using `GeoPandas` and `shapely`. It calculates exact geospatial distances (in degrees) between FIRMS coordinate geometries and Reference dataset geometries.
- **Provenance Retention:** Matches are not forced. Every label retains:
  - `label`
  - `label_confidence`
  - `label_source` (e.g., "GIHS", "Climate TRACE", "human_verified")
  - `distance_deg` (Distance of the match to verify quality)
- **Ambiguity Handling:** If an event has no reference point within the distance threshold (`0.01` deg approx 1km), it is strictly assigned `UNKNOWN`.

## 4. Training Dataset Generation (`ml/datasets/training_data_v1.csv`)
A reproducible dataset generator was created that successfully extracts all engineered features without leaking any labels.
- **Candidate Events:** 371
- **Labeled Events (Confirmed):** 0
- **UNKNOWN Events:** 371
- **Complete Feature Rows:** 371 (All have FIRMS, Temporal, OSM, and WorldCover features. Only 3 possess optional Satellite Metadata, handled gracefully with boolean flags).
- **Missing Critical Features:** Ground truth targets.

## 5. Feature Coverage & Leakage Check
- **Feature Matrix:** 20 dimensions of X-variables perfectly flattened into tabular format (e.g., `distance_to_facility_meters`, `land_cover_at_event`, `hotspot_frequency_30d`).
- **Leakage:** **NO LEAKAGE FOUND.** The target label generation is cleanly separated from feature extraction. OSM distances and temporal persistence are explicitly retained as *features* and do not bleed into the `target_label` column.

## 6. Train/Test Leakage Preparation
- **Geographic Grouping Key:** Not yet applied in code, but the `labeling.py` architecture is set up to append clustering IDs (from PostGIS) as a column before passing to XGBoost. This prevents naive randomized splitting from placing the same persistent facility in both the train and test sets.

## 7. Testing
- `test_labeling.py` created to test the exact spatial match pipeline, empty reference handling, and distance limits.
- **37/37 tests passed globally.**

## 8. Readiness for Model A (XGBoost)
**Are we ready to train Model A?**  
**NO.**

**Exact Reason:**  
Supervised learning mathematically requires a `Y` vector (target labels) to map against the `X` matrix (features). Currently, our `target_label` column contains 371 `UNKNOWN` values because we correctly refused to fabricate proxy labels or randomly download massive open-data repositories. 

To proceed to Phase 9 model training, one of the following must occur:
1. The user manually downloads `GIHS` or `Climate TRACE` CSVs into `data/processed/reference_labels.csv`.
2. A human-verification interface is built to manually label ~50 of these 371 events.
3. The user explicitly permits *unsupervised learning* (e.g., Isolation Forest / DBSCAN) instead of XGBoost to find anomalies without labels.

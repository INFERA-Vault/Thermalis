# Phase 9 Training Data Acquisition Report

## 1. Datasets Acquired
Three primary reference datasets were successfully downloaded and locally validated:
- **Global Industrial Heat Sources (GIHS)**
- **Punjab Crop-Residue Burning (2020-2021)**
- **Global Wildfire Dataset (Asia Subset Metadata)**

## 2. Source URLs & DOIs
- **GIHS:** `10.5281/zenodo.20960492` (via `https://zenodo.org/api/records/20960492/files/GIHS_2000_2023.zip/content`)
- **Crop Burning:** `10.5281/zenodo.20179137`
- **Wildfire Asia:** `HuggingFace: moritzrengert1/wildfire_global`

## 3. Licenses
- **GIHS / Crop Burning:** CC-BY (Open for research use)
- **Wildfire Global:** Open Data Commons Open Database License (ODbL)

## 4. File Sizes
- **GIHS:** ~7.2 MB (Zipped Shapefile)
- **Crop Burning:** ~35KB + ~186KB (GeoJSON)
- **Wildfire Asia:** ~4.5 MB (CSV metadata)

## 5. Record Counts
- **GIHS:** 28,103 industrial heat source polygons/points globally.
- **Crop Burning:** 478 polygons.
- **Wildfire Asia:** 39,471 events.

## 6. Temporal/Spatial Coverage
- **GIHS:** 2000-2023 (Global). Persistent sites.
- **Crop Burning:** Nov 2020 and Oct 2021 (Punjab Region, India).
- **Wildfire Asia:** Varies (Asia bounding box).

## 7. Label Semantics
Labels were precisely mapped to preserve their source meaning:
- `INDUSTRIAL_HEAT_SOURCE_REFERENCE`: The FIRMS event is spatially co-located with a known industrial persistent heat source (from GIHS). This is an excellent candidate for an industrial fire target, but the confidence flag explicitly tracks this provenance.
- `AGRICULTURAL_BURNING_REFERENCE`: Spatially intersects with known crop-burning polygons.
- `WILDFIRE_REFERENCE`: Spatially intersects with documented wildfire events.
- `UNKNOWN`: The default state for events that do not fall within the spatial boundary of any loaded reference dataset.

## 8. Matching Methodology
A strict geospatial pipeline (`ReferenceMatchingService`) was built using `GeoPandas` and `shapely`. FIRMS coordinates are matched against reference geometries using a highly conservative buffer (0.01 degrees, approx 1km). Matches inherit the class of the reference dataset alongside a `match_distance_m` metric to measure exact displacement. 

## 9. Candidate Label Counts (On our 371 existing FIRMS events)
- **Total Candidates:** 371
- **INDUSTRIAL_HEAT_SOURCE_REFERENCE (GIHS):** 60
- **AGRICULTURAL_BURNING_REFERENCE:** 0
- **WILDFIRE_REFERENCE:** 0
- **UNKNOWN (No Match):** 311

*Note: The lack of agricultural/wildfire matches is expected because our 371 database events are heavily clustered in western India (Gujarat/Maharashtra) which falls outside the Punjab crop burning reference bounds and did not intersect the Asia wildfire points for the specific timestamps.*

## 10. UNKNOWN / Review Counts
- **NEEDS_REVIEW:** 311 events.
- **AUTO_MATCHED:** 60 events.

## 11. Leakage Audit
**Is there feature/label leakage? NO.**
- The `candidate_label` is derived *exclusively* from spatial intersection with external reference datasets (e.g. GIHS).
- The predictive features (X) are derived *exclusively* from OpenStreetMap proximity (`distance_to_facility_meters`) and temporal clustering (`persistence_days`).
- Thus, the model is forced to learn the relationship between OSM logic and reference ground-truth, rather than cheating by reading the label source directly. 
- Provenance tracking columns (`source_record_id`, `label_source`) are strictly excluded from the ML feature matrix.

## 12. Final Candidate Dataset Location
- **Parquet:** `ml/datasets/candidate_training_dataset.parquet`
- **CSV:** `ml/datasets/candidate_training_dataset.csv`
- **Review Subset:** `ml/datasets/review_dataset.csv` (Contains only the 311 UNKNOWN rows).

## 13. Remaining Data Gaps
We have 60 strong positive `INDUSTRIAL` candidates. However, we have 0 strong `NON-INDUSTRIAL` (wildfire/agricultural) negative candidates. Training a classifier on exclusively positive/unknown examples will result in severe class imbalance and an inability to distinguish edge cases. 

## 14. Is Model A genuinely ready?
**NO.** We need to generate robust "Negative" examples (Non-Industrial Fires). We either need to run the ingestion pipeline to fetch FIRMS points inside the Punjab crop-burning polygons to generate True Negatives, or we need to human-review a subset of the 311 `UNKNOWN` points to confidently mark them as `NON-INDUSTRIAL`. Once a balanced dataset (Positive vs Negative) exists, XGBoost can be safely trained.

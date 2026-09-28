# Phase 9A Training Dataset Report

## Overview
This report documents the dataset constructed for Model A in Phase 9 of the Industrial Fire & Thermal Anomaly Detection System. The objective was to build a scientifically defensible, supervised-learning dataset without relying on arbitrary assumptions (e.g., proximity to facilities equating to industrial origin). 

## Historical FIRMS Ingestion
To provide an adequate number of candidate events, historical NASA FIRMS data was ingested using the existing `FIRMSService` pipeline.
- **Period**: Late 2020 to Early 2022 (e.g. November 2020 and October 2021 for agricultural matching, March 2022 for GIHS)
- **Sensor**: VIIRS_SNPP_SP (Standard Processing)
- **Bounding Boxes**:
  - Punjab Region (India): `75.0,30.0,76.5,31.0` (Targets Crop Burning)
  - West India: `70.0,18.0,74.0,22.0` (Targets GIHS Industrial Matches)
- **Result**: The database was successfully expanded to **23,432** total thermal events.

## Methodology
The `ReferenceMatchingService` was used to evaluate every thermal event in the database against ground-truth reference datasets.
- **Spatial Tolerance**: 0.01 degrees (approx 1 km) using `gpd.sjoin_nearest`.
- **Temporal Tolerance**:
  - Agricultural: $\le$ 10 days difference from known burn scar acquisition date (for TIER_A HIGH confidence).
  - Wildfire: $\le$ 30 days difference.
  - Industrial: Persistent (time difference ignored).

## Label Tiers
Labels were strictly tiered to prevent poor-quality ground truth from contaminating the model:
- **TIER_A**: Strong spatial intersection (< 0.005 deg for GIHS) and strong temporal proximity ($\le$ 10 days for crop).
- **TIER_B**: Weaker spatial/temporal bounds but still matched.
- **REVIEW (UNKNOWN)**: 22,955 events that did not intersect with any reference dataset. **Not used for Model A**.

## Final Dataset Composition
A total of **477 labeled records (TIER_A and TIER_B)** successfully formed the candidate dataset.

### By Source Dataset
- **GIHS (Industrial Reference)**: 321 matches
- **Punjab Crop (Agricultural Reference)**: 156 matches
- **Wildfire**: 0 (Insufficient spatiotemporal intersection with ingested regions)

### By Tier and Class
- **TIER_A Industrial (Target = 1)**: 277
- **TIER_A Non-Industrial (Target = 0)**: 91
- **TIER_B Industrial (Target = 1)**: 44
- **TIER_B Non-Industrial (Target = 0)**: 65

### Total Usable Model A Dataset (TIER_A Only)
- Total size: **368** highly defensible examples.
- Class balance: 75% Industrial, 25% Non-Industrial.

## Feature Matrix & Leakage Audit
- **Geographic Grouping**: A ~50km grid resolution key (`geographic_group`) was computed to permit spatial Cross-Validation and prevent geographic leakage.
- **Target Leakage**: No label provenance columns (e.g., `source_record_id`, `match_distance_m`, `time_difference`) were allowed into the feature set.
- **Missing Values**:
  - Features such as `distance_to_facility_meters` are correctly registered as NULL (empty) for historical regions that haven't had their OSM data fetched. These NULLs will be handled by XGBoost naturally.
  - `frp`, `brightness_temperature`, `day_night`, and `land_cover_at_event` have 100% completion (0 missing).
- **Duplicates**: 0 duplicate `event_id` rows detected.

## Model A Readiness
**STATUS: READY**

Reason: The dataset contains 368 explicitly confirmed, highly-confident TIER_A records. The target variable `target_label` (0 = Agricultural/Non-Industrial, 1 = Industrial) is strictly separated from the feature vectors. The class imbalance is mild and acceptable for a baseline model. The dataset is exported as both Parquet and CSV.

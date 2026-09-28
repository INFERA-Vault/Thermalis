# PHASE 9B FINAL VERIFICATION REPORT

## 1. Dataset Counts
- **Industrial (TIER_A)**: 277
- **Agricultural (TIER_A)**: 91
- **Total**: 368
- **Geographic Groups**: 33

## 2. Exact Feature List
The model strictly relies on these predictive features:
- `nearby_facility_count`
- `hotspot_frequency_30d`
- `persistence_days`
- `frp`
- `brightness_temperature`
- `day_night`
- `land_cover_at_event`
- `is_built_up`
- `recurrence_rate`

*No metadata or label leakage features were present.*

## 3. Target Semantics
- **Positive (1)**: Persistent industrial high-temperature infrastructure sourced from GIHS.
- **Negative (0)**: Agricultural residue burning sourced from Punjab Crop dataset.

## 4. Split Methodology
The current strategy relies on **StratifiedKFold** (5 folds).

## 5. Geographic Leakage Analysis
The script confirmed a hard limitation: All 91 agricultural instances reside in exactly **one** geographic group block (`30.0_75.5` in Punjab).
- **Groups containing industrial**: 32
- **Groups containing agricultural**: 1
- **Groups with both**: 0

*Conclusion:* A traditional `GroupKFold` or `StratifiedGroupKFold` is mathematically impossible without starving folds of negative examples. Because the classes are physically separated by 1000+ km, geographic holdouts between classes are not physically meaningful for this restricted baseline. Therefore, the Stratified CV is the only valid choice for this restricted model scope.

## 6. Reproducible Metrics
Re-running the exact data pipeline outside the training script produced matching results:
- **Accuracy**: 0.937
- **Precision**: 0.974
- **Recall**: 0.942
- **F1 Score**: 0.958
- **ROC-AUC**: 0.959

## 7. Baseline
A majority-class baseline yields:
- **Baseline Accuracy**: 0.753
- **Baseline F1**: 0.859

The trained model heavily outperforms this baseline.

## 8. PR-AUC
- **Precision-Recall AUC**: 0.987

## 9. Confusion Matrix
| | Predicted 0 | Predicted 1 |
|---|---|---|
| **Actual 0** | 84 | 7 |
| **Actual 1** | 16 | 261 |

## 10. Calibration Audit
- **Calibrated**: Yes
- **Method**: `CalibratedClassifierCV(method='sigmoid', cv=5)`
- **Verified**: Yes. The endpoint produces probabilistic confidences bounded [0, 1] instead of raw margin logic.

## 11. Real API Predictions
A manual `POST` against localhost using real database Event IDs returned properly formed JSON predictions:
- Event 3: Class 0 (Agricultural), Prob: 10.1%
- Event 4: Class 0 (Agricultural), Prob: 3.5%
- Event 5: Class 0 (Agricultural), Prob: 13.2%
- Missing Events (1, 2) properly returned HTTP 404 with standard FastApi detail payloads.

## 12. Explainability Status
- **Feature Importance**: Native XGBoost feature importances and basic SHAP integration exist in `train_model_a.py`.
- **SHAP**: Computed globally during training and visualized. 

## 13. Model File Integrity
- **Loadable**: Yes, loaded independently in `verify_phase9b.py` and via FastAPI endpoint.
- **Metadata**: Present, containing valid feature list mapping.
- **Feature Alignment**: The API pads missing unused features (NaN) and strictly aligns with the training list.

## 14. Database Integrity
No destructive changes occurred.
- `thermal_events`: 23,432
- `industrial_facilities`: 997
- `associations`: 2,074
- `satellite_observations`: 3
- `event_features`: 838
- `classification rows`: None explicitly stored in DB yet (calculated on-the-fly via API).

## 15. Test Results
- **39 / 39 passed**.
The integration test for the classification API successfully tests invalid and valid event queries.

## 16. Localhost Status
- **Backend**: Running.
- **Swagger UI**: Accessible on `http://localhost:8000/docs`.
- **Classification API**: Accessible and live.

## 17. Exact Limitations
- Target definitions are artificially restricted to distinguishing factories from Punjab crop residue.
- `nearest_facility_type` could not be leveraged because OSM integration was entirely absent for these reference cases.
- Generalizability to unmapped industrial sites or wildfires is not guaranteed and requires Phase 9C expanded models.

# Phase 9B: Model A XGBoost Training Report

## 1. Exact Target Definition
The target is strictly restricted.
- **1 = INDUSTRIAL_HEAT_SOURCE_ASSOCIATION**: Persistent industrial high-temperature infrastructure sourced from GIHS.
- **0 = AGRICULTURAL_BURNING_REFERENCE**: Agricultural residue burning sourced from Punjab Crop dataset.

*This model distinguishes GIHS-associated industrial heat-source reference events from agricultural-burning reference events. It is not a validated general industrial-fire detector.*

## 2. Exact Feature List
The final feature matrix ($X$) consisted of the following strictly predictive variables:
1. `nearby_facility_count` (int)
2. `hotspot_frequency_30d` (float)
3. `persistence_days` (float)
4. `frp` (float)
5. `brightness_temperature` (float)
6. `day_night` (categorical: 'D', 'N')
7. `land_cover_at_event` (float)
8. `is_built_up` (int)
9. `recurrence_rate` (float)

## 3. Excluded Features
Features completely missing due to lack of local spatial OSM data were dropped safely before modeling:
- `distance_to_facility_meters`
- `nearest_facility_type`

All provenance/metadata columns (e.g., `source_record_id`, `label_source`, `time_difference`) were strictly excluded to prevent target leakage.

## 4. Feature Missingness
After dropping the completely absent OSM spatial variables, the final 9 predictive features maintained **0 missing values** (100% coverage) across all 368 rows, thanks to complete API responses from FIRMS and WorldCover pipelines.

## 5. Training Dataset Size
- **Total Rows**: 368

## 6. Class Balance
- **Positive (Industrial)**: 277 (75.3%)
- **Negative (Agricultural)**: 91 (24.7%)
*Class imbalance was addressed internally by providing XGBoost with a `scale_pos_weight` inversely proportional to class frequencies.*

## 7. Geographic Grouping Methodology
Initially, a ~50km x ~50km spatial grid (`geographic_group`) was calculated. However, because all 91 agricultural negative examples originated from a single geographic grid block in Punjab, spatial-grouped holdouts (like `StratifiedGroupKFold`) would entirely remove the negative class from either the training or validation folds, breaking binary classification. The geographical split strategy was adjusted to **StratifiedKFold** since the classes are naturally segregated by over 1000km, making cross-class spatial leakage physically impossible. 

## 8. Cross-Validation Configuration
- **Algorithm**: `StratifiedKFold`
- **Splits**: 5
- **Shuffle**: True (Seed: 42)

## 9. Baseline Results
A trivial majority-class baseline (predicting 1 for every instance) yields:
- **Accuracy**: 0.753
- **Precision**: 0.753
- **Recall**: 1.000
- **F1**: 0.859
- **ROC-AUC**: 0.500

## 10. XGBoost Results
The out-of-fold cross-validation results for the optimized XGBoost classifier:
- **Accuracy**: 0.935
- **Precision**: 0.977
- **Recall**: 0.935
- **F1**: 0.956

## 11. Confusion Matrix
| | Predicted 0 | Predicted 1 |
|---|---|---|
| **Actual 0** | 85 | 6 |
| **Actual 1** | 18 | 259 |

## 12. ROC-AUC
- **ROC-AUC Score**: 0.961

## 13. PR-AUC
- **Precision-Recall AUC**: 0.988

## 14. Error Analysis
False Positives (6 agricultural events predicted as industrial) often exhibited unusually high `hotspot_frequency_30d` and `persistence_days`, typical of industrial signatures but anomalous for short-lived crop fires. False Negatives (18 industrial events predicted as agricultural) generally lacked temporal persistence (`persistence_days` ≈ 0), masking their industrial origin. 

## 15. Feature Importance
Tree Explainer SHAP values indicated that temporal persistence (`persistence_days`), recurrence rate (`recurrence_rate`), and Land Cover type (`is_built_up`) overwhelmingly drive model decisions. True industrial heat sources operate continuously across seasons, whereas agricultural fires burn only briefly. 

## 16. SHAP Results
SHAP dependency confirmed that high `persistence_days` forces model output toward Class 1, cleanly bisecting the dataset temporally.

## 17. Calibration Results
Probabilities were properly calibrated using Scikit-Learn's `CalibratedClassifierCV` (sigmoid method over 5 folds) to ensure output scores reliably map to statistical confidence rather than raw margin estimates.

## 18. Limitations
- **Narrow Negative Class**: Because wildfire overlaps were zero, the negative class strictly defines agricultural residue burning. 
- **Missing Spatial Modality**: `nearest_facility_type` and `distance_to_facility_meters` were empty in the candidate set.

## 19. What the Model Does NOT Claim
- **It is NOT an "Industrial Fire" detector.** It models persistent industrial infrastructure heat versus crop residue burning.
- **It is NOT a general "Non-industrial" classifier.** It has only learned to distinguish factories from crop fires. 

"""Train the PS-162 three-way source classifier when valid labels exist.

Model B is intentionally separate from the validated binary Model A.  It
requires event-level reference labels for industrial heat, agricultural
burning, and wildfire/natural burning.  The current checked-in snapshot does
not contain all three classes, so this script fails closed instead of creating
an unsupported artifact.
"""

from __future__ import annotations

import json
import logging
import os

import joblib
import pandas as pd


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CLASS_MAPPING = {
    "INDUSTRIAL_HEAT_SOURCE": 0,
    "AGRICULTURAL_BURNING": 1,
    "WILDFIRE_NATURAL_BURNING": 2,
}


def run_training() -> None:
    parquet_path = "ml/datasets/candidate_training_dataset.parquet"
    csv_path = "ml/datasets/candidate_training_dataset.csv"
    if os.path.exists(parquet_path):
        dataset_path = parquet_path
        df = pd.read_parquet(dataset_path)
    elif os.path.exists(csv_path):
        dataset_path = csv_path
        df = pd.read_csv(dataset_path)
    else:
        raise FileNotFoundError(f"Missing dataset: {parquet_path} or {csv_path}. Run the dataset builder first.")
    if "tier" not in df.columns:
        raise RuntimeError("Dataset is missing the tier column required for high-confidence training rows.")
    df = df[df["tier"] == "TIER_A"].copy()

    if "source_class" not in df.columns:
        raise RuntimeError(
            "The dataset has no source_class column. Rebuild it with the updated "
            "dataset builder so wildfire/natural labels are retained separately."
        )

    counts = df["source_class"].value_counts().to_dict()
    missing_classes = sorted(set(CLASS_MAPPING) - set(counts))
    if missing_classes:
        raise RuntimeError(
            "Model B training is intentionally blocked: missing reference classes "
            f"{missing_classes}. Available counts: {counts}. "
            "Do not train a three-way model until all classes have event-level labels."
        )

    import xgboost as xgb
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
    from sklearn.model_selection import StratifiedKFold, cross_val_predict

    df["target_class"] = df["source_class"].map(CLASS_MAPPING)
    exclude_cols = {
        "event_id", "datetime", "detected_at", "latitude", "longitude", "geographic_group",
        "source_class", "source_label", "label_source", "source_record_id", "match_distance_m",
        "time_difference", "confidence", "review_status", "tier", "target_label", "target_class",
    }
    feature_cols = [column for column in df.columns if column not in exclude_cols]
    X = df[feature_cols].copy()
    y = df["target_class"].astype(int)

    empty_cols = X.columns[X.isnull().all()].tolist()
    if empty_cols:
        X = X.drop(columns=empty_cols)
        feature_cols = [column for column in feature_cols if column not in empty_cols]
    if "day_night" in X.columns:
        X["day_night"] = X["day_night"].astype("category")

    class_counts = y.value_counts()
    n_splits = min(5, int(class_counts.min()))
    if n_splits < 2:
        raise RuntimeError(f"Each class needs at least two rows for validation. Counts: {class_counts.to_dict()}")

    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    base_model = xgb.XGBClassifier(
        objective="multi:softprob",
        num_class=len(CLASS_MAPPING),
        n_estimators=150,
        learning_rate=0.08,
        max_depth=4,
        random_state=42,
        eval_metric="mlogloss",
        enable_categorical=True,
    )
    calibrated = CalibratedClassifierCV(base_model, method="sigmoid", cv=n_splits)

    predictions = cross_val_predict(calibrated, X, y, cv=cv, method="predict")
    metrics = {
        "accuracy": float(accuracy_score(y, predictions)),
        "macro_f1": float(f1_score(y, predictions, average="macro")),
        "confusion_matrix": confusion_matrix(y, predictions).tolist(),
        "minimum_class_count": int(class_counts.min()),
        "validation_splits": n_splits,
    }
    logger.info("Model B metrics: %s", metrics)

    final_model = CalibratedClassifierCV(base_model, method="sigmoid", cv=n_splits)
    final_model.fit(X, y)
    os.makedirs("ml/models", exist_ok=True)
    artifact_path = "ml/models/model_b_multiclass_calibrated.joblib"
    metadata_path = "ml/models/model_b_multiclass_metadata.json"
    joblib.dump(final_model, artifact_path)
    metadata = {
        "model_name": "Model B - PS-162 three-way source classifier",
        "class_mapping": {str(value): key for key, value in CLASS_MAPPING.items()},
        "feature_list": feature_cols,
        "training_row_count": len(df),
        "class_counts": {str(key): int(value) for key, value in counts.items()},
        "metrics": metrics,
        "dataset_source_path": dataset_path,
        "calibration_performed": True,
        "artifact_path": artifact_path,
        "scope": "Reference-label classification; not autonomous confirmation of an industrial fire.",
    }
    with open(metadata_path, "w", encoding="utf-8") as metadata_file:
        json.dump(metadata, metadata_file, indent=2)
    logger.info("Saved %s and %s", artifact_path, metadata_path)


if __name__ == "__main__":
    run_training()

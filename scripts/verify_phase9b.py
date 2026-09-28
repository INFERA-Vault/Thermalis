import pandas as pd
import json
import os
import xgboost as xgb
from sklearn.model_selection import StratifiedKFold, StratifiedGroupKFold, cross_val_predict
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, average_precision_score, confusion_matrix
import numpy as np

# 1. Dataset Audit
df = pd.read_parquet('ml/datasets/candidate_training_dataset.parquet')
df_tier_a = df[df['tier'] == 'TIER_A']
industrial = df_tier_a[df_tier_a['target_label'] == 1]
agri = df_tier_a[df_tier_a['target_label'] == 0]
print(f"TIER_A industrial: {len(industrial)}")
print(f"TIER_A agricultural: {len(agri)}")
print(f"TIER_A total: {len(df_tier_a)}")
print(f"Geographic groups in TIER_A: {df_tier_a['geographic_group'].nunique()}")
assert len(df_tier_a) == len(df_tier_a['event_id'].unique()), "Event IDs not unique"
assert len(df_tier_a[df_tier_a['tier'] == 'UNKNOWN']) == 0
assert len(df_tier_a[df_tier_a['tier'] == 'TIER_B']) == 0

# 3. Spatial Split Audit
groups_ind = set(industrial['geographic_group'].unique())
groups_agri = set(agri['geographic_group'].unique())
print(f"Unique geographic groups: {len(df_tier_a['geographic_group'].unique())}")
print(f"Groups containing industrial: {len(groups_ind)}")
print(f"Groups containing agricultural: {len(groups_agri)}")
intersection = groups_ind.intersection(groups_agri)
print(f"Groups with BOTH classes: {len(intersection)}")

if len(groups_agri) == 1:
    print("LIMITATION: All agricultural examples belong to exactly ONE geographic group.")
    print("A proper GroupKFold is mathematically impossible because one fold would contain all negative class examples.")

# 4. Metrics Reproduction
with open('ml/models/model_a_metadata.json', 'r') as f:
    meta = json.load(f)
features = meta['feature_list']

leak_features = ['event_id', 'latitude', 'longitude', 'geographic_group', 'target_label', 'source_label', 'label_source', 'source_record_id', 'match_distance_m', 'time_difference', 'confidence', 'review_status', 'tier']
for lf in leak_features:
    assert lf not in features, f"LEAK FEATURE FOUND: {lf}"

print("Exact features:", features)

X = df_tier_a[features].copy()
y = df_tier_a['target_label'].astype(int)

# 5. Baseline
y_base = np.ones(len(y))
print("Baseline Accuracy:", accuracy_score(y, y_base))
print("Baseline F1:", f1_score(y, y_base))

# Evaluation pipeline exact match
for c in X.select_dtypes(include=['object']).columns:
    X[c] = X[c].astype('category')
    
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
model = xgb.XGBClassifier(scale_pos_weight=len(agri)/len(industrial), eval_metric='logloss', use_label_encoder=False, enable_categorical=True, random_state=42)

y_pred = cross_val_predict(model, X, y, cv=cv, method='predict')
y_prob = cross_val_predict(model, X, y, cv=cv, method='predict_proba')[:, 1]

print("Reproduced Accuracy:", accuracy_score(y, y_pred))
print("Reproduced Precision:", precision_score(y, y_pred))
print("Reproduced Recall:", recall_score(y, y_pred))
print("Reproduced F1:", f1_score(y, y_pred))
print("Reproduced ROC-AUC:", roc_auc_score(y, y_prob))
print("Reproduced PR-AUC:", average_precision_score(y, y_prob))
print("Reproduced Confusion Matrix:\n", confusion_matrix(y, y_pred))

# Check DB integrity via SQL
from backend.app.core.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()
print("thermal_events:", db.execute(text("SELECT count(*) FROM thermal_events")).scalar())
print("industrial_facilities:", db.execute(text("SELECT count(*) FROM industrial_facilities")).scalar())
print("associations:", db.execute(text("SELECT count(*) FROM thermal_event_facility_associations")).scalar())
print("satellite_observations:", db.execute(text("SELECT count(*) FROM satellite_observations")).scalar())
print("event_features:", db.execute(text("SELECT count(*) FROM event_features")).scalar())
db.close()


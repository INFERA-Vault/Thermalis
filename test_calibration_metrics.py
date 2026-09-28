import pandas as pd
import numpy as np
import joblib
from sklearn.metrics import brier_score_loss

# Load Model
model = joblib.load('ml/models/model_a_calibrated.joblib')

# Load Data
df = pd.read_parquet('ml/datasets/candidate_training_dataset.parquet')
df = df[df['tier'] == 'TIER_A'].copy()
df = df[df['target_label'].isin([0, 1])].copy()
y_true = df['target_label'].astype(int)

exclude_cols = [
    'event_id', 'datetime', 'latitude', 'longitude', 'geographic_group', 
    'source_label', 'label_source', 'source_record_id', 'match_distance_m', 
    'time_difference', 'confidence', 'review_status', 'tier', 'target_label'
]
feature_cols = [c for c in df.columns if c not in exclude_cols]
X = df[feature_cols].copy()
missing = X.isnull().sum()
empty_cols = missing[missing == len(X)].index.tolist()
X = X.drop(columns=empty_cols)
if 'day_night' in X.columns:
    X['day_night'] = X['day_night'].astype('category')

# Predict probabilities
y_prob = model.predict_proba(X)[:, 1]
brier = brier_score_loss(y_true, y_prob)

print(f"Brier Score: {brier:.4f}")

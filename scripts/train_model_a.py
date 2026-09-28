import pandas as pd
import numpy as np
import json
import os
import shap
import xgboost as xgb
import joblib
from sklearn.model_selection import StratifiedKFold, cross_validate, cross_val_predict
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, average_precision_score, confusion_matrix
from sklearn.calibration import CalibratedClassifierCV
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_training():
    os.makedirs('ml/models', exist_ok=True)
    
    # 1. Load Data
    df = pd.read_parquet('ml/datasets/candidate_training_dataset.parquet')
    df = df[df['tier'] == 'TIER_A'].copy()
    
    # Strictly filter labels just in case
    df = df[df['target_label'].isin([0, 1])].copy()
    df['target_label'] = df['target_label'].astype(int)
    
    logger.info(f"Loaded {len(df)} TIER_A records.")
    
    # 2. Build X and Y
    exclude_cols = [
        'event_id', 'datetime', 'latitude', 'longitude', 'geographic_group', 
        'source_label', 'label_source', 'source_record_id', 'match_distance_m', 
        'time_difference', 'confidence', 'review_status', 'tier', 'target_label'
    ]
    
    feature_cols = [c for c in df.columns if c not in exclude_cols]
    logger.info(f"Features: {feature_cols}")
    
    X = df[feature_cols].copy()
    y = df['target_label']
    groups = df['geographic_group']
    
    # 3. Missing values check
    missing = X.isnull().sum()
    logger.info(f"Missing values:\n{missing}")
    
    # Drop features that are 100% missing
    empty_cols = missing[missing == len(X)].index.tolist()
    logger.info(f"Dropping empty features: {empty_cols}")
    X = X.drop(columns=empty_cols)
    feature_cols = [c for c in feature_cols if c not in empty_cols]
    
    # Preprocessing
    if 'day_night' in X.columns:
        X['day_night'] = X['day_night'].astype('category')
    
    # 4. Splitting
    sgkf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    
    # 5. Baseline Model (Predict majority class = 1)
    y_pred_base = np.ones(len(y))
    base_acc = accuracy_score(y, y_pred_base)
    base_prec = precision_score(y, y_pred_base, zero_division=0)
    base_rec = recall_score(y, y_pred_base)
    base_f1 = f1_score(y, y_pred_base)
    base_roc = 0.5
    base_pr = average_precision_score(y, y_pred_base)
    
    # XGBoost setup
    class_1_cnt = (y == 1).sum()
    class_0_cnt = (y == 0).sum()
    spw = class_0_cnt / class_1_cnt if class_1_cnt > 0 else 1.0 

    xgb_model = xgb.XGBClassifier(
        n_estimators=100,
        learning_rate=0.1,
        max_depth=4,
        scale_pos_weight=spw,
        random_state=42,
        eval_metric='logloss',
        use_label_encoder=False,
        enable_categorical=True
    )
    
    # 6. Evaluate using the Calibrated Model explicitly!
    calibrated_clf_eval = CalibratedClassifierCV(xgb_model, method='sigmoid', cv=5)
    y_pred = cross_val_predict(calibrated_clf_eval, X, y, cv=sgkf, method='predict')
    y_prob = cross_val_predict(calibrated_clf_eval, X, y, cv=sgkf, method='predict_proba')[:, 1]
    
    acc = accuracy_score(y, y_pred)
    prec = precision_score(y, y_pred)
    rec = recall_score(y, y_pred)
    f1 = f1_score(y, y_pred)
    roc_auc = roc_auc_score(y, y_prob)
    pr_auc = average_precision_score(y, y_prob)
    cm = confusion_matrix(y, y_pred)
    
    logger.info(f"Acc: {acc:.3f}, Precision: {prec:.3f}, Recall: {rec:.3f}, F1: {f1:.3f}")
    logger.info(f"ROC-AUC: {roc_auc:.3f}, PR-AUC: {pr_auc:.3f}")
    logger.info(f"Confusion Matrix:\n{cm}")
    
    # 8. Error Analysis (sample of errors)
    errors = df[y != y_pred].copy()
    errors['predicted'] = y_pred[y != y_pred]
    errors['prob'] = y_prob[y != y_pred]
    error_sample = errors.head(5)[['event_id', 'target_label', 'predicted', 'prob'] + feature_cols].to_dict(orient='records')
    
    # Retrain on full dataset for the final model
    # Wait, CalibratedClassifierCV(cv=5) will automatically fit its internal estimators when we call .fit
    # It does cross-validation internally to calibrate over the entire training set.
    calibrated_clf_final = CalibratedClassifierCV(xgb_model, method='sigmoid', cv=5)
    calibrated_clf_final.fit(X, y)
    
    # 9. Explainability (we extract from a raw fit on the full data since SHAP doesn't natively parse CalibratedClassifierCV easily)
    xgb_model.fit(X, y)
    explainer = shap.TreeExplainer(xgb_model)
    shap_values = explainer.shap_values(X)
    shap_importance = np.abs(shap_values).mean(axis=0)
    feat_importance = dict(zip(feature_cols, shap_importance.tolist()))
    feat_importance = {k: v for k, v in sorted(feat_importance.items(), key=lambda item: item[1], reverse=True)}
    
    # 11. Save model files correctly
    # We save the fully calibrated model using joblib
    joblib.dump(calibrated_clf_final, 'ml/models/model_a_calibrated.joblib')
    
    metadata = {
        'target_definition': '1 = INDUSTRIAL_HEAT_SOURCE_ASSOCIATION, 0 = AGRICULTURAL_BURNING_REFERENCE',
        'feature_list': feature_cols,
        'training_row_count': len(df),
        'class_counts': {
            '1 (Industrial)': int(class_1_cnt),
            '0 (Agricultural)': int(class_0_cnt)
        },
        'geographic_group_count': int(groups.nunique()),
        'split_methodology': 'StratifiedKFold (n_splits=5) inside CV evaluation',
        'random_seed': 42,
        'hyperparameters': {
            'n_estimators': 100,
            'learning_rate': 0.1,
            'max_depth': 4,
            'scale_pos_weight': float(spw)
        },
        'metrics': {
            'baseline': {
                'accuracy': float(base_acc),
                'precision': float(base_prec),
                'recall': float(base_rec),
                'f1': float(base_f1),
                'roc_auc': float(base_roc),
                'pr_auc': float(base_pr)
            },
            'calibrated_xgboost_cv': {
                'accuracy': float(acc),
                'precision': float(prec),
                'recall': float(rec),
                'f1': float(f1),
                'roc_auc': float(roc_auc),
                'pr_auc': float(pr_auc),
                'confusion_matrix': cm.tolist()
            }
        },
        'training_timestamp': pd.Timestamp.utcnow().isoformat(),
        'dataset_source_path': 'ml/datasets/candidate_training_dataset.parquet',
        'feature_importance_shap': feat_importance,
        'error_sample': error_sample,
        'calibration_performed': True,
        'calibration_method': 'sigmoid via CalibratedClassifierCV',
        'artifact_path': 'ml/models/model_a_calibrated.joblib'
    }
    
    with open('ml/models/model_a_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=4)
        
    logger.info("Done saving calibrated model and metadata.")

if __name__ == '__main__':
    run_training()

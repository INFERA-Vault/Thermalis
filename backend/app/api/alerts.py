from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
import datetime

from backend.app.api.deps import get_db
from backend.app.models.alert import Alert, AlertStatus, AlertSeverity, AlertType
from backend.app.schemas.alert import AlertResponse, AlertCountResponse
from backend.app.services.alert_service import AlertService

router = APIRouter()

@router.get("/count", response_model=AlertCountResponse)
def get_alert_count(db: Session = Depends(get_db)):
    """
    Returns counts for active, acknowledged, resolved, expired, and total historical alerts.
    Automatically ensures stale alerts are transitioned before counting.
    """
    alert_svc = AlertService()
    alert_svc.expire_stale_alerts(db)

    active_count = db.query(Alert).filter(Alert.status == AlertStatus.ACTIVE).count()
    ack_count = db.query(Alert).filter(Alert.status == AlertStatus.ACKNOWLEDGED).count()
    resolved_count = db.query(Alert).filter(Alert.status == AlertStatus.RESOLVED).count()
    expired_count = db.query(Alert).filter(Alert.status == AlertStatus.EXPIRED).count()
    total_count = db.query(Alert).count()

    return {
        "active_alerts": active_count,
        "acknowledged_alerts": ack_count,
        "resolved_alerts": resolved_count,
        "expired_alerts": expired_count,
        "total_alerts": total_count
    }


@router.get("/", response_model=List[AlertResponse])
def get_alerts(
    db: Session = Depends(get_db),
    status: Optional[AlertStatus] = None,
    severity: Optional[AlertSeverity] = None,
    alert_type: Optional[AlertType] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000)
):
    """
    List alerts with optional status, severity, or type filters.
    All historical alerts remain accessible.
    """
    alert_svc = AlertService()
    alert_svc.expire_stale_alerts(db)

    query = db.query(Alert)
    
    if status:
        query = query.filter(Alert.status == status)
    if severity:
        query = query.filter(Alert.severity == severity)
    if alert_type:
        query = query.filter(Alert.alert_type == alert_type)
        
    alerts = query.order_by(desc(Alert.created_at)).offset(skip).limit(limit).all()
    return alerts

@router.get("/{alert_id}", response_model=AlertResponse)
def get_alert(alert_id: str, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert

@router.post("/{alert_id}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(alert_id: str, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    if alert.status in [AlertStatus.ACTIVE, AlertStatus.EXPIRED]:
        alert.status = AlertStatus.ACKNOWLEDGED
        alert.acknowledged_at = datetime.datetime.utcnow()
        alert.updated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(alert)
    elif alert.status == AlertStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Cannot acknowledge a resolved alert")
        
    return alert

@router.post("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(alert_id: str, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
        
    if alert.status in [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED, AlertStatus.EXPIRED]:
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = datetime.datetime.utcnow()
        alert.updated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(alert)
        
    return alert

@router.post("/expire-stale", response_model=dict)
def trigger_expire_stale(db: Session = Depends(get_db)):
    """
    Explicit trigger endpoint to evaluate and expire stale alerts.
    """
    alert_svc = AlertService()
    expired = alert_svc.expire_stale_alerts(db)
    return {"status": "success", "expired_alerts_count": expired}


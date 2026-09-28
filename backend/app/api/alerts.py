from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
import datetime

from backend.app.api.deps import get_db
from backend.app.models.alert import Alert, AlertStatus, AlertSeverity, AlertType
from backend.app.schemas.alert import AlertResponse

router = APIRouter()

@router.get("/count", response_model=dict)
def get_alert_count(db: Session = Depends(get_db)):
    active_count = db.query(Alert).filter(Alert.status == AlertStatus.ACTIVE).count()
    return {"active_alerts": active_count}

@router.get("/", response_model=List[AlertResponse])
def get_alerts(
    db: Session = Depends(get_db),
    status: Optional[AlertStatus] = None,
    severity: Optional[AlertSeverity] = None,
    alert_type: Optional[AlertType] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000)
):
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
    
    if alert.status == AlertStatus.ACTIVE:
        alert.status = AlertStatus.ACKNOWLEDGED
        alert.acknowledged_at = datetime.datetime.utcnow()
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
        
    if alert.status in [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]:
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(alert)
        
    return alert

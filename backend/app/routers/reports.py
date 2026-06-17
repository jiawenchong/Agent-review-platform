"""Monthly governance reports."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import Report, ReportSource, User
from ..schemas import ReportOut
from ..services.reports import generate_report

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("", response_model=list[ReportOut])
def list_reports(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return db.query(Report).order_by(Report.period.desc()).all()


@router.post("", response_model=ReportOut, status_code=201)
def create_report(period: str | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not user.is_manager:
        raise HTTPException(status_code=403, detail="僅主管可手動產生月報")
    return generate_report(db, period=period, by=ReportSource.MANUAL)

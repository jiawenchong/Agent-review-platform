"""Manual trigger for the full closed-loop sweep."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import User
from ..schemas import ScanRunOut
from ..services.scan import run_full_scan

router = APIRouter(prefix="/api/scan", tags=["scan"])


@router.post("", response_model=ScanRunOut)
def trigger_scan(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not user.is_manager:
        raise HTTPException(status_code=403, detail="僅主管可手動觸發全量掃描")
    return run_full_scan(db)

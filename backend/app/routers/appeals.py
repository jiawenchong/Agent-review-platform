"""Cross-project appeals list — used by the dashboard's 待處理申訴 card.

Per-project appeals already exist under /api/projects/{id}/appeals; this is
the same data flattened across all projects (with the same ACL) so the
dashboard can show a single "pending appeals" count without one request per
project.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import Appeal, User
from ..schemas import AppealOut

router = APIRouter(prefix="/api/appeals", tags=["appeals"])


@router.get("", response_model=list[AppealOut])
def list_all_appeals(db: Session = Depends(get_db), user: User = Depends(current_user)):
    appeals = db.query(Appeal).order_by(Appeal.submitted_at.desc()).all()
    if not user.is_manager:
        allowed = set(user.project_ids or [])
        appeals = [a for a in appeals if a.project_id in allowed]
    return appeals

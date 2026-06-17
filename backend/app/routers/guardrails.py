"""Guardrail audit log (紅線稽核紀錄)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import GuardrailEvent, GuardrailType, User
from ..schemas import GuardrailEventOut

router = APIRouter(prefix="/api/guardrail-events", tags=["guardrails"])


@router.get("", response_model=list[GuardrailEventOut])
def list_events(
    guardrail_type: GuardrailType | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    q = db.query(GuardrailEvent)
    if guardrail_type:
        q = q.filter(GuardrailEvent.guardrail_type == guardrail_type)
    events = q.order_by(GuardrailEvent.triggered_at.desc()).all()
    if not user.is_manager:
        allowed = set(user.project_ids or [])
        events = [e for e in events if e.project_id in allowed]
    return events

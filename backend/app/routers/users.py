"""User directory.

Real authentication is a separate, not-yet-built piece of work (見
ROADMAP §H2)。Until then the frontend needs a way to know which principals
exist so it can send a valid ``X-User-Id`` header. This endpoint is
intentionally unauthenticated — it only lists identities, not project data,
so it doesn't bypass the Information Isolation guardrail.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.user_id).all()

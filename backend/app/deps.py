"""Shared dependencies — including the Information Isolation guardrail (§八).

The ACL check runs at the API layer: every project-scoped query first passes
through `require_project_access`, which consults the caller's ACL and writes
an Information-Isolation guardrail event on denial, exactly as the spec
requires ("所有查詢先過 ACL 檢查,未授權直接拒絕").

The current principal is taken from the ``X-User-Id`` header. Real
deployments would replace this with proper auth; the contract (a user id +
its ACL) stays the same.
"""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .database import get_db
from .models import GuardrailType, User
from .services.guardrails import record_event


def current_user(
    x_user_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="缺少 X-User-Id")
    user = db.get(User, x_user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="未知使用者")
    return user


def require_project_access(project_id: str, user: User, db: Session) -> None:
    """ACL gate. Managers see everything; others only their listed projects."""
    if user.is_manager or project_id in (user.project_ids or []):
        return
    record_event(
        db,
        project_id=project_id,
        guardrail_type=GuardrailType.INFORMATION_ISOLATION,
        detail=f"使用者 {user.user_id} 嘗試存取未授權專案 {project_id},已依 ACL 拒絕。",
        resolution="拒絕存取",
    )
    db.commit()
    raise HTTPException(status_code=403, detail="無權存取此專案資料(Information Isolation)")

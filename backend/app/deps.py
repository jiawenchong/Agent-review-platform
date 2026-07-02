"""Shared FastAPI dependencies.

current_user() reads the signed JWT from the httpOnly 'govern_auth' cookie
set by POST /api/auth/login. All project-scoped endpoints call this via
Depends() to enforce authentication.

The Information Isolation guardrail (§八) is enforced by require_project_access:
managers and admins see all projects; regular members only see their own.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from .models import GuardrailType, User
from .services.guardrails import record_event


def current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    from .services.auth_service import COOKIE_NAME, decode_token
    import jwt as pyjwt

    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="未登入，請先至登入頁面")

    try:
        payload = decode_token(token)
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="登入已過期，請重新登入")
    except Exception:
        raise HTTPException(status_code=401, detail="Token 無效，請重新登入")

    user_id = payload.get("sub")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="使用者不存在")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    """Gate for role-management endpoints — only role == 'admin', not managers."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="僅限管理員(admin)執行此操作")
    return user


def require_project_access(project_id: str, user: User, db: Session) -> None:
    """ACL gate. Admins/managers see everything; members only their listed projects."""
    is_elevated = user.is_manager or (user.role in ("admin", "manager"))
    if is_elevated or project_id in (user.project_ids or []):
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

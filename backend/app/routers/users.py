"""User directory + role management.

GET /api/users lists all known principals (any logged-in user may read this —
it's used across the app to resolve owner names, and doesn't expose project
data itself, so it doesn't bypass the Information Isolation guardrail).

PATCH /api/users/{user_id}/role is the 使用者管理 (User Management) page's
write endpoint — restricted to role == "admin" via require_admin. This is how
the platform owner designates who else is admin/manager/member; there is no
other authority above it besides the BOOTSTRAP_ADMIN_EMPNO self-healing login
promotion (see routers/auth.py) that solves the very first admin.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_admin
from ..models import User
from ..schemas import UserOut, UserRoleUpdate

router = APIRouter(prefix="/api/users", tags=["users"])

_VALID_ROLES = {"admin", "manager", "member"}


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _user: User = Depends(current_user)):
    return db.query(User).order_by(User.user_id).all()


@router.patch("/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: str,
    body: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if body.role not in _VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"role 必須是 {', '.join(sorted(_VALID_ROLES))} 之一")

    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="使用者不存在")

    if target.role == "admin" and body.role != "admin":
        remaining_admins = db.query(User).filter(User.role == "admin", User.user_id != user_id).count()
        if remaining_admins == 0:
            raise HTTPException(status_code=400, detail="至少要保留一位 admin，無法將最後一位 admin 降級")

    target.role = body.role
    target.is_manager = body.role in ("admin", "manager")
    db.commit()
    db.refresh(target)
    return target

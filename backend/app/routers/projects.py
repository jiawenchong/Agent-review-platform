"""Projects + per-project detail (snapshots, appeals)."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_project_access
from ..models import Appeal, ProgressSnapshot, Project, User
from ..schemas import (
    AppealCreate,
    AppealOut,
    ProjectCreate,
    ProjectOut,
    ScanResult,
    SnapshotOut,
)
from ..services.decision import weekly_scan

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db), user: User = Depends(current_user)):
    projects = db.query(Project).all()
    # Information Isolation: non-managers only see their own projects.
    if not user.is_manager:
        allowed = set(user.project_ids or [])
        projects = [p for p in projects if p.project_id in allowed]
    return projects


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not user.is_manager:
        raise HTTPException(status_code=403, detail="僅主管可建立專案")
    if db.get(Project, payload.project_id):
        raise HTTPException(status_code=409, detail="專案已存在")
    project = Project(
        project_id=payload.project_id,
        name=payload.name,
        owner_id=payload.owner_id,
        department=payload.department,
        kanban_ref=payload.kanban_ref,
        last_update_timestamp=payload.last_update_timestamp or datetime.utcnow(),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="找不到專案")
    require_project_access(project_id, user, db)
    return project


@router.get("/{project_id}/snapshots", response_model=list[SnapshotOut])
def project_snapshots(project_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_project_access(project_id, user, db)
    return (
        db.query(ProgressSnapshot)
        .filter(ProgressSnapshot.project_id == project_id)
        .order_by(ProgressSnapshot.scan_time.desc())
        .all()
    )


@router.get("/{project_id}/appeals", response_model=list[AppealOut])
def project_appeals(project_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require_project_access(project_id, user, db)
    return (
        db.query(Appeal)
        .filter(Appeal.project_id == project_id)
        .order_by(Appeal.submitted_at.desc())
        .all()
    )


@router.post("/{project_id}/appeals", response_model=AppealOut, status_code=201)
def submit_appeal(
    project_id: str,
    payload: AppealCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="找不到專案")
    require_project_access(project_id, user, db)
    appeal = Appeal(project_id=project_id, owner_id=payload.owner_id, content=payload.content)
    db.add(appeal)
    db.commit()
    db.refresh(appeal)
    return appeal


@router.post("/{project_id}/scan", response_model=ScanResult)
def scan_one(project_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="找不到專案")
    require_project_access(project_id, user, db)
    result = weekly_scan(db, project)
    db.commit()
    return result

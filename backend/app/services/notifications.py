"""Notification dispatch (§四 預警通知模組).

Writes an in-app ``notifications`` row. The planning doc lists Email / Teams
as 待確認 channels; ``settings.notification_channel`` is the switch point.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import Notification, NotificationType, Project, User


def _recipients(db: Session, project: Project) -> list[str]:
    """Owner + any manager. Mirrors "通知主管與負責人"."""
    ids = {project.owner_id}
    managers = db.query(User).filter(User.is_manager.is_(True)).all()
    ids.update(m.user_id for m in managers)
    return sorted(ids)


def notify(
    db: Session,
    project: Project,
    *,
    type: NotificationType,
    title: str,
    body: str,
) -> list[Notification]:
    created: list[Notification] = []
    for rid in _recipients(db, project):
        n = Notification(
            project_id=project.project_id,
            recipient_id=rid,
            type=type,
            title=title,
            body=body,
            action_url=f"/projects/{project.project_id}",
        )
        db.add(n)
        created.append(n)
    db.flush()
    return created

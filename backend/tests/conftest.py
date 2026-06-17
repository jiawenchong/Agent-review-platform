from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Project, ProjectStatus, User


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, future=True)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def make_project(db):
    def _make(project_id="PROJ-T", stalled_days=20, kanban_ref="KB-T", owner="U-1"):
        project = Project(
            project_id=project_id,
            name="測試 Agent",
            owner_id=owner,
            department="測試部",
            status=ProjectStatus.NORMAL,
            kanban_ref=kanban_ref,
            last_update_timestamp=datetime.utcnow() - timedelta(days=stalled_days),
        )
        db.add(project)
        db.commit()
        return project

    return _make


@pytest.fixture()
def manager(db):
    u = User(user_id="U-mgr", name="主管", is_manager=True, project_ids=[])
    db.add(u)
    db.commit()
    return u

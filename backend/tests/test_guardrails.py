"""Guardrail unit tests (§八) that aren't covered via the decision flow."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.deps import require_project_access
from app.models import GuardrailEvent, GuardrailType, User
from app.services.guardrails import assert_goal_inputs


def test_goal_guardrail_strips_rank_inputs(db, make_project):
    project = make_project()
    inputs = {"progress_value": 40, "days_stalled": 20, "職級": "資深", "rank": 7}
    assert_goal_inputs(db, project, inputs)
    db.commit()
    # forbidden keys removed from grading inputs
    assert "職級" not in inputs
    assert "rank" not in inputs
    events = db.query(GuardrailEvent).filter_by(guardrail_type=GuardrailType.GOAL).all()
    assert len(events) == 1


def test_information_isolation_denies_unauthorized(db, make_project):
    make_project(project_id="PROJ-X")
    user = User(user_id="U-2", name="他人", is_manager=False, project_ids=["PROJ-Y"])
    db.add(user)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        require_project_access("PROJ-X", user, db)
    assert exc.value.status_code == 403

    events = db.query(GuardrailEvent).filter_by(
        guardrail_type=GuardrailType.INFORMATION_ISOLATION
    ).all()
    assert len(events) == 1


def test_information_isolation_allows_manager(db, make_project):
    make_project(project_id="PROJ-X")
    mgr = User(user_id="U-mgr2", name="主管", is_manager=True, project_ids=[])
    db.add(mgr)
    db.commit()
    # should not raise
    require_project_access("PROJ-X", mgr, db)

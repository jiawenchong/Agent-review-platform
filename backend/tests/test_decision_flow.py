"""Decision-flow tests — the four §六 branches plus Feedback/Escalation."""
from __future__ import annotations

from datetime import datetime, timedelta

from app.models import Appeal, GuardrailType, LLMVerdict, ProjectStatus
from app.services import connectors
from app.services.connectors import KanbanProgress
from app.services.decision import weekly_scan


def _stall(project, days=20, progress=30.0):
    """Force the KANBAN stub to report a stalled project deterministically."""
    connectors.kanban.set(
        project.kanban_ref,
        KanbanProgress(progress_value=progress, last_change=datetime.utcnow() - timedelta(days=days)),
    )


def _fresh(project, progress=90.0):
    connectors.kanban.set(
        project.kanban_ref,
        KanbanProgress(progress_value=progress, last_change=datetime.utcnow()),
    )


def test_not_stalled_is_normal(db, make_project):
    project = make_project(kanban_ref="KB-fresh")
    _fresh(project)
    result = weekly_scan(db, project)
    assert result.status == ProjectStatus.NORMAL
    assert result.is_stalled is False
    assert result.priority_band is None


def test_stalled_no_appeal_is_priority_1(db, make_project):
    project = make_project(kanban_ref="KB-noappeal")
    _stall(project)
    result = weekly_scan(db, project)
    assert result.status == ProjectStatus.RED
    assert result.priority_band == "#1"
    assert any("限時" in a for a in result.actions)


def test_stalled_unreasonable_appeal_is_priority_2(db, make_project):
    project = make_project(kanban_ref="KB-bad")
    _stall(project)
    db.add(Appeal(project_id=project.project_id, owner_id="U-1", content="再看看啦,應該會好,沒問題啦"))
    db.commit()
    result = weekly_scan(db, project)
    assert result.verdict == LLMVerdict.UNREASONABLE
    assert result.status == ProjectStatus.RED
    assert result.priority_band == "#2"


def test_stalled_reasonable_appeal_is_priority_3(db, make_project):
    project = make_project(kanban_ref="KB-good")
    _stall(project)
    db.add(Appeal(
        project_id=project.project_id, owner_id="U-1",
        content="已完成資料補件,預計本週內完成里程碑驗證,負責人已排程後續時程。",
    ))
    db.commit()
    result = weekly_scan(db, project)
    assert result.verdict == LLMVerdict.REASONABLE
    assert result.status == ProjectStatus.WATCH
    assert result.priority_band == "#3"


def test_capability_guardrail_halts_on_unavailable_kanban(db, make_project):
    project = make_project(kanban_ref="UNAVAILABLE-KB")
    result = weekly_scan(db, project)
    assert GuardrailType.CAPABILITY in result.guardrails_triggered
    assert any("中止" in a for a in result.actions)


def test_hallucination_guardrail_on_contradiction(db, make_project):
    project = make_project(kanban_ref="KB-contra")
    _stall(project, progress=20.0)  # data says behind
    db.add(Appeal(
        project_id=project.project_id, owner_id="U-1",
        content="進度一切如期正常,沒有任何落後。",  # claims on track
    ))
    db.commit()
    result = weekly_scan(db, project)
    assert GuardrailType.HALLUCINATION in result.guardrails_triggered
    assert result.verdict == LLMVerdict.UNREASONABLE


def test_escalation_after_two_unresolved_rounds(db, make_project):
    project = make_project(kanban_ref="KB-esc")
    reasonable = "已完成補件,預計本週內完成里程碑驗證,已排程後續時程。"

    _stall(project)
    db.add(Appeal(project_id=project.project_id, owner_id="U-1", content=reasonable))
    db.commit()

    r1 = weekly_scan(db, project)
    db.commit()
    assert r1.status == ProjectStatus.WATCH
    assert GuardrailType.ESCALATION not in r1.guardrails_triggered

    # Round 2: still stalled, still reasonable → escalation fires.
    _stall(project)
    r2 = weekly_scan(db, project)
    db.commit()
    assert GuardrailType.ESCALATION in r2.guardrails_triggered
    assert project.ai_auto_approval is False

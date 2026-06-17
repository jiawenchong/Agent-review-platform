"""Closed-loop decision flow (§三 架構 / §六 Decision Flow).

`weekly_scan` is a faithful implementation of the planning document's
pseudocode, with the rule/LLM split from §七 and the guardrail interception
points from §八 wired in. Rules decide everything structural; the LLM is
invoked only to judge appeal reasonableness.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    Appeal,
    GuardrailType,
    LLMVerdict,
    NotificationType,
    ProgressSnapshot,
    Project,
    ProjectStatus,
)
from ..schemas import ScanResult
from . import guardrails
from .connectors import kanban, rag
from .llm import llm
from .notifications import notify


# ── rule-based helpers (§七: 結構化判斷一律用規則) ───────────────────────


def is_stalled(project: Project, snapshot: ProgressSnapshot) -> bool:
    """14-day no-change rule. Pure timestamp arithmetic."""
    delta = datetime.utcnow() - project.last_update_timestamp
    return delta.days >= settings.stall_threshold_days


def latest_appeal(db: Session, project: Project) -> Appeal | None:
    return (
        db.query(Appeal)
        .filter(Appeal.project_id == project.project_id)
        .order_by(Appeal.submitted_at.desc())
        .first()
    )


def has_appeal_response(db: Session, project: Project, since: datetime) -> Appeal | None:
    appeal = latest_appeal(db, project)
    if appeal and appeal.submitted_at >= since:
        return appeal
    return None


def was_resolved_since_last_round(project: Project, snapshot: ProgressSnapshot) -> bool:
    """Feedback rule: did the project actually move since the last scan?"""
    return not snapshot.is_stalled


# ── the weekly scan ──────────────────────────────────────────────────────


def weekly_scan(db: Session, project: Project) -> ScanResult:
    result = ScanResult(
        project_id=project.project_id,
        status=ProjectStatus(project.status),
        priority_band=project.priority_band,
        is_stalled=False,
        days_stalled=0,
    )

    # Perception — fetch progress. Capability guardrail halts on failure.
    progress = kanban.fetch_progress(project.kanban_ref)
    try:
        guardrails.check_capability(db, project, progress.available)
    except guardrails.GuardrailHalt as halt:
        result.guardrails_triggered.append(halt.guardrail_type)
        result.actions.append("流程中止:無法取得進度資料")
        return result

    days_stalled = (datetime.utcnow() - progress.last_change).days
    snapshot = ProgressSnapshot(
        project_id=project.project_id,
        progress_value=progress.progress_value,
        is_stalled=days_stalled >= settings.stall_threshold_days,
        days_stalled=days_stalled,
    )
    db.add(snapshot)
    db.flush()
    result.is_stalled = snapshot.is_stalled
    result.days_stalled = days_stalled

    # Not stalled → 正常, and close out any prior unresolved streak (Feedback).
    if not snapshot.is_stalled:
        _resolve_if_recovering(db, project, snapshot, result)
        _set_status(project, ProjectStatus.NORMAL, band=None, score=_score(snapshot, None))
        result.status = ProjectStatus.NORMAL
        result.priority_band = None
        return result

    # Stalled. §六 branch on whether the owner responded.
    appeal = latest_appeal(db, project)
    if appeal is None:
        # #1 最優先 — no response, demand a time-boxed reply.
        notify(
            db, project,
            type=NotificationType.STALL_ALERT,
            title="停滯預警 · 限時回應",
            body=f"{project.name} 已停滯 {days_stalled} 天且尚未於 Q&A 回應,請限時提出說明。",
        )
        _set_status(project, ProjectStatus.RED, band="#1", score=_score(snapshot, None))
        project.consecutive_unresolved += 1
        result.status = ProjectStatus.RED
        result.priority_band = "#1"
        result.actions.append("發送限時回應預警(最優先)")
        return result

    # Responded → Reasoning stage: LLM judges reasonableness.
    contradiction_claim = "如期" in appeal.content or "正常" in appeal.content
    evaluation = llm.evaluate_appeal(
        project_id=project.project_id,
        appeal_text=appeal.content,
        progress_value=progress.progress_value,
        claims_on_track=contradiction_claim,
        rag_context=rag.query(project.project_id, appeal.content),
    )
    appeal.llm_verdict = LLMVerdict.REASONABLE if evaluation.reasonable else LLMVerdict.UNREASONABLE
    appeal.llm_reason = evaluation.reason
    appeal.rag_refs = evaluation.rag_refs
    result.verdict = appeal.llm_verdict

    # Guardrails attached to the Reasoning output.
    if guardrails.check_grounding(db, project, evaluation.grounding_violation):
        result.guardrails_triggered.append(GuardrailType.GROUNDING)
    if guardrails.check_hallucination(db, project, evaluation.contradiction_with_data):
        result.guardrails_triggered.append(GuardrailType.HALLUCINATION)

    if not evaluation.reasonable:
        # #2 退回 — reject, ask to re-explain.
        notify(
            db, project,
            type=NotificationType.STALL_ALERT,
            title="申訴退回 · 要求重新說明",
            body=f"{project.name} 的申訴經評估不合理:{evaluation.reason}",
        )
        _set_status(project, ProjectStatus.RED, band="#2", score=_score(snapshot, appeal))
        project.consecutive_unresolved += 1
        result.status = ProjectStatus.RED
        result.priority_band = "#2"
        result.actions.append("退回申訴,要求重新說明")
        return result

    # #3 合理 → 觀察中, track into next round. Apply Feedback rules.
    _set_status(project, ProjectStatus.WATCH, band="#3", score=_score(snapshot, appeal))
    result.status = ProjectStatus.WATCH
    result.priority_band = "#3"
    result.actions.append("列入下一輪追蹤觀察")

    if was_resolved_since_last_round(project, snapshot):
        _close_case(db, project, result)
    else:
        project.consecutive_unresolved += 1
        if project.consecutive_unresolved >= settings.escalation_rounds:
            guardrails.trigger_escalation(db, project, project.consecutive_unresolved)
            project.ai_auto_approval = False
            notify(
                db, project,
                type=NotificationType.ESCALATION,
                title="強制升級人工主管",
                body=(
                    f"{project.name} 申訴雖判定合理,但連續 "
                    f"{project.consecutive_unresolved} 輪未解除停滯,已升級並停用 AI 自動核准。"
                ),
            )
            result.guardrails_triggered.append(GuardrailType.ESCALATION)
            result.actions.append("升級人工主管 · 停用 AI 自動核准")

    return result


# ── small internal helpers ──────────────────────────────────────────────


def _set_status(project: Project, status: ProjectStatus, *, band: str | None, score: int) -> None:
    project.status = status
    project.priority_band = band
    project.score = score


def _resolve_if_recovering(db, project, snapshot, result) -> None:
    if project.consecutive_unresolved > 0:
        _close_case(db, project, result)


def _close_case(db: Session, project: Project, result: ScanResult) -> None:
    project.consecutive_unresolved = 0
    project.priority_band = None
    rag.write_back(project.project_id, outcome="resolved")
    result.actions.append("結案 · 正向案例回寫 RAG")


def _score(snapshot: ProgressSnapshot, appeal: Appeal | None) -> int:
    """Governance score for the dashboard. Goal guardrail forbids any
    rank/seniority input — only objective signals feed this."""
    inputs = {
        "progress_value": snapshot.progress_value,
        "days_stalled": snapshot.days_stalled,
        "verdict": appeal.llm_verdict if appeal else None,
    }
    base = snapshot.progress_value
    if snapshot.is_stalled:
        base -= min(snapshot.days_stalled, 40)
    if appeal and appeal.llm_verdict == LLMVerdict.UNREASONABLE:
        base -= 20
    _ = inputs  # documents the (rank-free) inputs used for grading
    return max(0, min(100, int(base)))

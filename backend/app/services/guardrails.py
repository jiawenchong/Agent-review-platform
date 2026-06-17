"""Guardrails implementation (§八 紅線實作規格).

Each guardrail is a small, single-purpose check tied to the interception
point named in the spec. Triggering one writes a ``guardrail_events`` row
and (where the spec says so) halts the flow.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import GuardrailEvent, GuardrailType, Project


def record_event(
    db: Session,
    *,
    project_id: str,
    guardrail_type: GuardrailType,
    detail: str,
    resolution: str | None = None,
) -> GuardrailEvent:
    event = GuardrailEvent(
        project_id=project_id,
        guardrail_type=guardrail_type,
        detail=detail,
        resolution=resolution,
    )
    db.add(event)
    db.flush()
    return event


class GuardrailHalt(Exception):
    """Raised when a guardrail demands the flow stop (e.g. Capability)."""

    def __init__(self, guardrail_type: GuardrailType, detail: str):
        self.guardrail_type = guardrail_type
        self.detail = detail
        super().__init__(detail)


# ── Capability (解析/同步失敗 → 中止,禁止憑空生成) ──────────────────────


def check_capability(db: Session, project: Project, kanban_available: bool) -> None:
    if not kanban_available:
        record_event(
            db,
            project_id=project.project_id,
            guardrail_type=GuardrailType.CAPABILITY,
            detail="KANBAN API 同步失敗,無法取得進度資料,流程中止,禁止憑空生成進度數字。",
            resolution="待資料來源恢復後重新掃描",
        )
        raise GuardrailHalt(
            GuardrailType.CAPABILITY,
            "無法取得 KANBAN 進度資料,已中止本次掃描。",
        )


# ── Hallucination (數據與留言矛盾 → 標示衝突,不可掩蓋) ───────────────────


def check_hallucination(db: Session, project: Project, contradiction: bool) -> bool:
    if contradiction:
        record_event(
            db,
            project_id=project.project_id,
            guardrail_type=GuardrailType.HALLUCINATION,
            detail="KANBAN 進度數據與 Q&A 留言內容矛盾(數據落後但留言宣稱如期),標示衝突旗標。",
        )
        return True
    return False


# ── Grounding (LLM 引用未在 context 的資訊) ─────────────────────────────


def check_grounding(db: Session, project: Project, grounding_violation: bool) -> bool:
    if grounding_violation:
        record_event(
            db,
            project_id=project.project_id,
            guardrail_type=GuardrailType.GROUNDING,
            detail="Reasoning 模組嘗試引用未出現在 RAG context 或申訴原文中的資訊,已攔截。",
        )
        return True
    return False


# ── Goal (分級不可讀取職級欄位) ──────────────────────────────────────────


def assert_goal_inputs(db: Session, project: Project, inputs: dict) -> None:
    """Action grading must depend only on governance signals — never on the
    owner's rank/seniority. Calling code passes the dict it will grade on;
    presence of a forbidden key trips the Goal guardrail."""
    forbidden = {"rank", "seniority", "職級", "人情"}
    leaked = forbidden & set(inputs)
    if leaked:
        record_event(
            db,
            project_id=project.project_id,
            guardrail_type=GuardrailType.GOAL,
            detail=f"風險分級輸入疑似包含職級/人情因素欄位:{sorted(leaked)},已從判斷輸入移除。",
        )
        for key in leaked:
            inputs.pop(key, None)


# ── Escalation (合理但連續 ≥2 輪未解除 → 升級 + 停用自動核准) ─────────────


def trigger_escalation(db: Session, project: Project, rounds: int) -> GuardrailEvent:
    return record_event(
        db,
        project_id=project.project_id,
        guardrail_type=GuardrailType.ESCALATION,
        detail=(
            f"申訴經 LLM 判定合理,但連續 {rounds} 輪仍未解除停滯,"
            "強制升級人工主管並停用該案件 AI 自動核准權限。"
        ),
        resolution="已轉人工主管",
    )

"""LLM connector — the Reasoning engine (§六, §七).

Per the LLM-vs-rule division table, the LLM is used only for the one
judgement rules cannot make: whether a free-text appeal is *reasonable and
feasible*. Everything structural stays in Python.

The stub implements a transparent, auditable heuristic so the closed loop
and the Grounding / Hallucination guardrails can run deterministically
without a GPU. A real connector (Llama3 / GPT4o on a local GPU) would
implement the same ``evaluate_appeal`` contract.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..config import settings
from .connectors import RagHit, rag


@dataclass
class AppealEvaluation:
    reasonable: bool
    reason: str
    rag_refs: list[str] = field(default_factory=list)
    # guardrail signals surfaced to the caller
    grounding_violation: bool = False          # cited info not in context
    contradiction_with_data: bool = False      # Hallucination guardrail


# Phrases that, with no concrete plan, read as deflection ("話術").
_VAGUE_MARKERS = ("再看看", "應該會好", "盡量", "再說", "沒問題啦", "之後再", "差不多")
# Concreteness signals: a credible appeal names a plan, date, or owner action.
_CONCRETE_MARKERS = ("預計", "已完成", "里程碑", "時程", "補件", "排程", "負責", "日前", "週內", "驗證")


class StubLLM:
    def evaluate_appeal(
        self,
        *,
        project_id: str,
        appeal_text: str,
        progress_value: float,
        claims_on_track: bool,
        rag_context: list[RagHit] | None = None,
    ) -> AppealEvaluation:
        rag_context = rag_context or rag.query(project_id, appeal_text)
        refs = [h.ref for h in rag_context]

        # Hallucination guardrail input: KANBAN says behind, comment says fine.
        contradiction = claims_on_track and progress_value < 60

        concrete = sum(m in appeal_text for m in _CONCRETE_MARKERS)
        vague = sum(m in appeal_text for m in _VAGUE_MARKERS)
        too_short = len(appeal_text.strip()) < 15

        reasonable = concrete > vague and not too_short and not contradiction

        if contradiction:
            reason = "申訴宣稱進度如期,但 KANBAN 進度值顯示明顯落後,數據與留言矛盾。"
        elif too_short:
            reason = "申訴內容過於簡略,未提出具體改善計畫或時程。"
        elif reasonable:
            reason = f"申訴提出具體計畫/時程({concrete} 項具體陳述),與歷史案例一致,判定合理。"
        else:
            reason = f"申訴以模糊措辭為主({vague} 項),缺乏可驗證的具體行動,判定不合理。"

        return AppealEvaluation(
            reasonable=reasonable,
            reason=reason,
            rag_refs=refs,
            grounding_violation=False,  # stub only cites supplied context
            contradiction_with_data=contradiction,
        )


llm = StubLLM()


def using_stub_llm() -> bool:
    return not settings.llm_endpoint

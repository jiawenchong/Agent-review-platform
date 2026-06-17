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
class DocumentReview:
    """AI 評審中心 output for an uploaded document (§四)."""

    verdict: str            # 綠燈 / 紅燈 / 待補件
    summary: str
    key_points: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)


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


# Structured-proposal sections the AI 評審中心 expects in a planning doc.
_EXPECTED_SECTIONS = ("目標", "範圍", "時程", "風險", "資源", "里程碑")


class StubLLM:
    def review_document(self, *, filename: str, text: str) -> DocumentReview:
        """判讀 an extracted document — the AI 評審中心 step.

        The stub gives a transparent, auditable read: it summarises the
        content, pulls out the leading lines as key points, and decides a
        紅燈/綠燈/待補件 verdict from how complete the structured proposal is.
        A real Llama3/GPT4o connector implements the same contract.
        """
        clean = text.strip()
        lines = [ln.strip() for ln in clean.splitlines() if ln.strip()]
        char_count = len(clean)

        present = [s for s in _EXPECTED_SECTIONS if s in clean]
        missing = [s for s in _EXPECTED_SECTIONS if s not in clean]
        key_points = lines[:5]

        if len(present) >= 4:
            verdict = "綠燈"
            reasons = [f"涵蓋 {len(present)} 項必要章節:{'、'.join(present)}。"]
        elif char_count < 80:
            verdict = "待補件"
            reasons = ["內容過少,無法構成可評審的規劃書。"]
        else:
            verdict = "紅燈"
            reasons = [f"缺少必要章節:{'、'.join(missing)},不符合規劃書結構要求。"]

        summary = (
            f"文件《{filename}》共擷取 {char_count} 字、{len(lines)} 行;"
            f"評審結果:{verdict}。"
        )
        return DocumentReview(verdict=verdict, summary=summary, key_points=key_points, reasons=reasons)

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

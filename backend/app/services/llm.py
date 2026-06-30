"""LLM connector — the Reasoning engine (§六, §七).

Two implementations behind one interface, selected by ``settings.llm_endpoint``:

* :class:`ProfetAILLM` — calls the real ProfetAI LLM API over HTTP for the
  document 審核 (AI 評審中心) step. Used when ``APP_LLM_ENDPOINT`` is set.
* :class:`StubLLM` — a transparent, auditable heuristic that runs without a
  GPU. Used when no endpoint is configured (local dev / demo).

The closed-loop appeal-reasonableness judgement (§七 evaluate_appeal) stays on
the deterministic stub for now (ROADMAP B5); only the document review is wired
to ProfetAI. A real connector for appeals would implement the same contract.

If the real API is configured but unreachable / returns garbage, the connector
raises :class:`LLMUnavailable`. Callers must treat that as "無法審核" per the
Capability guardrail — never silently fabricate a verdict.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

import httpx

from ..config import settings
from . import prompts
from .connectors import RagHit, rag


class LLMUnavailable(Exception):
    """Raised when the real LLM API cannot produce a usable review."""


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

_VALID_VERDICTS = ("綠燈", "紅燈", "待補件")


class StubLLM:
    def review_document(self, *, filename: str, text: str) -> DocumentReview:
        """判讀 an extracted document — the AI 評審中心 step.

        The stub gives a transparent, auditable read: it summarises the
        content, pulls out the leading lines as key points, and decides a
        紅燈/綠燈/待補件 verdict from how complete the structured proposal is.
        A real ProfetAI connector implements the same contract.
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


def _extract_content(data: object) -> str:
    """Pull the assistant text out of an LLM API response.

    Defaults to the OpenAI-compatible shape (``choices[0].message.content``),
    with fallbacks for a few common custom shapes. The real ProfetAI spec can
    be matched precisely here once provided.
    """
    if isinstance(data, str):
        return data
    if isinstance(data, dict):
        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            first = choices[0]
            if isinstance(first, dict):
                msg = first.get("message")
                if isinstance(msg, dict) and isinstance(msg.get("content"), str):
                    return msg["content"]
                if isinstance(first.get("text"), str):
                    return first["text"]
        for key in ("content", "output", "text", "result", "answer"):
            if isinstance(data.get(key), str):
                return data[key]
    raise LLMUnavailable("無法從 API 回應取得內容(回應格式不符預期)。")


def _parse_review(content: str, *, filename: str) -> DocumentReview:
    """Parse the model's JSON output into a DocumentReview (Grounding-safe)."""
    snippet = content.strip()
    # Tolerate a ```json … ``` fenced block, then fall back to the first object.
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", snippet, re.DOTALL)
    if fence:
        snippet = fence.group(1)
    else:
        brace = re.search(r"\{.*\}", snippet, re.DOTALL)
        if brace:
            snippet = brace.group(0)
    try:
        obj = json.loads(snippet)
    except (json.JSONDecodeError, ValueError) as exc:
        raise LLMUnavailable(f"LLM 回應非合法 JSON:{exc}") from exc
    if not isinstance(obj, dict):
        raise LLMUnavailable("LLM 回應不是 JSON 物件。")

    verdict = str(obj.get("verdict", "")).strip()
    if verdict not in _VALID_VERDICTS:
        raise LLMUnavailable(f"LLM 回傳未知的 verdict:{verdict!r}。")

    summary = str(obj.get("summary", "")).strip() or f"文件《{filename}》評審結果:{verdict}。"

    def _as_list(value: object) -> list[str]:
        if isinstance(value, list):
            return [str(v).strip() for v in value if str(v).strip()]
        if isinstance(value, str) and value.strip():
            return [value.strip()]
        return []

    return DocumentReview(
        verdict=verdict,
        summary=summary,
        key_points=_as_list(obj.get("key_points")),
        reasons=_as_list(obj.get("reasons")),
    )


class ProfetAILLM:
    """Calls the ProfetAI LLM API for document review (AI 評審中心).

    Internal network → no auth by default. Payload defaults to the
    OpenAI-compatible chat-completions shape; when the real ProfetAI spec is
    provided it can be adjusted in :meth:`_chat` / :func:`_extract_content`.
    """

    def __init__(self) -> None:
        self._stub = StubLLM()  # appeals still use the deterministic stub (B5)

    def _chat(self, *, system: str, user: str) -> str:
        payload: dict = {
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0,
            "stream": False,
        }
        if settings.llm_model:
            payload["model"] = settings.llm_model
        headers: dict[str, str] = {}
        if settings.llm_api_key:  # internal network is no-auth; honoured only if set
            headers["Authorization"] = f"Bearer {settings.llm_api_key}"
        try:
            resp = httpx.post(
                settings.llm_endpoint,
                json=payload,
                headers=headers,
                timeout=settings.llm_timeout_seconds,
            )
            resp.raise_for_status()
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise LLMUnavailable(f"呼叫 ProfetAI API 失敗:{exc}") from exc
        return _extract_content(data)

    def review_document(self, *, filename: str, text: str) -> DocumentReview:
        content = self._chat(
            system=prompts.review_system_prompt(),
            user=prompts.review_user_prompt(filename=filename, markdown=text),
        )
        return _parse_review(content, filename=filename)

    def evaluate_appeal(self, **kwargs) -> AppealEvaluation:
        return self._stub.evaluate_appeal(**kwargs)


def _build_llm() -> StubLLM | ProfetAILLM:
    return ProfetAILLM() if settings.llm_endpoint else StubLLM()


llm = _build_llm()


def using_stub_llm() -> bool:
    return not settings.llm_endpoint

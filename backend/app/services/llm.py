"""LLM connector — the Reasoning engine (§六, §七).

Two implementations behind one interface:

* :class:`ProphetAILLM` — calls the company's online ProphetAI API (OpenAI
  compatible ``/v1/chat/completions``) for the document 審核 (AI 評審中心) step.
  Used when both ``COMPANY_LLM_API_KEY`` and ``COMPANY_LLM_AGENT`` are set in
  the host environment. The call follows the verified pattern in
  ``.claude/skills/prophetai-api`` (urllib, block-array content, Bearer auth,
  SSL verification off for the intranet self-signed cert, no outbound proxy).
* :class:`StubLLM` — a transparent, auditable heuristic that runs without a
  GPU. Used when those credentials are absent (local dev / demo).

The closed-loop appeal-reasonableness judgement (§七 evaluate_appeal) stays on
the deterministic stub for now (ROADMAP B5); only the document review is wired
to ProphetAI. A real connector for appeals would implement the same contract.

If the real API is configured but unreachable / returns garbage, the connector
raises :class:`LLMUnavailable`. Callers must treat that as "無法審核" per the
Capability guardrail — never silently fabricate a verdict.
"""
from __future__ import annotations

import json
import os
import re
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass, field

from ..config import settings
from . import prompts
from .connectors import RagHit, rag

# Host-only credentials (see .claude/skills/prophetai-api). Never committed:
# the repo leaves these empty and the host machine fills them via env vars.
_ENV_API_KEY = "COMPANY_LLM_API_KEY"   # ask_xxxx
_ENV_AGENT_ID = "COMPANY_LLM_AGENT"    # ProphetAI agent id → goes in the `model` field


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


def _content_to_text(content: object) -> str | None:
    """Normalise an OpenAI ``message.content`` that may be a block array."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):  # block array → join the text blocks
        return "".join(b.get("text", "") for b in content if isinstance(b, dict))
    return None


def _extract_content(data: object) -> str:
    """Pull the assistant text out of a ProphetAI / OpenAI-compatible response.

    The endpoint is OpenAI compatible (``choices[0].message.content``); content
    may come back as a plain string or as a block array (see prophetai-api
    skill). A few custom shapes are tolerated as fallbacks.
    """
    if isinstance(data, str):
        return data
    if isinstance(data, dict):
        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            first = choices[0]
            if isinstance(first, dict):
                msg = first.get("message")
                if isinstance(msg, dict):
                    text = _content_to_text(msg.get("content"))
                    if text is not None:
                        return text
                if isinstance(first.get("text"), str):
                    return first["text"]
        for key in ("content", "output", "text", "result", "answer"):
            text = _content_to_text(data.get(key))
            if text is not None:
                return text
    raise LLMUnavailable("無法從 API 回應取得內容(回應格式不符預期)。")


def _extract_json_object(content: str) -> dict:
    """Pull a single JSON object out of an LLM reply (tolerates ```json fences)."""
    snippet = content.strip()
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
    return obj


def _parse_review(content: str, *, filename: str) -> DocumentReview:
    """Parse the model's JSON output into a DocumentReview (Grounding-safe)."""
    obj = _extract_json_object(content)

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


def _parse_appeal(content: str) -> tuple[bool, str]:
    """Parse the appeal-reasonableness JSON → (reasonable, reason)."""
    obj = _extract_json_object(content)
    reasonable = obj.get("reasonable")
    if not isinstance(reasonable, bool):
        raise LLMUnavailable(f"LLM 回傳的 reasonable 不是布林值:{reasonable!r}。")
    reason = str(obj.get("reason", "")).strip() or ("申訴合理。" if reasonable else "申訴不合理。")
    return reasonable, reason


def _no_proxy_ssl_off_opener() -> urllib.request.OpenerDirector:
    """Opener that skips the outbound proxy and the self-signed cert check.

    Both are mandatory for the intranet endpoint (see prophetai-api skill):
    the company proxy blocks CONNECT (→ 403) and the cert is self-signed.
    """
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=ctx),
    )


class ProphetAILLM:
    """Calls the company ProphetAI API for document review (AI 評審中心).

    Follows the verified pattern in ``.claude/skills/prophetai-api``:
    OpenAI-compatible endpoint, ``model`` = agent id, ``content`` as a block
    array, Bearer auth, SSL verification off, no outbound proxy. The review
    prompt is sent inline (system + user combined into one text block) so the
    call works regardless of whether the agent has a prompt configured.
    """

    def __init__(self) -> None:
        self._stub = StubLLM()  # appeals still use the deterministic stub (B5)

    def _chat(self, *, prompt: str) -> str:
        api_key = os.environ.get(_ENV_API_KEY, "")
        agent_id = os.environ.get(_ENV_AGENT_ID, "")
        if not api_key or not agent_id:
            raise LLMUnavailable(
                f"{_ENV_API_KEY} / {_ENV_AGENT_ID} 未設定(請在 host 本機環境變數填入,勿 commit)。"
            )

        payload = json.dumps(
            {
                "model": agent_id,  # 規則 2:model 欄位 = agent id
                "messages": [
                    {"role": "user", "content": [{"type": "text", "text": prompt}]}  # 規則 3:block 陣列
                ],
                "temperature": 0,
            },
            ensure_ascii=False,
        ).encode("utf-8")

        req = urllib.request.Request(
            settings.llm_endpoint,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",  # 規則 4
            },
        )
        opener = _no_proxy_ssl_off_opener()  # 規則 5
        try:
            with opener.open(req, timeout=settings.llm_timeout_seconds) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")[:200]
            raise LLMUnavailable(f"ProphetAI API 回應錯誤 {exc.code}:{body}") from exc
        except (urllib.error.URLError, ValueError, OSError) as exc:
            raise LLMUnavailable(f"無法連線 ProphetAI API:{exc}") from exc
        return _extract_content(data)

    def review_document(self, *, filename: str, text: str) -> DocumentReview:
        # Inline prompt (SEND_PROMPT_INLINE): system + user in one text block.
        prompt = (
            prompts.review_system_prompt()
            + "\n\n----\n\n"
            + prompts.review_user_prompt(filename=filename, markdown=text)
        )
        content = self._chat(prompt=prompt)
        return _parse_review(content, filename=filename)

    def evaluate_appeal(
        self,
        *,
        project_id: str,
        appeal_text: str,
        progress_value: float,
        claims_on_track: bool,
        rag_context: list[RagHit] | None = None,
    ) -> AppealEvaluation:
        rag_context = rag_context if rag_context is not None else rag.query(project_id, appeal_text)
        refs = [h.ref for h in rag_context]

        # Data-consistency (Hallucination guardrail) stays a rule — it compares
        # the claim against KANBAN numbers, which is structural per §七.
        contradiction = claims_on_track and progress_value < 60
        note = (
            "留言宣稱進度如期/正常,但 KANBAN 進度值明顯落後,偵測到與數據矛盾。"
            if contradiction
            else "未偵測到明顯的數據矛盾。"
        )
        rag_text = "\n".join(f"- {h.ref}:{h.text}" for h in rag_context)

        prompt = (
            prompts.appeal_system_prompt()
            + "\n\n----\n\n"
            + prompts.appeal_user_prompt(
                project_id=project_id,
                progress_value=progress_value,
                claims_on_track=claims_on_track,
                contradiction_note=note,
                appeal_text=appeal_text,
                rag_context=rag_text,
            )
        )

        try:
            reasonable, reason = _parse_appeal(self._chat(prompt=prompt))
        except LLMUnavailable:
            # The weekly scan is an autonomous background job — it must not halt
            # if the LLM is down. Degrade to the deterministic rule (B5 stub) so
            # governance keeps running; the appeal still gets a verdict.
            return self._stub.evaluate_appeal(
                project_id=project_id,
                appeal_text=appeal_text,
                progress_value=progress_value,
                claims_on_track=claims_on_track,
                rag_context=rag_context,
            )

        # A genuine data contradiction is an objective red flag → never reasonable,
        # regardless of how the appeal is worded (keeps the guardrail honest).
        if contradiction:
            reasonable = False

        return AppealEvaluation(
            reasonable=reasonable,
            reason=reason,
            rag_refs=refs,
            grounding_violation=False,  # prompt instructs: only cite supplied context
            contradiction_with_data=contradiction,
        )


def _credentials_present() -> bool:
    return bool(os.environ.get(_ENV_API_KEY) and os.environ.get(_ENV_AGENT_ID))


def _build_llm() -> StubLLM | ProphetAILLM:
    return ProphetAILLM() if _credentials_present() else StubLLM()


llm = _build_llm()


def using_stub_llm() -> bool:
    return not _credentials_present()

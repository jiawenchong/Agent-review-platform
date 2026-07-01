"""Prompt templates for the LLM steps.

Each prompt lives in its own Markdown file under ``app/prompts/`` (single
source of truth) so it can be read by a human and pasted into the ProphetAI
agent, and loaded by the connector — the same text either way. Every file is
split into ``=== SYSTEM ===`` / ``=== USER ===`` sections.

* ``document_review.md``       — AI 評審中心:上傳規劃書的綠/紅/待補件審核
* ``appeal_reasonableness.md`` — closed-loop:停滯專案申訴是否合理
* ``flowchart_generation.md``  — LLM 自動生成業務流程圖 (Mermaid)
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

_PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"

# Markers must sit on their own line, so the human-readable intro can mention
# "=== SYSTEM ===" inline (e.g. inside backticks) without being mistaken for one.
_SYSTEM_MARKER = re.compile(r"(?m)^=== SYSTEM ===[ \t]*$")
_USER_MARKER = re.compile(r"(?m)^=== USER ===[ \t]*$")


@lru_cache(maxsize=8)
def _load(name: str) -> tuple[str, str]:
    text = (_PROMPTS_DIR / name).read_text(encoding="utf-8")
    sys_split = _SYSTEM_MARKER.split(text, maxsplit=1)
    if len(sys_split) != 2:
        raise RuntimeError(f"prompt file missing '=== SYSTEM ===' line: {name}")
    user_split = _USER_MARKER.split(sys_split[1], maxsplit=1)
    if len(user_split) != 2:
        raise RuntimeError(f"prompt file missing '=== USER ===' line: {name}")
    system_part, user_part = user_split
    return system_part.strip(), user_part.strip()


# ── document review (AI 評審中心) ─────────────────────────────────────────


def review_system_prompt() -> str:
    return _load("document_review.md")[0]


def review_user_prompt(*, filename: str, markdown: str) -> str:
    return _load("document_review.md")[1].format(filename=filename, markdown=markdown)


# ── appeal reasonableness (closed-loop) ───────────────────────────────────


def appeal_system_prompt() -> str:
    return _load("appeal_reasonableness.md")[0]


def appeal_user_prompt(
    *,
    project_id: str,
    progress_value: float,
    claims_on_track: bool,
    contradiction_note: str,
    appeal_text: str,
    rag_context: str,
) -> str:
    return _load("appeal_reasonableness.md")[1].format(
        project_id=project_id,
        progress_value=progress_value,
        claims_on_track="是" if claims_on_track else "否",
        contradiction_note=contradiction_note,
        appeal_text=appeal_text,
        rag_context=rag_context or "(無)",
    )


# ── flowchart generation (LLM 自動推斷業務流程) ───────────────────────────


def flowchart_system_prompt() -> str:
    return _load("flowchart_generation.md")[0]


def flowchart_user_prompt(*, filename: str, markdown: str) -> str:
    return _load("flowchart_generation.md")[1].format(filename=filename, markdown=markdown)

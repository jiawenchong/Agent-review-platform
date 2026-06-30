"""Prompt templates for the LLM review step.

Single source of truth is ``app/prompts/document_review.md`` — this loader
reads it and splits the ``=== SYSTEM ===`` / ``=== USER ===`` sections, so the
prompt the ProfetAI connector sends is exactly the one a human can read and
paste into the ProfetAI skill. Keeping it in a Markdown file (rather than
inlined here) means it can be edited without touching code.
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

_PROMPT_FILE = Path(__file__).resolve().parents[1] / "prompts" / "document_review.md"

# Markers must sit on their own line, so the human-readable intro can mention
# "=== SYSTEM ===" inline (e.g. inside backticks) without being mistaken for one.
_SYSTEM_MARKER = re.compile(r"(?m)^=== SYSTEM ===[ \t]*$")
_USER_MARKER = re.compile(r"(?m)^=== USER ===[ \t]*$")


@lru_cache(maxsize=1)
def _load() -> tuple[str, str]:
    text = _PROMPT_FILE.read_text(encoding="utf-8")
    sys_split = _SYSTEM_MARKER.split(text, maxsplit=1)
    if len(sys_split) != 2:
        raise RuntimeError(f"prompt file missing '=== SYSTEM ===' line: {_PROMPT_FILE}")
    user_split = _USER_MARKER.split(sys_split[1], maxsplit=1)
    if len(user_split) != 2:
        raise RuntimeError(f"prompt file missing '=== USER ===' line: {_PROMPT_FILE}")
    system_part, user_part = user_split
    return system_part.strip(), user_part.strip()


def review_system_prompt() -> str:
    return _load()[0]


def review_user_prompt(*, filename: str, markdown: str) -> str:
    return _load()[1].format(filename=filename, markdown=markdown)

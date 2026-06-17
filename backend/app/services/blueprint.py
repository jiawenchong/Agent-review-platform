"""Structured field extraction from a planning document (Word 解析模組).

Parses a document that follows the Agent Blueprint template
(`docs/AGENT_BLUEPRINT_TEMPLATE.md`) into clean structured fields, so an
approved (綠燈) proposal can be turned into a real project record.

This is deliberately rule-based: the template's structure is fixed, so
parsing is deterministic. The semantic judgement (reasonable? approve?)
stays in the LLM layer per the §七 rule/LLM split.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_MD_HEADING = re.compile(r"^\s*#{1,4}\s+(.+?)\s*$")
# plain-text section heading: "一、目標…" / "1. 範圍" (docx/pdf extract has no markdown)
_PLAIN_HEADING = re.compile(r"^\s*((?:[一二三四五六七八九十]+、|\d+[.、])\s*\S.*)$")

# Values that are still template placeholders, not real content.
_PLACEHOLDER_MARKERS = ("[", "（由系統", "請填寫", "例:", "例：", "…", "—")

# section heading keyword → canonical field key
_SECTION_KEYS = {
    "目標": "goal",
    "範圍": "scope",
    "時程": "timeline",
    "里程碑": "timeline",
    "風險": "risk",
    "資源": "resource",
    "系統架構": "architecture",
    "架構": "architecture",
}


@dataclass
class BlueprintFields:
    agent_name: str = ""
    proposer: str = ""
    department: str = ""
    goal: str = ""
    scope: str = ""
    timeline: str = ""
    risk: str = ""
    resource: str = ""
    architecture: str = ""

    def as_dict(self) -> dict[str, str]:
        return {k: v for k, v in self.__dict__.items() if v}


def _clean(value: str) -> str:
    value = value.strip().strip("`").strip()
    if not value:
        return ""
    if any(marker in value for marker in _PLACEHOLDER_MARKERS):
        return ""
    return value


def _heading_text(line: str) -> str | None:
    """Return the heading text if this line is a heading (markdown or plain)."""
    m = _MD_HEADING.match(line)
    if m:
        return m.group(1).strip()
    m = _PLAIN_HEADING.match(line)
    if m:
        return m.group(1).strip()
    return None


def _table_kv(line: str) -> tuple[str, str] | None:
    """Parse a 2-column table row in either markdown (``| a | b |``) or the
    plain ``a | b`` form the docx/pdf extractor produces."""
    if "|" not in line:
        return None
    parts = [p.strip() for p in line.strip().strip("|").split("|")]
    parts = [p for p in parts if p]
    if len(parts) != 2:
        return None
    if all(set(p) <= {"-", ":"} for p in parts):  # markdown separator row
        return None
    return parts[0], parts[1]


def _first_meaningful(lines: list[str]) -> str:
    for line in lines:
        text = line.lstrip("-*0123456789.、 ").strip()
        # drop table separators / pure markup
        if text.startswith("|") or set(text) <= {"-", "|", " ", ":"}:
            continue
        cleaned = _clean(text)
        if cleaned:
            return cleaned
    return ""


def extract_fields(text: str) -> BlueprintFields:
    fields = BlueprintFields()

    # 1) 文件資訊 table rows
    table: dict[str, str] = {}
    for line in text.splitlines():
        kv = _table_kv(line)
        if kv:
            table[kv[0]] = kv[1]

    fields.agent_name = _clean(table.get("Agent 名稱", ""))
    proposer_dept = _clean(table.get("提案人 / 部門", "")) or _clean(table.get("提案人/部門", ""))
    if proposer_dept and "/" in proposer_dept:
        proposer, dept = proposer_dept.split("/", 1)
        fields.proposer = proposer.strip()
        fields.department = dept.strip()
    elif proposer_dept:
        fields.proposer = proposer_dept

    # 2) sections by heading
    current_key: str | None = None
    buckets: dict[str, list[str]] = {}
    for line in text.splitlines():
        heading = _heading_text(line)
        if heading is not None:
            current_key = None
            for keyword, key in _SECTION_KEYS.items():
                if keyword in heading:
                    current_key = key
                    buckets.setdefault(key, [])
                    break
            continue
        if current_key:
            buckets[current_key].append(line)

    for key, lines in buckets.items():
        value = _first_meaningful(lines)
        if value and not getattr(fields, key):
            setattr(fields, key, value)

    # 3) fall back to the first markdown title for the agent name, skipping
    #    section headings (numbered / keyworded) and the template's own title.
    if not fields.agent_name:
        for line in text.splitlines():
            heading = _heading_text(line)
            if heading is None:
                # only markdown H1 titles qualify here; plain text uses table
                m = _MD_HEADING.match(line)
                if not m:
                    continue
                heading = m.group(1).strip()
            candidate = _clean(heading)
            if not candidate or _is_section_heading(candidate):
                continue
            if any(skip in candidate for skip in ("範本", "規劃書", "藍圖")):
                continue
            fields.agent_name = candidate
            break

    return fields


def _is_section_heading(heading: str) -> bool:
    if re.match(r"^\s*(?:[一二三四五六七八九十]+、|\d+[.、)])", heading):
        return True
    if any(keyword in heading for keyword in _SECTION_KEYS):
        return True
    return "★" in heading or "必填" in heading

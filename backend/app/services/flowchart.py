"""Autonomous flowchart generation (計畫流程圖生成 — Mermaid.js).

Turns a planning document into a Mermaid `flowchart` definition. Two modes:

1. **structured** — the document follows the planning-doc template's
   "流程定義 (Flow Definition)" block, where each step is written as
   ``S1 [process] 標籤 -> S2`` (with optional branch labels
   ``-> 是:S2 | 否:S9``). This is parsed precisely.
2. **inferred** — for free-form documents with no flow block, a flow is
   inferred from the document's section headings (the AI 評審中心 / LLM step
   would do this with a model; the stub uses a deterministic heuristic so it
   runs without a GPU).

Both modes emit the same Mermaid contract the frontend renders.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# Mermaid node shapes per step type.
_SHAPES: dict[str, tuple[str, str]] = {
    "start": ("([", "])"),
    "end": ("([", "])"),
    "process": ("[", "]"),
    "decision": ("{", "}"),
    "io": ("[/", "/]"),
    "subprocess": ("[[", "]]"),
}

# A step line: "S1 [process] 接收文件 -> S2"  /  "- S3 [decision] ok? -> 是:S4 | 否:S9"
_STEP_RE = re.compile(
    r"^[-*\s]*([A-Za-z][\w]*)\s*\[(\w+)\]\s*(.+?)\s*(?:->\s*(.+))?$"
)
# Section heading: "一、…", "1. …", "## …", "三、整體架構設計"
_HEADING_RE = re.compile(r"^\s*(?:#{1,4}\s+|[一二三四五六七八九十]+、|\d+[.、)]\s*)(.+)$")


@dataclass
class FlowNode:
    id: str
    type: str
    label: str
    transitions: list[tuple[str | None, str]] = field(default_factory=list)


@dataclass
class FlowchartResult:
    mermaid: str
    mode: str          # "structured" | "inferred"
    node_count: int


def _sanitize(label: str) -> str:
    return label.replace('"', "'").strip()


def _parse_transitions(raw: str | None) -> list[tuple[str | None, str]]:
    if not raw:
        return []
    out: list[tuple[str | None, str]] = []
    for part in raw.split("|"):
        part = part.strip()
        if not part:
            continue
        if ":" in part:
            edge, target = part.split(":", 1)
            out.append((edge.strip(), target.strip()))
        else:
            out.append((None, part))
    return out


def parse_structured(text: str) -> list[FlowNode]:
    nodes: list[FlowNode] = []
    for line in text.splitlines():
        m = _STEP_RE.match(line.strip())
        if not m:
            continue
        node_id, ntype, label, trans = m.groups()
        if ntype.lower() not in _SHAPES:
            continue
        nodes.append(
            FlowNode(
                id=node_id,
                type=ntype.lower(),
                label=_sanitize(label),
                transitions=_parse_transitions(trans),
            )
        )
    return nodes


def _infer_nodes(text: str) -> list[FlowNode]:
    """Build a linear flow from section headings (fallback, deterministic)."""
    headings: list[str] = []
    for line in text.splitlines():
        m = _HEADING_RE.match(line)
        if m:
            label = _sanitize(m.group(1))
            if 2 <= len(label) <= 40:
                headings.append(label)
    headings = headings[:12]  # keep the diagram readable

    nodes: list[FlowNode] = [FlowNode(id="N0", type="start", label="開始")]
    if not headings:
        nodes.append(FlowNode(id="N1", type="process", label="處理文件內容"))
        headings_ids = ["N1"]
    else:
        headings_ids = []
        for i, h in enumerate(headings, start=1):
            nodes.append(FlowNode(id=f"N{i}", type="process", label=h))
            headings_ids.append(f"N{i}")
    nodes.append(FlowNode(id="NE", type="end", label="完成"))

    chain = ["N0", *headings_ids, "NE"]
    for src, dst in zip(chain, chain[1:]):
        node = next(n for n in nodes if n.id == src)
        node.transitions.append((None, dst))
    return nodes


def render_mermaid(nodes: list[FlowNode], *, direction: str = "LR") -> str:
    # LR (left-to-right) matches the reference blueprint diagrams the
    # governance team draws by hand; TD reads as a long vertical scroll.
    lines = [f"flowchart {direction}"]
    for n in nodes:
        open_b, close_b = _SHAPES.get(n.type, ("[", "]"))
        lines.append(f'    {n.id}{open_b}"{n.label}"{close_b}')
    for n in nodes:
        for edge_label, target in n.transitions:
            if edge_label:
                lines.append(f"    {n.id} -->|{_sanitize(edge_label)}| {target}")
            else:
                lines.append(f"    {n.id} --> {target}")
    return "\n".join(lines)


def generate_flowchart(text: str) -> FlowchartResult:
    structured = parse_structured(text)
    if len(structured) >= 2:
        return FlowchartResult(render_mermaid(structured), "structured", len(structured))
    inferred = _infer_nodes(text)
    return FlowchartResult(render_mermaid(inferred), "inferred", len(inferred))

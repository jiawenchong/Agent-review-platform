"""External-system connectors (§九 排程與整合需求).

The planning document lists KANBAN, the Local-GPU LLM server and the RAG
vector store as 待確認 integrations. None of them are reachable from this
environment, so each is expressed as a small Protocol with a deterministic
stub implementation. Swapping in a real connector later is a matter of
implementing the same interface and selecting it via settings — no caller
needs to change.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Protocol

from ..config import settings


# ── KANBAN ─────────────────────────────────────────────────────────────


@dataclass
class KanbanProgress:
    progress_value: float            # 0..100
    last_change: datetime
    available: bool = True           # False → triggers Capability guardrail


class KanbanConnector(Protocol):
    def fetch_progress(self, kanban_ref: str | None) -> KanbanProgress: ...


class StubKanban:
    """Deterministic stub: derives a stable pseudo-progress from the ref.

    A ref of ``None`` or one prefixed ``UNAVAILABLE`` simulates an API
    failure so the Capability guardrail can be exercised end-to-end.
    """

    def __init__(self) -> None:
        self._overrides: dict[str, KanbanProgress] = {}

    def set(self, kanban_ref: str, progress: KanbanProgress) -> None:
        self._overrides[kanban_ref] = progress

    def fetch_progress(self, kanban_ref: str | None) -> KanbanProgress:
        if not kanban_ref or kanban_ref.startswith("UNAVAILABLE"):
            return KanbanProgress(progress_value=0.0, last_change=datetime.utcnow(), available=False)
        if kanban_ref in self._overrides:
            return self._overrides[kanban_ref]
        h = int(hashlib.sha256(kanban_ref.encode()).hexdigest(), 16)
        return KanbanProgress(
            progress_value=float(h % 101),
            last_change=datetime.utcnow() - timedelta(days=h % 30),
        )


# ── RAG knowledge base ─────────────────────────────────────────────────


@dataclass
class RagHit:
    ref: str
    text: str
    score: float


@dataclass
class StubRag:
    """In-memory RAG store (settings.rag_backend == 'memory').

    Holds project history and strategy templates; ``query`` returns the
    closest entries. ``write_back`` records resolved positive cases, exactly
    as the Feedback stage requires.
    """

    _docs: list[RagHit] = field(default_factory=list)

    def seed(self, docs: list[tuple[str, str]]) -> None:
        self._docs = [RagHit(ref=r, text=t, score=1.0) for r, t in docs]

    def query(self, project_id: str, text: str, k: int = 3) -> list[RagHit]:
        terms = set(text)
        scored: list[RagHit] = []
        for d in self._docs:
            overlap = len(terms & set(d.text))
            if project_id in d.ref or overlap:
                scored.append(RagHit(ref=d.ref, text=d.text, score=float(overlap)))
        scored.sort(key=lambda h: h.score, reverse=True)
        return scored[:k]

    def write_back(self, project_id: str, outcome: str) -> None:
        self._docs.append(
            RagHit(ref=f"{project_id}:resolved:{datetime.utcnow().isoformat()}",
                   text=f"專案 {project_id} 停滯已解除（{outcome}），列為正向案例。", score=1.0)
        )


# ── singletons (selected by settings) ──────────────────────────────────

kanban: KanbanConnector = StubKanban()
rag = StubRag()


def using_stub_kanban() -> bool:
    return not settings.kanban_base_url

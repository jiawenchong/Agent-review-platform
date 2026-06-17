"""Upload ingestion pipeline.

For each uploaded file: extract text (any supported type) → persist →
hand the text to the LLM (AI 評審中心) for 判讀. A parse failure is recorded
as a failed document and, per the Capability guardrail (§八), surfaced as an
explicit failure rather than fabricated content.
"""
from __future__ import annotations

import re
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Document, DocumentStatus, GuardrailType, Project, ProjectStatus
from .blueprint import extract_fields
from .extraction import ExtractionError, extract_text
from .flowchart import generate_flowchart
from .guardrails import record_event
from .llm import llm


def ingest_file(db: Session, *, filename: str, data: bytes) -> Document:
    doc = Document(filename=filename, size_bytes=len(data), status=DocumentStatus.PARSING)
    db.add(doc)
    db.flush()

    try:
        kind, text = extract_text(filename, data)
    except ExtractionError as exc:
        doc.status = DocumentStatus.FAILED
        doc.error = str(exc)
        # Capability guardrail: cannot obtain data → halt, do not fabricate.
        record_event(
            db,
            project_id=f"DOC-{doc.document_id}",
            guardrail_type=GuardrailType.CAPABILITY,
            detail=f"文件解析失敗({filename}):{exc};已標示無法取得資料,不生成內容。",
            resolution="要求重新上傳",
        )
        db.commit()
        db.refresh(doc)
        return doc

    doc.kind = kind
    doc.extracted_text = text
    doc.char_count = len(text)

    review = llm.review_document(filename=filename, text=text)
    doc.llm_verdict = review.verdict
    doc.llm_summary = review.summary
    doc.llm_key_points = review.key_points
    doc.llm_reasons = review.reasons

    # 計畫流程圖生成 — auto-produce a Mermaid flowchart from the document.
    flow = generate_flowchart(text)
    doc.flowchart_mermaid = flow.mermaid
    doc.flowchart_mode = flow.mode

    # 結構化欄位抽取 (Word 解析模組)
    fields = extract_fields(text)
    doc.extracted_fields = fields.as_dict()

    # 自動建立專案:僅在 AI 評審中心核准 (綠燈) 且有 Agent 名稱時。
    if review.verdict == "綠燈" and fields.agent_name:
        project = _create_project_from_fields(db, fields)
        doc.created_project_id = project.project_id

    doc.status = DocumentStatus.DONE

    db.commit()
    db.refresh(doc)
    return doc


def _next_project_id(db: Session) -> str:
    max_n = 0
    for (pid,) in db.query(Project.project_id).all():
        m = re.search(r"(\d+)$", pid or "")
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"PROJ-{max_n + 1:03d}"


def _create_project_from_fields(db: Session, fields) -> Project:
    project = Project(
        project_id=_next_project_id(db),
        name=fields.agent_name,
        owner_id=fields.proposer or "未指定",
        department=fields.department or "未分類",
        status=ProjectStatus.NORMAL,
        kanban_ref=None,
        last_update_timestamp=datetime.utcnow(),
    )
    db.add(project)
    db.flush()
    return project

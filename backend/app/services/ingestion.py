"""Upload ingestion pipeline.

For each uploaded file: extract text (any supported type) → persist →
hand the text to the LLM (AI 評審中心) for 判讀. A parse failure is recorded
as a failed document and, per the Capability guardrail (§八), surfaced as an
explicit failure rather than fabricated content.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import Document, DocumentStatus, GuardrailType
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

    doc.status = DocumentStatus.DONE

    db.commit()
    db.refresh(doc)
    return doc

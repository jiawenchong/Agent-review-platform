"""Upload ingestion tests — extraction + LLM 判讀 across file types."""
from __future__ import annotations

import io

import pytest
from docx import Document as DocxDocument
from pptx import Presentation

from app.models import Document, DocumentStatus, GuardrailEvent, GuardrailType
from app.services.extraction import ExtractionError, extract_text
from app.services.ingestion import ingest_file

PROPOSAL = "目標:提升風控。範圍:全行。時程:Q3。風險:資料缺漏。資源:兩名工程師。里程碑:三階段。"


def _docx_bytes(text: str) -> bytes:
    doc = DocxDocument()
    for line in text.split("。"):
        if line:
            doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _pptx_bytes(text: str) -> bytes:
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    box = slide.shapes.add_textbox(0, 0, 600, 400)
    box.text_frame.text = text
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def test_extract_docx():
    kind, text = extract_text("plan.docx", _docx_bytes(PROPOSAL))
    assert kind == "docx"
    assert "目標" in text and "里程碑" in text


def test_extract_pptx():
    kind, text = extract_text("deck.pptx", _pptx_bytes(PROPOSAL))
    assert kind == "pptx"
    assert "Slide 1" in text and "目標" in text


def test_extract_txt():
    kind, text = extract_text("notes.txt", PROPOSAL.encode("utf-8"))
    assert kind == "txt"
    assert "里程碑" in text


def test_unsupported_type_raises():
    with pytest.raises(ExtractionError):
        extract_text("image.png", b"\x89PNG")
    with pytest.raises(ExtractionError):
        extract_text("plan.pdf", b"%PDF-1.4 ...")


def test_ingest_complete_proposal_is_green(db):
    doc = ingest_file(db, filename="plan.docx", data=_docx_bytes(PROPOSAL))
    assert doc.status == DocumentStatus.DONE
    assert doc.char_count > 0
    assert doc.llm_verdict == "綠燈"


def test_ingest_failure_records_capability_guardrail(db):
    doc = ingest_file(db, filename="broken.docx", data=b"not a real docx")
    assert doc.status == DocumentStatus.FAILED
    assert doc.error
    events = db.query(GuardrailEvent).filter_by(guardrail_type=GuardrailType.CAPABILITY).all()
    assert len(events) == 1


def test_ingest_multiple_kinds(db):
    files = {
        "a.txt": PROPOSAL.encode("utf-8"),
        "b.pptx": _pptx_bytes(PROPOSAL),
        "c.docx": _docx_bytes(PROPOSAL),
    }
    for name, data in files.items():
        ingest_file(db, filename=name, data=data)
    assert db.query(Document).count() == 3

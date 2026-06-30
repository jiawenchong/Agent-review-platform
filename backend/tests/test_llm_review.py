"""Tests for the Markdown extraction + ProfetAI review connector."""
from __future__ import annotations

import io

import pytest
from docx import Document as DocxDocument

from app.models import DocumentStatus, GuardrailEvent, GuardrailType
from app.services import ingestion
from app.services.extraction import extract_text
from app.services.llm import (
    DocumentReview,
    LLMUnavailable,
    ProfetAILLM,
    _extract_content,
    _parse_review,
)


def _docx_with_heading_and_table() -> bytes:
    doc = DocxDocument()
    doc.add_heading("專案目標", level=1)
    doc.add_paragraph("提升風控自動化。")
    table = doc.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Agent 名稱"
    table.cell(0, 1).text = "風控小幫手"
    table.cell(1, 0).text = "提案人 / 部門"
    table.cell(1, 1).text = "Alice / 風控部"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_docx_extracts_markdown_heading_and_table():
    kind, md = extract_text("plan.docx", _docx_with_heading_and_table())
    assert kind == "docx"
    assert "# 專案目標" in md          # heading style → markdown heading
    assert "| Agent 名稱 | 風控小幫手 |" in md  # table → GFM table
    assert "| --- | --- |" in md


# ── response parsing ────────────────────────────────────────────────────


def test_extract_content_openai_shape():
    data = {"choices": [{"message": {"content": "hello"}}]}
    assert _extract_content(data) == "hello"


def test_extract_content_unknown_shape_raises():
    with pytest.raises(LLMUnavailable):
        _extract_content({"unexpected": True})


def test_parse_review_accepts_fenced_json():
    content = '```json\n{"verdict": "綠燈", "summary": "ok", "key_points": ["a"], "reasons": ["b"]}\n```'
    review = _parse_review(content, filename="x.docx")
    assert isinstance(review, DocumentReview)
    assert review.verdict == "綠燈"
    assert review.key_points == ["a"]


def test_parse_review_rejects_unknown_verdict():
    with pytest.raises(LLMUnavailable):
        _parse_review('{"verdict": "黃燈"}', filename="x.docx")


def test_parse_review_rejects_non_json():
    with pytest.raises(LLMUnavailable):
        _parse_review("the document looks fine to me", filename="x.docx")


# ── ProfetAILLM (monkeypatched transport) ─────────────────────────────────


def test_profetai_review_document_success(monkeypatch):
    client = ProfetAILLM()
    monkeypatch.setattr(
        client,
        "_chat",
        lambda **kw: '{"verdict": "紅燈", "summary": "缺章節", "reasons": ["缺風險"]}',
    )
    review = client.review_document(filename="p.docx", text="# 目標\n...")
    assert review.verdict == "紅燈"
    assert review.reasons == ["缺風險"]


def test_profetai_review_document_unavailable_propagates(monkeypatch):
    client = ProfetAILLM()

    def _boom(**kw):
        raise LLMUnavailable("connection refused")

    monkeypatch.setattr(client, "_chat", _boom)
    with pytest.raises(LLMUnavailable):
        client.review_document(filename="p.docx", text="x")


# ── ingestion: LLM failure → 無法審核 + Capability guardrail ───────────────


def test_ingest_llm_unavailable_marks_unreviewable(db, monkeypatch):
    class FailingLLM:
        def review_document(self, **kw):
            raise LLMUnavailable("api down")

    monkeypatch.setattr(ingestion, "llm", FailingLLM())
    doc = ingestion.ingest_file(
        db, filename="plan.txt", data="目標 範圍 時程 風險 資源 里程碑".encode("utf-8")
    )
    # File parsed fine, only the review failed.
    assert doc.status == DocumentStatus.DONE
    assert doc.llm_verdict == "無法審核"
    assert doc.created_project_id is None  # never auto-approve on failure
    events = db.query(GuardrailEvent).filter_by(guardrail_type=GuardrailType.CAPABILITY).all()
    assert len(events) == 1

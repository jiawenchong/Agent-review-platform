"""Document text extraction.

Accepts DOCX / PPTX (and plain text) and pulls all readable text out,
regardless of type. Used by the upload ingestion endpoint as the first stage
before the LLM "判讀" (AI 評審中心) step.

PDF is intentionally not supported: every PDF-parsing library tried so far
(PyMuPDF, pypdf) got blocked by the company's package-approval policy, which
applies to any new dependency regardless of license. Re-add PDF support once
a library has been approved, or implement a pure-stdlib parser if that
approval never comes.

Per the Capability guardrail (§八), a parse failure must surface as an
explicit "無法取得資料" rather than fabricated content — so callers treat an
``ExtractionError`` as a hard stop, never as empty-but-ok text.
"""
from __future__ import annotations

import io

from docx import Document as DocxDocument
from pptx import Presentation


class ExtractionError(Exception):
    """Raised when a file cannot be parsed (→ Capability guardrail)."""


# extension → canonical kind
SUPPORTED = {
    ".docx": "docx",
    ".pptx": "pptx",
    ".txt": "txt",
    ".md": "txt",
}


def detect_kind(filename: str) -> str | None:
    lower = filename.lower()
    for ext, kind in SUPPORTED.items():
        if lower.endswith(ext):
            return kind
    return None


def _extract_docx(data: bytes) -> str:
    doc = DocxDocument(io.BytesIO(data))
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def _extract_pptx(data: bytes) -> str:
    prs = Presentation(io.BytesIO(data))
    parts: list[str] = []
    for i, slide in enumerate(prs.slides, start=1):
        parts.append(f"# Slide {i}")
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    text = "".join(run.text for run in para.runs).strip()
                    if text:
                        parts.append(text)
    return "\n".join(parts)


def extract_text(filename: str, data: bytes) -> tuple[str, str]:
    """Return (kind, extracted_text). Raises ExtractionError on failure."""
    kind = detect_kind(filename)
    if kind is None:
        raise ExtractionError(f"不支援的檔案格式:{filename}")
    if not data:
        raise ExtractionError("檔案內容為空,無法解析。")
    try:
        if kind == "docx":
            text = _extract_docx(data)
        elif kind == "pptx":
            text = _extract_pptx(data)
        else:  # txt / md
            text = data.decode("utf-8", errors="replace")
    except ExtractionError:
        raise
    except Exception as exc:  # noqa: BLE001 — any parser error → Capability halt
        raise ExtractionError(f"解析失敗:{exc}") from exc

    if not text.strip():
        raise ExtractionError("檔案中未擷取到任何文字內容。")
    return kind, text

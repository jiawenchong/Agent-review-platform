"""Validation Report router — interview, compile, generate PPTX + PDF preview.

Endpoints:
  POST   /api/validation-report/session          → create new session
  POST   /api/validation-report/chat             → send message, get LLM response
  POST   /api/validation-report/generate         → compile JSON → PPTX → PDF
  GET    /api/validation-report/preview/{sid}    → serve PDF
  GET    /api/validation-report/download/{sid}   → serve PPTX
  DELETE /api/validation-report/session/{sid}    → clear session + temp files

Sessions are stored in-memory (dict) and persist until explicitly cleared or
the server restarts. Each session holds the full message history, plus
pptx_path/pdf_path once generation is complete.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..services import extraction
from ..services import validation_report_service as svc

router = APIRouter(prefix="/api/validation-report", tags=["validation-report"])

# ── in-memory session store ──────────────────────────────────────────────────
# { session_id: { "messages": [...], "documents": [...],
#                 "pptx_path": Path|None, "pdf_path": Path|None } }
_sessions: dict[str, dict] = {}


# ── request / response models ────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    message: str


class CompileRequest(BaseModel):
    session_id: str


class GenerateRequest(BaseModel):
    session_id: str
    # When provided, this structured form is used directly as the report data
    # (deterministic — the user filled the form themselves). When omitted, the
    # conversation + uploaded documents are compiled via the LLM instead.
    form: dict | None = None


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_session(session_id: str) -> dict:
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return session


# ── endpoints ────────────────────────────────────────────────────────────────

@router.post("/session")
def create_session() -> dict:
    """Create a new interview session."""
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "messages": [],
        "documents": [],
        "pptx_path": None,
        "pdf_path": None,
    }
    return {"session_id": session_id}


@router.post("/chat")
def chat(body: ChatRequest) -> dict:
    """Send a user message and get the assistant's response.

    Appends the user message to the session history, calls the interview LLM,
    appends the assistant response, and returns the updated history.
    """
    session = _get_session(body.session_id)
    messages: list[dict] = session["messages"]

    # Append the new user message
    messages.append({"role": "user", "content": body.message})

    # Get LLM response (never raises — falls back to stub message on error)
    response = svc.get_interview_response(messages, documents=session.get("documents"))

    # Append assistant response
    messages.append({"role": "assistant", "content": response})

    return {"response": response, "messages": messages}


@router.post("/upload")
async def upload_document(
    session_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict:
    """Upload a source document (DOCX/PPTX/TXT/MD). Its text is extracted and
    kept as reference material for both the interview and the compile step, and
    the assistant is asked to read + analyse it right away.
    """
    session = _get_session(session_id)
    raw = await file.read()

    try:
        kind, text = extraction.extract_text(file.filename or "uploaded", raw)
    except extraction.ExtractionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    documents: list[dict] = session.setdefault("documents", [])
    documents.append({"filename": file.filename or "uploaded", "kind": kind, "text": text})

    # Add a short marker to the visible chat (the full text lives in
    # session["documents"] and is folded into the LLM context, so the chat
    # transcript stays readable) and get the assistant to analyse it.
    messages: list[dict] = session["messages"]
    messages.append({
        "role": "user",
        "content": f"（已上傳文件:{file.filename}，共 {len(text)} 字，請幫我解讀內容）",
    })
    response = svc.get_interview_response(messages, documents=documents)
    messages.append({"role": "assistant", "content": response})

    return {
        "filename": file.filename,
        "kind": kind,
        "char_count": len(text),
        "messages": messages,
        "document_count": len(documents),
    }


@router.post("/compile")
def compile_form(body: CompileRequest) -> dict:
    """Analyse the conversation + uploaded documents and return structured JSON
    to pre-fill the report form. Empty fields come back as "" (the user fills
    or corrects them before generating).
    """
    session = _get_session(body.session_id)
    data = svc.compile_json(session["messages"], documents=session.get("documents"))
    has_source = bool(session["messages"]) or bool(session.get("documents"))
    return {
        "data": data,
        "llm_available": svc.validation_llm_available(),
        "has_source": has_source,
    }


@router.post("/generate")
def generate(body: GenerateRequest) -> dict:
    """Compile conversation → JSON → PPTX → PDF.

    Stores pptx_path and pdf_path in the session.
    Returns {"ready": true} on success.
    """
    session = _get_session(body.session_id)

    # Prefer the explicit form (deterministic); otherwise compile from the
    # conversation + uploaded documents via the LLM.
    if body.form is not None:
        data = body.form
    else:
        messages: list[dict] = session["messages"]
        if not messages:
            raise HTTPException(
                status_code=400,
                detail="沒有可用的資料 — 請先填寫報告表單,或進行訪談/上傳文件。",
            )
        data = svc.compile_json(messages, documents=session.get("documents"))

    # Step 2: generate PPTX
    try:
        pptx_path = svc.generate_pptx(data, body.session_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PPTX generation failed: {exc}") from exc

    # Step 3: convert to PDF (optional — PDF preview may not be available without LibreOffice)
    pdf_path = svc.to_pdf(pptx_path)

    session["pptx_path"] = pptx_path
    session["pdf_path"] = pdf_path

    return {"ready": True, "has_pdf": pdf_path is not None}


@router.get("/preview/{session_id}")
def preview(session_id: str) -> FileResponse:
    """Serve the generated PDF for inline preview."""
    session = _get_session(session_id)
    pdf_path: Path | None = session.get("pdf_path")

    if pdf_path is None or not pdf_path.exists():
        raise HTTPException(
            status_code=404,
            detail="PDF preview not available. Generate the report first, or LibreOffice may not be installed.",
        )

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename="AI_Agent_Validation_Report.pdf",
    )


@router.get("/download/{session_id}")
def download(session_id: str) -> FileResponse:
    """Serve the generated PPTX for download."""
    session = _get_session(session_id)
    pptx_path: Path | None = session.get("pptx_path")

    if pptx_path is None or not pptx_path.exists():
        raise HTTPException(
            status_code=404,
            detail="PPTX not found. Generate the report first.",
        )

    return FileResponse(
        path=str(pptx_path),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename="AI_Agent_Validation_Report.pptx",
    )


@router.delete("/session/{session_id}")
def delete_session(session_id: str) -> dict:
    """Clear the session and delete its temp files."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    svc.cleanup_session(session_id)
    del _sessions[session_id]

    return {"ok": True}

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

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..services import validation_report_service as svc

router = APIRouter(prefix="/api/validation-report", tags=["validation-report"])

# ── in-memory session store ──────────────────────────────────────────────────
# { session_id: { "messages": [...], "pptx_path": Path|None, "pdf_path": Path|None } }
_sessions: dict[str, dict] = {}


# ── request / response models ────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    message: str


class GenerateRequest(BaseModel):
    session_id: str


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
    response = svc.get_interview_response(messages)

    # Append assistant response
    messages.append({"role": "assistant", "content": response})

    return {"response": response, "messages": messages}


@router.post("/generate")
def generate(body: GenerateRequest) -> dict:
    """Compile conversation → JSON → PPTX → PDF.

    Stores pptx_path and pdf_path in the session.
    Returns {"ready": true} on success.
    """
    session = _get_session(body.session_id)
    messages: list[dict] = session["messages"]

    if not messages:
        raise HTTPException(status_code=400, detail="No conversation to compile — start chatting first.")

    # Step 1: compile conversation to structured JSON
    data = svc.compile_json(messages)

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

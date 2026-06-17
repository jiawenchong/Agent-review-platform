"""Document upload + ingestion (Upload page backend).

Accepts one or many files of any supported type (PDF / DOCX / PPTX / TXT),
extracts their text, and runs the LLM 判讀 (AI 評審中心) step. Auth is
intentionally not enforced here — the Upload entry is the proposal intake
point and is decoupled from the project ACL.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Document
from ..schemas import (
    DocumentOut,
    DocumentSummary,
    FlowchartOut,
    FlowchartRequest,
)
from ..services.extraction import SUPPORTED
from ..services.flowchart import generate_flowchart
from ..services.ingestion import ingest_file

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.get("/supported")
def supported_types() -> dict:
    return {"extensions": sorted(SUPPORTED.keys())}


@router.post("", response_model=list[DocumentOut], status_code=201)
async def upload_documents(files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    if not files:
        raise HTTPException(status_code=400, detail="未提供檔案")
    results: list[Document] = []
    for upload in files:
        data = await upload.read()
        doc = ingest_file(db, filename=upload.filename or "untitled", data=data)
        results.append(doc)
    return results


@router.post("/flowchart-preview", response_model=FlowchartOut)
def preview_flowchart(payload: FlowchartRequest) -> FlowchartOut:
    """Generate a Mermaid flowchart from raw text without persisting anything."""
    flow = generate_flowchart(payload.text)
    return FlowchartOut(mermaid=flow.mermaid, mode=flow.mode, node_count=flow.node_count)


@router.get("", response_model=list[DocumentSummary])
def list_documents(db: Session = Depends(get_db)):
    return db.query(Document).order_by(Document.uploaded_at.desc()).all()


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="找不到文件")
    return doc


@router.post("/{document_id}/flowchart", response_model=DocumentOut)
def regenerate_flowchart(document_id: int, db: Session = Depends(get_db)):
    """Re-run 計畫流程圖生成 for an already-ingested document."""
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="找不到文件")
    if not doc.extracted_text:
        raise HTTPException(status_code=409, detail="文件尚無擷取內容,無法生成流程圖")
    flow = generate_flowchart(doc.extracted_text)
    doc.flowchart_mermaid = flow.mermaid
    doc.flowchart_mode = flow.mode
    db.commit()
    db.refresh(doc)
    return doc

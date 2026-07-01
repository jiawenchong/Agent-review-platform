"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from .models import (
    DocumentStatus,
    GuardrailType,
    LLMVerdict,
    NotificationType,
    ProjectStatus,
    ReportSource,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


# ── projects ───────────────────────────────────────────────────────────


class ProjectCreate(BaseModel):
    project_id: str
    name: str
    owner_id: str
    department: str
    kanban_ref: str | None = None
    last_update_timestamp: datetime | None = None


class ProjectOut(ORMModel):
    project_id: str
    name: str
    owner_id: str
    department: str
    status: ProjectStatus
    kanban_ref: str | None
    created_at: datetime
    last_update_timestamp: datetime
    score: int
    ai_auto_approval: bool
    consecutive_unresolved: int
    priority_band: str | None


# ── snapshots ──────────────────────────────────────────────────────────


class SnapshotOut(ORMModel):
    snapshot_id: int
    project_id: str
    scan_time: datetime
    progress_value: float
    is_stalled: bool
    days_stalled: int


# ── appeals ────────────────────────────────────────────────────────────


class AppealCreate(BaseModel):
    project_id: str
    owner_id: str
    content: str


class AppealOut(ORMModel):
    appeal_id: int
    project_id: str
    owner_id: str
    submitted_at: datetime
    content: str
    llm_verdict: LLMVerdict | None
    llm_reason: str | None
    rag_refs: list | None


# ── guardrail events ───────────────────────────────────────────────────


class GuardrailEventOut(ORMModel):
    event_id: int
    project_id: str
    guardrail_type: GuardrailType
    triggered_at: datetime
    detail: str
    resolution: str | None


# ── notifications ──────────────────────────────────────────────────────


class NotificationOut(ORMModel):
    notification_id: int
    project_id: str
    recipient_id: str
    type: NotificationType
    title: str
    body: str
    sent_at: datetime
    read_at: datetime | None
    action_url: str | None


# ── reports ────────────────────────────────────────────────────────────


class ReportOut(ORMModel):
    report_id: str
    period: str
    generated_at: datetime
    file_url: str | None
    generated_by: ReportSource
    summary: str | None


# ── documents / uploads ────────────────────────────────────────────────


class DocumentOut(ORMModel):
    document_id: int
    filename: str
    kind: str | None
    size_bytes: int
    uploaded_at: datetime
    status: DocumentStatus
    char_count: int
    extracted_text: str | None
    error: str | None
    llm_verdict: str | None
    llm_summary: str | None
    llm_key_points: list | None
    llm_reasons: list | None
    flowchart_mermaid: str | None
    flowchart_mode: str | None
    extracted_fields: dict | None
    created_project_id: str | None


class FlowchartRequest(BaseModel):
    text: str


class FlowchartOut(BaseModel):
    mermaid: str
    mode: str
    node_count: int


class DocumentSummary(ORMModel):
    """List view — omits the (potentially large) extracted text."""

    document_id: int
    filename: str
    kind: str | None
    size_bytes: int
    uploaded_at: datetime
    status: DocumentStatus
    char_count: int
    error: str | None
    llm_verdict: str | None
    llm_summary: str | None
    created_project_id: str | None


# ── scan ───────────────────────────────────────────────────────────────


class ScanResult(BaseModel):
    project_id: str
    status: ProjectStatus
    priority_band: str | None
    is_stalled: bool
    days_stalled: int
    verdict: LLMVerdict | None = None
    actions: list[str] = []
    guardrails_triggered: list[GuardrailType] = []


class ScanRunOut(BaseModel):
    scanned: int
    results: list[ScanResult]


# ── users ──────────────────────────────────────────────────────────────


class UserOut(ORMModel):
    user_id: str
    name: str
    is_manager: bool
    project_ids: list[str]

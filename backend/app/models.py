"""ORM models — the six tables from §五 資料模型 of the backend planning doc.

Columns follow the planning document's "欄位建議" closely. Statuses and
enumerations use the exact Chinese / English labels defined in the spec so
the API contract matches the design vocabulary directly.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


# ── enumerations (mirror the planning-doc vocabulary) ──────────────────


class ProjectStatus(str, enum.Enum):
    NORMAL = "正常"
    WATCH = "觀察中"
    RED = "紅線觸發"


class LLMVerdict(str, enum.Enum):
    REASONABLE = "合理"
    UNREASONABLE = "不合理"


class GuardrailType(str, enum.Enum):
    CAPABILITY = "Capability"
    GROUNDING = "Grounding"
    HALLUCINATION = "Hallucination"
    GOAL = "Goal"
    INFORMATION_ISOLATION = "Information Isolation"
    ESCALATION = "Escalation"


class NotificationType(str, enum.Enum):
    STALL_ALERT = "停滯預警"
    ESCALATION = "升級通知"


class ReportSource(str, enum.Enum):
    SYSTEM = "system"
    MANUAL = "manual"


# ── tables ─────────────────────────────────────────────────────────────


class Project(Base):
    __tablename__ = "projects"

    project_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    owner_id: Mapped[str] = mapped_column(String, nullable=False)
    department: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus), default=ProjectStatus.NORMAL, nullable=False
    )
    kanban_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_update_timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    # governance bookkeeping (derived from the closed-loop, kept on the row
    # so the dashboard can read current state without recomputing)
    score: Mapped[int] = mapped_column(Integer, default=100)
    ai_auto_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    consecutive_unresolved: Mapped[int] = mapped_column(Integer, default=0)
    priority_band: Mapped[str | None] = mapped_column(String, nullable=True)  # #1/#2/#3

    snapshots: Mapped[list["ProgressSnapshot"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    appeals: Mapped[list["Appeal"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProgressSnapshot(Base):
    __tablename__ = "progress_snapshots"

    snapshot_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.project_id"))
    scan_time: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    progress_value: Mapped[float] = mapped_column(default=0.0)
    is_stalled: Mapped[bool] = mapped_column(Boolean, default=False)
    days_stalled: Mapped[int] = mapped_column(Integer, default=0)

    project: Mapped["Project"] = relationship(back_populates="snapshots")


class Appeal(Base):
    __tablename__ = "appeals"

    appeal_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.project_id"))
    owner_id: Mapped[str] = mapped_column(String, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    content: Mapped[str] = mapped_column(Text, nullable=False)
    llm_verdict: Mapped[LLMVerdict | None] = mapped_column(Enum(LLMVerdict), nullable=True)
    llm_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    rag_refs: Mapped[list | None] = mapped_column(JSON, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="appeals")


class GuardrailEvent(Base):
    __tablename__ = "guardrail_events"

    event_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.project_id"))
    guardrail_type: Mapped[GuardrailType] = mapped_column(Enum(GuardrailType), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    notification_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.project_id"))
    recipient_id: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False, default="")
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    action_url: Mapped[str | None] = mapped_column(String, nullable=True)


class Report(Base):
    __tablename__ = "reports"

    report_id: Mapped[str] = mapped_column(String, primary_key=True)
    period: Mapped[str] = mapped_column(String, nullable=False)  # 年月, e.g. 2026-06
    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    file_url: Mapped[str | None] = mapped_column(String, nullable=True)
    generated_by: Mapped[ReportSource] = mapped_column(
        Enum(ReportSource), default=ReportSource.SYSTEM
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)


class DocumentStatus(str, enum.Enum):
    PARSING = "parsing"
    DONE = "done"
    FAILED = "failed"


class Document(Base):
    """An uploaded source document (PDF / DOCX / PPTX …).

    Holds the extracted text and the AI 評審中心 (LLM) interpretation. This is
    the ingestion record behind the Upload page.
    """

    __tablename__ = "documents"

    document_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str | None] = mapped_column(String, nullable=True)  # pdf/docx/pptx/txt
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus), default=DocumentStatus.PARSING, nullable=False
    )
    char_count: Mapped[int] = mapped_column(Integer, default=0)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # AI 評審中心 (LLM 判讀) output
    llm_verdict: Mapped[str | None] = mapped_column(String, nullable=True)  # 綠燈/紅燈/待補件
    llm_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_key_points: Mapped[list | None] = mapped_column(JSON, nullable=True)
    llm_reasons: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # 計畫流程圖生成 (Mermaid)
    flowchart_mermaid: Mapped[str | None] = mapped_column(Text, nullable=True)
    flowchart_mode: Mapped[str | None] = mapped_column(String, nullable=True)  # structured/inferred


class User(Base):
    """Minimal user/ACL table backing the Information Isolation guardrail.

    `project_ids` is the access-control list: which projects this principal
    may read. `is_manager` marks human managers that escalations route to.
    """

    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    is_manager: Mapped[bool] = mapped_column(Boolean, default=False)
    project_ids: Mapped[list] = mapped_column(JSON, default=list)

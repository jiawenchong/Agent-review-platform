"""Seed data.

Mirrors the frontend's `src/data/seed.ts` so the API serves the same projects
the dashboard was designed against, while adding the backend-only fields
(owner ids, kanban refs, timestamps) the closed loop needs. Timestamps are
expressed relative to "now" so stall behaviour is reproducible regardless of
when the DB is seeded.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from .models import (
    GuardrailEvent,
    GuardrailType,
    Project,
    ProjectStatus,
    Report,
    ReportSource,
    User,
)
from .services.connectors import rag


def _ago(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


PROJECTS = [
    # (id, name, dept, owner_id, status, score, kanban_ref, stalled_days)
    ("PROJ-001", "信用風險評估 Agent", "金融科技部", "U-lin", ProjectStatus.NORMAL, 94, "KB-001", 2),
    ("PROJ-002", "客服自動化 Agent", "客戶服務部", "U-chen", ProjectStatus.WATCH, 71, "KB-002", 16),
    ("PROJ-003", "反洗錢偵測 Agent", "法規遵循部", "U-wang", ProjectStatus.RED, 38, "KB-003", 18),
    ("PROJ-004", "供應鏈優化 Agent", "採購管理部", "U-wu", ProjectStatus.NORMAL, 89, "KB-004", 4),
    ("PROJ-005", "員工流動預測 Agent", "人力資源部", "U-liu", ProjectStatus.WATCH, 66, "KB-005", 14),
    ("PROJ-006", "合約風險審閱 Agent", "法務部", "U-huang", ProjectStatus.NORMAL, 91, "KB-006", 6),
]

USERS = [
    ("U-lin", "林子晴", False, ["PROJ-001"]),
    ("U-chen", "陳維倫", False, ["PROJ-002"]),
    ("U-wang", "王建志", False, ["PROJ-003"]),
    ("U-wu", "吳雅婷", False, ["PROJ-004"]),
    ("U-liu", "劉仲謙", False, ["PROJ-005"]),
    ("U-huang", "黃詩涵", False, ["PROJ-006"]),
    ("U-mgr", "張美華(主管)", True, []),
]

GUARDRAIL_EVENTS = [
    ("PROJ-003", GuardrailType.GROUNDING, 1, "模型輸出與白名單規則 WL-089 衝突,8 件高風險 STR 交易遭錯誤清除,系統自動暫停輸出。", "人工審查中"),
    ("PROJ-002", GuardrailType.ESCALATION, 3, "人工轉介率連續 3 日超過基準上限 15%(實測 32%),達升級閾值。", "已派工改善"),
    ("PROJ-003", GuardrailType.INFORMATION_ISOLATION, 20, "Agent 嘗試存取非授權資料庫(財務薪資系統),違反資訊隔離原則。", "已結案 · 權限重設"),
]

REPORTS = [
    ("RPT-2026-05", "2026-05"),
    ("RPT-2026-04", "2026-04"),
    ("RPT-2026-03", "2026-03"),
    ("RPT-2026-02", "2026-02"),
]


def seed(db: Session) -> None:
    if db.query(Project).count() > 0:
        return

    for pid, name, dept, owner, status, score, kref, stalled in PROJECTS:
        db.add(Project(
            project_id=pid, name=name, department=dept, owner_id=owner,
            status=status, score=score, kanban_ref=kref,
            last_update_timestamp=_ago(stalled),
        ))

    for uid, name, is_mgr, projects in USERS:
        db.add(User(user_id=uid, name=name, is_manager=is_mgr, project_ids=projects))

    for pid, gtype, days, detail, resolution in GUARDRAIL_EVENTS:
        ev = GuardrailEvent(project_id=pid, guardrail_type=gtype, detail=detail, resolution=resolution)
        ev.triggered_at = _ago(days)
        db.add(ev)

    for rid, period in REPORTS:
        db.add(Report(report_id=rid, period=period, generated_by=ReportSource.SYSTEM,
                      summary=f"{period} Agent 治理月報"))

    db.commit()

    # Seed the RAG store with project history / strategy templates.
    rag.seed([(p[0], f"{p[1]} 歷史治理紀錄與策略模板。") for p in PROJECTS])

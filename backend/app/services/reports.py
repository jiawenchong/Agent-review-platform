"""Report generation (§四 報告生成模組).

Aggregates current project state into a board-format monthly summary. Text
generation is itself an LLM task per §七; the stub produces a deterministic
structured summary so the endpoint works without a GPU.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models import Project, ProjectStatus, Report, ReportSource


def generate_report(db: Session, *, period: str | None = None, by: ReportSource = ReportSource.MANUAL) -> Report:
    period = period or datetime.utcnow().strftime("%Y-%m")
    projects = db.query(Project).all()
    total = len(projects)
    normal = sum(p.status == ProjectStatus.NORMAL for p in projects)
    watch = sum(p.status == ProjectStatus.WATCH for p in projects)
    red = sum(p.status == ProjectStatus.RED for p in projects)
    avg = round(sum(p.score for p in projects) / total) if total else 0

    summary = (
        f"{period} 共追蹤 {total} 個 Agent 專案:正常 {normal}、觀察中 {watch}、紅線觸發 {red},"
        f"平均治理評分 {avg}。"
    )

    report_id = f"RPT-{period}"
    report = db.get(Report, report_id)
    if report is None:
        report = Report(report_id=report_id, period=period)
        db.add(report)
    report.generated_at = datetime.utcnow()
    report.generated_by = by
    report.summary = summary
    db.commit()
    db.refresh(report)
    return report

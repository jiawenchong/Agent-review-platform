"""Full-sweep scan (§九 Cron 每 7 天全量掃描)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Project
from ..schemas import ScanResult, ScanRunOut
from .decision import weekly_scan


def run_full_scan(db: Session) -> ScanRunOut:
    results: list[ScanResult] = []
    for project in db.query(Project).all():
        results.append(weekly_scan(db, project))
    db.commit()
    return ScanRunOut(scanned=len(results), results=results)


def scheduled_scan() -> None:
    """Entry point for the APScheduler cron job (no request context)."""
    db = SessionLocal()
    try:
        run_full_scan(db)
    finally:
        db.close()

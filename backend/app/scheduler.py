"""Cron monitor scheduler (§四 Cron 監控排程 / §九).

Fires the full closed-loop sweep every `scan_interval_days` days. Uses
APScheduler's in-process background scheduler; a production deployment may
swap this for Airflow / system cron pointing at `services.scan.scheduled_scan`.
"""
from __future__ import annotations

from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .config import settings
from .services.scan import scheduled_scan

_JOB_ID = "weekly_closed_loop_scan"
_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    global _scheduler
    if not settings.enable_scheduler or _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        scheduled_scan,
        trigger=IntervalTrigger(days=settings.scan_interval_days),
        id=_JOB_ID,
        replace_existing=True,
    )
    _scheduler.start()


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def next_scan_at() -> datetime | None:
    """When the next automatic closed-loop sweep will fire, for the dashboard."""
    if _scheduler is None:
        return None
    job = _scheduler.get_job(_JOB_ID)
    return job.next_run_time if job else None

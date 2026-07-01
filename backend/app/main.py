"""FastAPI application entry point.

Wires the six data tables, the closed-loop monitor and the guardrail layer
described in the backend planning document into a runnable service. CORS is
open to the Vite dev server so the existing React frontend can consume it,
plus any private-network origin so colleagues on the same office LAN can
reach a server started with --host 0.0.0.0 (see README for setup).

If a built frontend exists at the repo-root ``dist/`` directory, it is served
directly by this backend (single-port deployment). That lets the whole app run
with just Python/uvicorn — no Node.js needed on the host — which is the
supported way to share it on the office LAN when Node can't be installed.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, SessionLocal, engine
from .routers import appeals, auth, guardrails, notifications, projects, reports, scan, uploads, users, validation_report
from .scheduler import next_scan_at, shutdown_scheduler, start_scheduler
from .seed import seed
from .services.llm import configured_tasks, using_stub_llm


def _migrate_user_columns() -> None:
    """Add AD-auth columns to the users table if they don't exist yet.

    SQLAlchemy's create_all() does not ALTER existing tables, so new columns
    on the User model must be added manually on first startup after upgrade.
    This runs on every startup but each ALTER is skipped if the column exists.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return  # table not created yet; create_all() will handle it below
    existing = {col["name"] for col in inspector.get_columns("users")}
    statements = []
    if "empno" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN empno VARCHAR")
    if "role" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'member'")
    if "email" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN email VARCHAR")
    if "password_hash" not in existing:
        statements.append("ALTER TABLE users ADD COLUMN password_hash VARCHAR")
    if statements:
        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))


@asynccontextmanager
async def lifespan(app: FastAPI):
    _migrate_user_columns()          # non-destructive schema migration
    Base.metadata.create_all(bind=engine)  # creates login_logs + any missing tables
    if settings.seed_on_startup:
        db = SessionLocal()
        try:
            seed(db)
        finally:
            db.close()
    start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(
    title="Agent 開發進度管控 Agent — 後端 API",
    version="1.0.0",
    description="Closed-loop 進度治理與紅線(Guardrails)後端,依《後端規劃書 v1.0》實作。",
    lifespan=lifespan,
)

# Private-network IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) so
# the dev server is reachable from other machines on the same office LAN.
_PRIVATE_NETWORK_ORIGIN_REGEX = (
    r"http://(localhost|127\.0\.0\.1"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r"|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?"
)

# allow_credentials=True is required for the httpOnly auth cookie to be
# included in cross-origin requests (Vite dev-server → uvicorn backend).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5180"],
    allow_origin_regex=_PRIVATE_NETWORK_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(auth.router)          # /api/auth/*  — must be first (no auth guard)
app.include_router(uploads.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(appeals.router)
app.include_router(notifications.router)
app.include_router(guardrails.router)
app.include_router(reports.router)
app.include_router(scan.router)
app.include_router(validation_report.router)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    next_scan = next_scan_at()
    return {
        "status": "ok",
        "stub_kanban": not settings.kanban_base_url,
        "stub_llm": using_stub_llm(),
        "llm_tasks": configured_tasks(),  # {"review": bool, "flowchart": bool, "appeal": bool}
        "rag_backend": settings.rag_backend,
        "scan_interval_days": settings.scan_interval_days,
        "stall_threshold_days": settings.stall_threshold_days,
        "next_scan_at": next_scan.isoformat() if next_scan else None,
    }


# Serve the built frontend (repo-root dist/) if present, so the app can run on
# a single port with only Python. Registered last so /api/*, /docs, etc. win.
# The built bundle is compiled with an empty VITE_API_BASE, so it calls the API
# with same-origin relative URLs — it works at whatever host:port serves it.
_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "dist"
if _FRONTEND_DIST.is_dir():
    _assets_dir = _FRONTEND_DIST / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    _index_html = _FRONTEND_DIST / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        # Real files (favicon, etc.) are served directly; every other path
        # falls back to index.html so client-side routing keeps working.
        candidate = (_FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_file() and _FRONTEND_DIST in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(_index_html)

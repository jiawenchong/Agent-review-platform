"""FastAPI application entry point.

Wires the six data tables, the closed-loop monitor and the guardrail layer
described in the backend planning document into a runnable service. CORS is
open to the Vite dev server so the existing React frontend can consume it,
plus any private-network origin so colleagues on the same office LAN can
reach a server started with --host 0.0.0.0 (see README for setup).
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, SessionLocal, engine
from .routers import guardrails, notifications, projects, reports, scan, uploads, users
from .scheduler import shutdown_scheduler, start_scheduler
from .seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5180"],
    allow_origin_regex=_PRIVATE_NETWORK_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(uploads.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(notifications.router)
app.include_router(guardrails.router)
app.include_router(reports.router)
app.include_router(scan.router)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {
        "status": "ok",
        "stub_kanban": not settings.kanban_base_url,
        "stub_llm": not settings.llm_endpoint,
        "rag_backend": settings.rag_backend,
        "scan_interval_days": settings.scan_interval_days,
        "stall_threshold_days": settings.stall_threshold_days,
    }

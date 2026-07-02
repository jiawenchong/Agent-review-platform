"""Authentication endpoints: login, logout, me.

Security design
  · Passwords are never logged.
  · Rate limiter: 5 failures per 15 min per IP → 429.
  · LDAP input is sanitised with a strict allowlist regex before the bind.
  · JWT is stored in an httpOnly SameSite=Lax cookie — invisible to JS.
  · AD bind failure (network / TLS) causes silent fallback to bcrypt hash;
    wrong-password AD responses cause immediate 401 (no fallback).
  · Auto-create: first successful AD login creates a User row with role=member.
"""
from __future__ import annotations

import os
import re
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import LoginLog, User
from ..services import ad_auth
from ..services.auth_service import (
    COOKIE_NAME,
    create_token,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Whoever holds this empno is auto-promoted to role="admin" on every login —
# solves the bootstrap chicken-and-egg problem (need an admin to grant admin
# rights via the 使用者管理 page, but there isn't one yet). No password lives
# here: the actual credential check is always the user's own AD login.
load_dotenv(Path(__file__).resolve().parents[2] / "credentials.env")
_BOOTSTRAP_ADMIN_EMPNO = os.getenv("BOOTSTRAP_ADMIN_EMPNO", "").strip()

# ── rate limiter (in-memory, per IP) ────────────────────────────────────────

_FAIL_WINDOW_SEC = 900   # 15 minutes
_FAIL_LIMIT = 5
_fail_log: dict[str, list[float]] = defaultdict(list)


def _rate_check(ip: str) -> None:
    now = time.monotonic()
    recent = [t for t in _fail_log[ip] if now - t < _FAIL_WINDOW_SEC]
    _fail_log[ip] = recent
    if len(recent) >= _FAIL_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"登入失敗次數過多，請 {_FAIL_WINDOW_SEC // 60} 分鐘後再試。",
        )


def _rate_fail(ip: str) -> None:
    _fail_log[ip].append(time.monotonic())


def _rate_ok(ip: str) -> None:
    _fail_log.pop(ip, None)


# ── schemas ──────────────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    empno: str
    password: str


# ── helpers ──────────────────────────────────────────────────────────────────

_EMPNO_RE = re.compile(r'^[a-zA-Z0-9_.\-]+$')


def _effective_role(user: User) -> str:
    if user.role:
        return user.role
    return "manager" if user.is_manager else "member"


# ── endpoints ────────────────────────────────────────────────────────────────


@router.post("/login")
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict:
    ip = (request.client.host if request.client else "unknown")
    _rate_check(ip)

    empno = body.empno.strip()
    if not _EMPNO_RE.match(empno):
        _rate_fail(ip)
        raise HTTPException(status_code=400, detail="員工編號格式不正確")
    if not body.password:
        raise HTTPException(status_code=400, detail="請輸入密碼")

    user: User | None = db.query(User).filter(User.empno == empno).first()
    authenticated = False

    # ── Step 1: try AD (LDAPS SIMPLE bind) ──────────────────────────────────
    if settings.ad_server and (settings.ad_upn_suffix or settings.ad_base_dn):
        try:
            ok = ad_auth.verify_ad_password(
                empno,
                body.password,
                server=settings.ad_server,
                port=settings.ad_port,
                use_ssl=settings.ad_use_ssl,
                tls_verify=settings.ad_tls_verify,
                upn_suffix=settings.ad_upn_suffix,
                base_dn=settings.ad_base_dn,
            )
            if ok:
                authenticated = True
            else:
                # AD said "invalid credentials" — definitive failure, no fallback.
                _rate_fail(ip)
                raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
        except HTTPException:
            raise
        except Exception:
            # AD unreachable → fall through to local bcrypt hash.
            pass

    # ── Step 2: fallback to bcrypt hash ──────────────────────────────────────
    if not authenticated:
        if not user or not user.password_hash:
            _rate_fail(ip)
            raise HTTPException(
                status_code=401,
                detail="帳號或密碼錯誤" if settings.ad_server else "帳號不存在或尚未設定密碼",
            )
        if not verify_password(body.password, user.password_hash):
            _rate_fail(ip)
            raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
        authenticated = True

    # ── Auto-create user on first successful AD login ────────────────────────
    is_bootstrap_admin = bool(_BOOTSTRAP_ADMIN_EMPNO) and empno == _BOOTSTRAP_ADMIN_EMPNO
    if user is None:
        user = User(
            user_id=empno,
            name=empno,
            empno=empno,
            role="admin" if is_bootstrap_admin else "member",
            is_manager=is_bootstrap_admin,
            project_ids=[],
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Backfill empno for pre-existing users that didn't have it set.
    if not user.empno:
        user.empno = empno
        db.commit()

    # Self-healing promotion: if credentials.env designates this empno as the
    # bootstrap admin but the DB row isn't admin yet (e.g. config was added
    # after the first login), promote it now. Idempotent — safe every login.
    if is_bootstrap_admin and user.role != "admin":
        user.role = "admin"
        user.is_manager = True
        db.commit()

    # ── Write login log (best-effort, never blocks login) ────────────────────
    try:
        db.add(LoginLog(
            user_id=user.user_id,
            empno=empno,
            ip=ip,
            logged_in_at=datetime.utcnow(),
        ))
        db.commit()
    except Exception:
        db.rollback()

    # ── Issue httpOnly JWT cookie ─────────────────────────────────────────────
    _rate_ok(ip)
    role = _effective_role(user)
    token = create_token(
        user_id=user.user_id,
        role=role,
        name=user.name,
        expire_hours=settings.jwt_expire_hours,
    )
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.auth_cookie_secure,
        max_age=settings.jwt_expire_hours * 3600,
        path="/",
    )
    return {
        "user_id": user.user_id,
        "name": user.name,
        "role": role,
        "empno": user.empno,
    }


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(
        key=COOKIE_NAME,
        samesite="lax",
        secure=settings.auth_cookie_secure,
        path="/",
    )
    return {"ok": True}


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)) -> dict:
    from ..services.auth_service import decode_token

    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="未登入")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token 無效或已過期，請重新登入")

    user_id = payload.get("sub")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="使用者不存在")

    return {
        "user_id": user.user_id,
        "name": user.name,
        "role": _effective_role(user),
        "empno": user.empno,
        "email": user.email,
    }


# ── AD connectivity diagnostics ─────────────────────────────────────────────
#
# Unauthenticated on purpose — you need these to work out *why* login is
# failing before you're able to log in at all. test-ad only checks reachability
# (no credentials involved); test-ad-login performs real bind attempts with the
# credentials you give it, so it shares the same rate limiter as /login.


@router.get("/test-ad")
def test_ad() -> dict:
    """Narrow down an AD connectivity problem step by step: ldap3 installed →
    settings loaded → TCP reachable → anonymous LDAP connection opens.
    Visit directly in a browser: http://<server>:8010/api/auth/test-ad
    """
    result: dict = {}

    try:
        import ldap3
        result["ldap3_installed"] = True
        result["ldap3_version"] = ldap3.__version__
    except ImportError as exc:
        result["ldap3_installed"] = False
        result["ldap3_error"] = str(exc)
        result["verdict"] = "❌ ldap3 未安裝 — pip install ldap3"
        return result

    result["ad_server"] = settings.ad_server
    result["ad_port"] = settings.ad_port
    result["ad_upn_suffix"] = settings.ad_upn_suffix
    result["ad_base_dn"] = settings.ad_base_dn
    result["ad_server_set"] = bool(settings.ad_server)

    if not settings.ad_server:
        result["verdict"] = "❌ APP_AD_SERVER 未設定（backend/credentials.env）"
        return result

    import socket
    try:
        sock = socket.create_connection((settings.ad_server, settings.ad_port), timeout=3)
        sock.close()
        result["tcp_reachable"] = True
    except Exception as exc:
        result["tcp_reachable"] = False
        result["tcp_error"] = str(exc)
        result["verdict"] = (
            f"❌ 無法連到 {settings.ad_server}:{settings.ad_port}"
            "（防火牆擋住、port 不對，或這台機器根本連不到公司內網的 AD）"
        )
        return result

    try:
        from ldap3 import NONE as LDAP_NONE
        from ldap3 import Connection, Server

        srv = Server(settings.ad_server, port=settings.ad_port, use_ssl=settings.ad_use_ssl, get_info=LDAP_NONE)
        conn = Connection(srv)
        conn.open()
        result["ldap_open"] = True
        conn.unbind()
    except Exception as exc:
        result["ldap_open"] = False
        result["ldap_open_error"] = str(exc)
        result["verdict"] = f"❌ LDAP 連線建立失敗：{exc}"
        return result

    result["verdict"] = "✅ AD 伺服器可達。若登入仍失敗，用 POST /api/auth/test-ad-login 帶帳密測試實際 bind。"
    return result


@router.post("/test-ad-login")
def test_ad_login(body: LoginRequest, request: Request) -> dict:
    """Try every plausible bind strategy with the supplied credentials and
    report the exact LDAP result for each — so a real failure (wrong UPN
    suffix, wrong port, locked account, expired password …) can be pinpointed
    instead of guessed at.
    """
    ip = (request.client.host if request.client else "unknown")
    _rate_check(ip)

    empno = body.empno.strip()
    if not _EMPNO_RE.match(empno):
        _rate_fail(ip)
        raise HTTPException(status_code=400, detail="員工編號格式不正確")
    if not body.password:
        raise HTTPException(status_code=400, detail="請輸入密碼")

    try:
        from ldap3 import NTLM, SIMPLE
        from ldap3 import NONE as LDAP_NONE
        from ldap3 import Connection, Server, Tls
    except ImportError as exc:
        raise HTTPException(status_code=500, detail=f"ldap3 未安裝：{exc}")

    if not settings.ad_server:
        raise HTTPException(status_code=400, detail="APP_AD_SERVER 未設定")

    import ssl as ssl_module

    fqdn = ad_auth.fqdn_from_base_dn(settings.ad_base_dn) if settings.ad_base_dn else ""
    user_nt = f"{settings.ad_domain}\\{empno}" if settings.ad_domain else None
    user_upn_configured = f"{empno}@{settings.ad_upn_suffix}" if settings.ad_upn_suffix else None
    user_upn_fqdn = f"{empno}@{fqdn}" if fqdn else None
    tls = Tls(validate=ssl_module.CERT_NONE)

    result: dict = {
        "server": settings.ad_server,
        "domain": settings.ad_domain,
        "upn_suffix": settings.ad_upn_suffix,
        "base_dn": settings.ad_base_dn,
        "fqdn_from_base_dn": fqdn,
        "attempts": [],
    }

    strategies: list[tuple[str, dict]] = []
    if user_upn_configured:
        strategies.append((
            "SIMPLE UPN (設定的 suffix) / LDAPS 636",
            dict(
                server=Server(settings.ad_server, port=636, use_ssl=True, tls=tls, get_info=LDAP_NONE),
                user=user_upn_configured, authentication=SIMPLE,
            ),
        ))
    if user_upn_fqdn and user_upn_fqdn != user_upn_configured:
        strategies.append((
            "SIMPLE UPN (由 base DN 推導的 FQDN) / LDAPS 636",
            dict(
                server=Server(settings.ad_server, port=636, use_ssl=True, tls=tls, get_info=LDAP_NONE),
                user=user_upn_fqdn, authentication=SIMPLE,
            ),
        ))
    if user_nt:
        strategies.append((
            "NTLM / 389（明碼，僅供診斷排除 routing 問題）",
            dict(server=Server(settings.ad_server, port=389, get_info=LDAP_NONE), user=user_nt, authentication=NTLM),
        ))
        strategies.append((
            "NTLM / LDAPS 636",
            dict(
                server=Server(settings.ad_server, port=636, use_ssl=True, tls=tls, get_info=LDAP_NONE),
                user=user_nt, authentication=NTLM,
            ),
        ))

    if not strategies:
        raise HTTPException(
            status_code=400,
            detail="沒有可測試的組合 — 至少要設定 APP_AD_UPN_SUFFIX / APP_AD_BASE_DN / APP_AD_DOMAIN 其中一個",
        )

    any_ok = False
    for label, kw in strategies:
        srv = kw.pop("server")
        bind_user = kw.pop("user")
        attempt: dict = {"strategy": label, "bind_user": bind_user}
        try:
            conn = Connection(srv, user=bind_user, password=body.password, **kw)
            ok = conn.bind()
            attempt["bind_ok"] = ok
            attempt["result"] = str(conn.result)
            if ok:
                any_ok = True
                conn.unbind()
        except Exception as exc:
            attempt["exception"] = str(exc)
        result["attempts"].append(attempt)
        if any_ok:
            break

    if any_ok:
        _rate_ok(ip)
        result["verdict"] = f"✅ 至少一種組合 bind 成功：{result['attempts'][-1]['strategy']}"
    else:
        _rate_fail(ip)
        result["verdict"] = (
            "❌ 所有組合皆失敗。看每個 attempt 的 result/exception 判斷原因"
            "（data 52e=密碼錯或帳號不存在, 775=帳號鎖定, 532=密碼過期, 533=帳號停用）。"
        )
    return result

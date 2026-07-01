"""JWT session cookie helpers and bcrypt password hashing.

JWT_SECRET is loaded from credentials.env (the same file used for ProphetAI
keys) so no secrets ever reach version control. The cookie is httpOnly,
SameSite=Lax — invisible to JS and CSRF-safe for state-changing methods.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

# Load from credentials.env next to requirements.txt (same pattern as llm.py).
load_dotenv(Path(__file__).resolve().parents[3] / "credentials.env")
_JWT_SECRET: str = os.getenv("JWT_SECRET", "")
_ALGORITHM = "HS256"

COOKIE_NAME = "govern_auth"


# ── JWT ──────────────────────────────────────────────────────────────────────


def _require_secret() -> str:
    if not _JWT_SECRET:
        raise RuntimeError(
            "JWT_SECRET is not set. Add it to backend/credentials.env:\n"
            "  JWT_SECRET=<random hex>\n"
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    return _JWT_SECRET


def create_token(user_id: str, role: str, name: str, expire_hours: int = 8) -> str:
    """Return a signed JWT containing the minimal identity claims."""
    import jwt

    secret = _require_secret()
    payload = {
        "sub": user_id,
        "role": role,
        "name": name,
        "exp": datetime.now(tz=timezone.utc) + timedelta(hours=expire_hours),
    }
    return jwt.encode(payload, secret, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT. Raises jwt.InvalidTokenError on any failure."""
    import jwt

    return jwt.decode(token, _require_secret(), algorithms=[_ALGORITHM])


# ── bcrypt ───────────────────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    """Return a bcrypt hash for the given plaintext password."""
    import bcrypt

    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches the stored bcrypt *hashed* value."""
    import bcrypt

    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

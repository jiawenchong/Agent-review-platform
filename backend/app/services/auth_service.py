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
_BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(_BACKEND_DIR / "credentials.env")


def _load_or_create_secret() -> str:
    """JWT signing secret, zero-config.

    Priority: JWT_SECRET env var (credentials.env or host) → backend/.jwt_secret
    file → auto-generate one and persist it there (gitignored). Persisting means
    sessions survive backend restarts; deleting the file just logs everyone out.
    """
    env_secret = os.getenv("JWT_SECRET", "").strip()
    if env_secret:
        return env_secret

    secret_file = _BACKEND_DIR / ".jwt_secret"
    try:
        if secret_file.exists():
            stored = secret_file.read_text(encoding="utf-8").strip()
            if stored:
                return stored
        import secrets

        generated = secrets.token_hex(32)
        secret_file.write_text(generated, encoding="utf-8")
        return generated
    except OSError:
        # Read-only filesystem etc. — fall back to an ephemeral secret
        # (sessions won't survive a restart, but login still works).
        import secrets

        return secrets.token_hex(32)


_JWT_SECRET: str = _load_or_create_secret()
_ALGORITHM = "HS256"

COOKIE_NAME = "govern_auth"


# ── JWT ──────────────────────────────────────────────────────────────────────


def _require_secret() -> str:
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

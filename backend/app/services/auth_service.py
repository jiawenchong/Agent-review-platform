"""JWT session cookie helpers and bcrypt password hashing.

JWT_SECRET is loaded from credentials.env (the same file used for ProphetAI
keys) so no secrets ever reach version control. The cookie is httpOnly,
SameSite=Lax — invisible to JS and CSRF-safe for state-changing methods.

The HS256 JWT is implemented directly on the standard library (hmac / hashlib /
base64) rather than via PyJWT. Two different PyPI packages both import as
``jwt`` (PyJWT vs. the unrelated "jwt" package), and on some locked-down hosts
the wrong one shadows the right one — ``jwt.encode`` then vanishes and every
login 500s. Owning the ~30 lines of HS256 removes that dependency-hell class of
bug entirely; HS256 is just an HMAC over two base64url segments.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
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


# ── JWT (self-contained HS256, no PyJWT dependency) ───────────────────────────


class TokenError(Exception):
    """Raised when a token is missing, malformed, tampered, or expired."""


class TokenExpired(TokenError):
    """Raised specifically when a token's exp claim is in the past."""


def _require_secret() -> str:
    return _JWT_SECRET


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def _sign(signing_input: bytes, secret: str) -> str:
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return _b64url_encode(sig)


def create_token(user_id: str, role: str, name: str, expire_hours: int = 8) -> str:
    """Return a signed HS256 JWT containing the minimal identity claims."""
    secret = _require_secret()
    header = {"alg": _ALGORITHM, "typ": "JWT"}
    exp = datetime.now(tz=timezone.utc) + timedelta(hours=expire_hours)
    payload = {
        "sub": user_id,
        "role": role,
        "name": name,
        "exp": int(exp.timestamp()),
    }
    header_seg = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_seg = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_seg}.{payload_seg}".encode("ascii")
    signature = _sign(signing_input, secret)
    return f"{header_seg}.{payload_seg}.{signature}"


def decode_token(token: str) -> dict:
    """Verify signature + expiry and return the claims.

    Raises TokenExpired if the token has expired, TokenError for any other
    failure (malformed, bad signature, missing claims).
    """
    secret = _require_secret()
    try:
        header_seg, payload_seg, signature = token.split(".")
    except (ValueError, AttributeError):
        raise TokenError("malformed token")

    signing_input = f"{header_seg}.{payload_seg}".encode("ascii")
    expected = _sign(signing_input, secret)
    # Constant-time comparison to avoid signature-timing side channels.
    if not hmac.compare_digest(expected, signature):
        raise TokenError("bad signature")

    try:
        payload = json.loads(_b64url_decode(payload_seg))
    except (ValueError, json.JSONDecodeError):
        raise TokenError("malformed payload")

    exp = payload.get("exp")
    if exp is not None:
        now = int(datetime.now(tz=timezone.utc).timestamp())
        if now >= int(exp):
            raise TokenExpired("token expired")

    return payload


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

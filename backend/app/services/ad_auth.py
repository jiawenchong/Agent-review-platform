"""LDAPS SIMPLE bind for Windows AD password verification.

Why SIMPLE bind over LDAPS instead of NTLM:
  OpenSSL 3.0 disabled MD4, on which NTLMv1 depends. SIMPLE bind over
  LDAPS (port 636) avoids this entirely: the UPN and password are sent to
  AD over TLS and AD validates them — no client-side hash required.

Returns:
  True  = AD confirmed correct credentials
  False = AD confirmed wrong password / unknown account
  Raises = AD is unreachable (caller decides whether to fallback)
"""
from __future__ import annotations

import logging
import re
import ssl

logger = logging.getLogger(__name__)

_EMPNO_RE = re.compile(r'^[a-zA-Z0-9_.\-]+$')


def verify_ad_password(
    empno: str,
    password: str,
    *,
    server: str,
    port: int,
    use_ssl: bool,
    tls_verify: bool,
    upn_suffix: str,
) -> bool:
    """Attempt LDAPS SIMPLE bind.

    Raises RuntimeError if ldap3 is not installed.
    Raises Exception (e.g. LDAPSocketOpenError) if the AD host is unreachable
    so the caller can decide whether to fall back to a local hash.
    """
    if not _EMPNO_RE.match(empno):
        # Reject anything that looks like an LDAP injection attempt silently.
        return False

    try:
        from ldap3 import SIMPLE, Connection, Server, Tls
    except ImportError as exc:
        raise RuntimeError("ldap3 is not installed; run: pip install ldap3") from exc

    tls = Tls(validate=ssl.CERT_REQUIRED if tls_verify else ssl.CERT_NONE)
    ldap_server = Server(server, port=port, use_ssl=use_ssl, tls=tls)
    upn = f"{empno}@{upn_suffix}"

    try:
        conn = Connection(
            ldap_server,
            user=upn,
            password=password,
            authentication=SIMPLE,
            auto_bind=True,
        )
        conn.unbind()
        return True
    except Exception as exc:
        msg = str(exc).lower()
        # AD returns 52e / "invalidCredentials" for wrong password.
        # Any other error code means AD is reachable but something else is wrong;
        # treat as wrong credentials for safety.
        if (
            "invalidcredentials" in msg
            or "52e" in msg
            or "invalid credentials" in msg
            or "data 52e" in msg
            or "data 530" in msg   # account disabled
            or "data 533" in msg   # account expired
            or "data 701" in msg   # password expired
        ):
            return False
        # AD unreachable / TLS error / network timeout → re-raise so caller
        # can decide whether to fall back to the local bcrypt hash.
        logger.warning("AD bind failed (unreachable?): %s", exc)
        raise

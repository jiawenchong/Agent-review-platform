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

_WRONG_CREDENTIAL_MARKERS = (
    "invalidcredentials",
    "52e",
    "invalid credentials",
    "data 52e",
    "data 530",   # account disabled
    "data 533",   # account expired
    "data 701",   # password expired
)


def fqdn_from_base_dn(base_dn: str) -> str:
    """Derive a dotted FQDN from an LDAP base DN, e.g. 'DC=ase,DC=com,DC=tw' -> 'ase.com.tw'."""
    parts = [p.split("=", 1)[1] for p in base_dn.split(",") if p.strip().upper().startswith("DC=")]
    return ".".join(parts)


def _upn_suffix_candidates(upn_suffix: str, base_dn: str) -> list[str]:
    """The configured UPN suffix doesn't always match the domain's base DN
    (e.g. base DN 'DC=ase,DC=com,DC=tw' but real UPN suffix 'kh.asegroup.com').
    Try the configured suffix first, then the base-DN-derived one as a fallback,
    instead of assuming a single guess is always right.
    """
    candidates = [upn_suffix]
    if base_dn:
        derived = fqdn_from_base_dn(base_dn)
        if derived:
            candidates.append(derived)
    seen: set[str] = set()
    out = []
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def verify_ad_password(
    empno: str,
    password: str,
    *,
    server: str,
    port: int,
    use_ssl: bool,
    tls_verify: bool,
    upn_suffix: str,
    base_dn: str = "",
) -> bool:
    """Attempt LDAPS SIMPLE bind, trying each candidate UPN suffix in turn.

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

    candidates = _upn_suffix_candidates(upn_suffix, base_dn)
    if not candidates:
        raise RuntimeError("No AD UPN suffix configured (set APP_AD_UPN_SUFFIX or APP_AD_BASE_DN)")

    tls = Tls(validate=ssl.CERT_REQUIRED if tls_verify else ssl.CERT_NONE)
    ldap_server = Server(server, port=port, use_ssl=use_ssl, tls=tls)

    saw_unreachable = False
    last_unreachable_exc: Exception | None = None

    for suffix in candidates:
        upn = f"{empno}@{suffix}"
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
            if any(marker in msg for marker in _WRONG_CREDENTIAL_MARKERS):
                # This suffix didn't resolve to a valid+correct login; try the
                # next candidate before giving up (a wrong suffix looks
                # identical to a wrong password from AD's point of view).
                continue
            # Anything else (socket error, TLS failure, timeout) means AD
            # itself is unreachable for this attempt.
            saw_unreachable = True
            last_unreachable_exc = exc
            logger.warning("AD bind failed for upn=%s (unreachable?): %s", upn, exc)

    if saw_unreachable and last_unreachable_exc is not None:
        # None of the candidates even got a definitive answer from AD —
        # treat as AD-unreachable so the caller can fall back to bcrypt.
        raise last_unreachable_exc

    # AD was reachable and gave a definitive "wrong credentials" for every
    # candidate suffix — the password (or account) really is wrong.
    return False

"""Application settings.

Several values here correspond to the "待確認事項" listed in the backend
planning document (§九 / §十一): the KANBAN endpoint, the LLM server, the
vector-DB backend and the notification channel. They are surfaced as
settings so they can be pointed at real infrastructure later without
touching application code.
"""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# pydantic-settings only auto-loads a literal `.env` file (see env_file below);
# it has no idea backend/credentials.env exists. Without this line, every
# APP_AD_SERVER / APP_AD_UPN_SUFFIX / etc. put in credentials.env is silently
# ignored — ad_server stays "" and login always falls through to the (unused)
# local-password path. override=False so a real host env var still wins.
load_dotenv(Path(__file__).resolve().parent.parent / "credentials.env", override=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_", env_file=".env", extra="ignore")

    # --- core ---
    database_url: str = "sqlite:///./governance.db"
    # Demo-only fixture data (see app/seed.py) — 6 sample Agent projects, so
    # the dashboard isn't empty on a fresh clone. OFF by default for real
    # deployments; flip to true locally if you want the demo dataset back.
    seed_on_startup: bool = False

    # --- closed-loop monitor (§三, §九) ---
    scan_interval_days: int = 7          # Cron 每 7 天觸發
    stall_threshold_days: int = 14       # 14 天無變化視為停滯
    escalation_rounds: int = 2           # 連續 ≥2 輪未解除 → 強制升級
    enable_scheduler: bool = True

    # --- external connectors (待確認 — stubbed by default) ---
    kanban_base_url: str = ""            # 空字串 → 使用內建 stub
    # ProphetAI 線上審核 API(見 .claude/skills/prophetai-api)。OpenAI 相容端點。
    # 金鑰 / agent id 不放這裡,改由 host 本機環境變數帶入(勿 commit):
    #   COMPANY_LLM_API_KEY = ask_xxxx     COMPANY_LLM_AGENT = <agent id>
    # 兩者都有值 → 啟用真實審核;否則退回 StubLLM(規則判讀,免 GPU)。
    llm_endpoint: str = "https://10.10.23.120:4231/public/kits/openai/v1/chat/completions"
    llm_timeout_seconds: float = 180.0   # API 逾時(秒)→ 視為失效 → 無法審核
    rag_backend: str = "memory"          # memory | pgvector | faiss
    notification_channel: str = "inapp"  # inapp | email | teams

    # --- Active Directory (LDAPS SIMPLE bind) ---
    # Leave ad_server empty to skip LDAP and fall back to local bcrypt hash only.
    ad_server: str = ""           # AD host IP / FQDN, e.g. "10.10.10.2"
    ad_port: int = 636            # 636 = LDAPS; 389 = plain LDAP (not recommended)
    ad_use_ssl: bool = True
    ad_tls_verify: bool = False   # False = accept self-signed internal CA (common on-prem)
    ad_upn_suffix: str = ""       # UPN suffix, e.g. "kh.asegroup.com" → empno@kh.asegroup.com
    # Optional: the real UPN suffix doesn't always match the domain's base DN
    # (e.g. base DN "DC=ase,DC=com,DC=tw" but UPN suffix "kh.asegroup.com").
    # If set, login also tries "empno@<FQDN derived from ad_base_dn>" as a
    # second UPN candidate when ad_upn_suffix fails, instead of guessing.
    ad_base_dn: str = ""          # e.g. "DC=ase,DC=com,DC=tw"
    ad_domain: str = ""           # NetBIOS domain, e.g. "KH" — only used by /test-ad-login's NTLM probes

    # --- JWT session cookie ---
    jwt_expire_hours: int = 8     # Token lifetime; 8 h = one work day
    auth_cookie_secure: bool = False  # Set True when serving over HTTPS in production


settings = Settings()

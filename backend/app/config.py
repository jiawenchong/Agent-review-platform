"""Application settings.

Several values here correspond to the "待確認事項" listed in the backend
planning document (§九 / §十一): the KANBAN endpoint, the LLM server, the
vector-DB backend and the notification channel. They are surfaced as
settings so they can be pointed at real infrastructure later without
touching application code.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


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


settings = Settings()

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
    seed_on_startup: bool = True

    # --- closed-loop monitor (§三, §九) ---
    scan_interval_days: int = 7          # Cron 每 7 天觸發
    stall_threshold_days: int = 14       # 14 天無變化視為停滯
    escalation_rounds: int = 2           # 連續 ≥2 輪未解除 → 強制升級
    enable_scheduler: bool = True

    # --- external connectors (待確認 — stubbed by default) ---
    kanban_base_url: str = ""            # 空字串 → 使用內建 stub
    # ProfetAI LLM 審核 API。llm_endpoint 為空 → 退回 StubLLM(規則判讀,免 GPU)。
    # 內網免驗證,llm_api_key 留空即可;之後若 API 需要金鑰再填(會帶 Bearer header)。
    llm_endpoint: str = ""               # 例:http://<intranet-host>/profetai-api
    llm_model: str = ""                  # 選填:要呼叫的模型名稱(OpenAI 相容 payload 用)
    llm_api_key: str = ""                # 選填:有值才帶 Authorization: Bearer
    llm_timeout_seconds: float = 30.0    # API 逾時(秒)→ 視為失效 → 無法審核
    rag_backend: str = "memory"          # memory | pgvector | faiss
    notification_channel: str = "inapp"  # inapp | email | teams


settings = Settings()

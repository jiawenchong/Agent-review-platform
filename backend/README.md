# 後端 — Agent 開發進度管控 Agent

依《後端規劃書 v1.0》實作的 closed-loop 進度治理與紅線(Guardrails)後端。
技術棧:**FastAPI + SQLAlchemy + SQLite**(開發用),APScheduler 負責每 7 天的 Cron 巡查。

## 啟動

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

啟動後造訪 `http://localhost:8010/docs` 查看互動式 API 文件。首次啟動會自動建表並載入與前端一致的 seed 資料。

## 測試

```bash
cd backend
pytest -q
```

## 架構對應(規劃書章節)

| 規劃書 | 實作位置 |
| --- | --- |
| Word 解析模組 + AI 評審中心(上傳判讀) | `services/extraction.py` + `services/ingestion.py` + `services/llm.py::review_document` |
| §三 Closed Loop 四階段 | `services/decision.py` `weekly_scan()` |
| §五 資料模型(6 表 + users) | `models.py` |
| §六 Decision Flow / pseudocode | `services/decision.py` |
| §七 LLM vs Rule 分工 | 規則散落於 `decision.py`;LLM 僅 `services/llm.py` |
| §八 六條 Guardrails | `services/guardrails.py` + `deps.py`(ACL) |
| §九 Cron / KANBAN / LLM / RAG | `scheduler.py`、`services/connectors.py`、`services/llm.py` |

## 待確認事項對應(規劃書 §十一)

規劃書列為「待確認」的外部系統,目前以可運作的 stub 實作,透過 `app/config.py`
設定切換為真實連接器:

- **KANBAN API** — `services/connectors.py::StubKanban`(設 `APP_KANBAN_BASE_URL`)
- **Local GPU LLM(Llama3 / GPT4o)** — `services/llm.py::StubLLM`(設 `APP_LLM_ENDPOINT`)
- **RAG 向量庫(pgvector / FAISS)** — `services/connectors.py::StubRag`(設 `APP_RAG_BACKEND`)
- **通知管道(站內/Email/Teams)** — `services/notifications.py`(設 `APP_NOTIFICATION_CHANNEL`)

換成真實系統時,只需實作相同介面並在設定中指定,呼叫端無須改動。

## 主要 API

所有 API 需帶 `X-User-Id` 標頭(模擬登入主體,供 Information Isolation ACL 判斷)。

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/health` | 健康檢查 + stub 狀態 |
| GET | `/api/uploads/supported` | 支援的檔案副檔名 |
| POST | `/api/uploads` | 上傳多個檔案(PDF/PPTX/DOCX/TXT),抽取全文並交 LLM 判讀 |
| GET | `/api/uploads` `/{id}` | 已上傳文件列表 / 單一文件(含擷取全文) |
| GET/POST | `/api/projects` | 專案列表 / 建立(依 ACL 過濾) |
| GET | `/api/projects/{id}` | 專案詳情 |
| GET | `/api/projects/{id}/snapshots` | 進度快照歷史 |
| GET/POST | `/api/projects/{id}/appeals` | Q&A 申訴查詢 / 提交 |
| POST | `/api/projects/{id}/scan` | 單一專案跑一輪 closed loop |
| POST | `/api/scan` | 全量掃描(僅主管) |
| GET/POST | `/api/notifications` `/{id}/read` | 通知中心 / 標記已讀 |
| GET | `/api/guardrail-events` | 紅線稽核紀錄(可依 type 篩選) |
| GET/POST | `/api/reports` | 月報列表 / 手動產生 |

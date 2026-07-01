# Agent 開發進度管控平台 — CLAUDE.md

開發者上下文文件。記錄架構決策、環境設定、以及 Claude Code 開發時需要知道的事。

## 快速啟動

```bash
# 前端開發（熱更新）
npm install && npm run dev          # http://localhost:5173

# 後端
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010

# 單埠生產環境（只要 Python）
npm run build                       # 產生 dist/，後端直接提供
cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8010
```

## 架構總覽

```
React/Vite 前端  ←→  FastAPI 後端  ←→  SQLite (governance.db)
                              ↕
                       ProphetAI LLM (公司內網)
                       APScheduler (Closed-Loop 週期巡查)
```

### 單埠部署原則

`dist/` 已 commit 進 repo（見 `.gitignore` 說明）。後端啟動時透過 `StaticFiles` + SPA catch-all 把整個前端一起供出，不需要 Node.js。改動前端原始碼後須 `npm run build` 才會反映。

## 關鍵目錄

```
src/                    React 前端
  pages/Upload.tsx      規劃書評估頁（上傳 → 評審 → 下載範本）
  pages/Dashboard.tsx   專案儀表板
  api/client.ts         所有後端呼叫集中在此
  styles/global.css     CSS 自訂屬性（燈號顏色、排版變數）

backend/app/
  main.py               FastAPI 入口、CORS、SPA serving
  config.py             Settings（pydantic-settings，APP_ 前綴）
  models.py             SQLAlchemy ORM 模型
  schemas.py            Pydantic v2 request/response schema
  routers/              一個 router 對應一個資源
  services/
    extraction.py       文件解析 → Markdown（DOCX/PPTX/TXT/MD）
    ingestion.py        上傳 pipeline：解析→LLM審核→流程圖→欄位抽取→建立專案
    llm.py              ProphetAILLM / StubLLM，LLMUnavailable 例外
    prompts.py          讀取 prompts/ 目錄，lru_cache
    flowchart.py        Mermaid 流程圖生成（結構化 / 章節推斷）
    blueprint.py        結構化欄位抽取（Agent名稱/提案人/部門等）
    scan.py             Closed-Loop 週期巡查邏輯
    guardrails.py       紅線事件記錄
  prompts/
    document_review.md  AI 評審中心 prompt（=== SYSTEM === / === USER ===）
    appeal_reasonableness.md  申訴合理性 prompt

public/
  agent-blueprint-template.pptx   規劃書 PPT 範本（由 scripts/gen_blueprint_pptx.py 產生）

scripts/
  gen_blueprint_pptx.py    重新產生 PPT 範本用

.claude/skills/prophetai-api/SKILL.md   ProphetAI API 呼叫規範（5 條必要規則）
```

## ProphetAI LLM 設定

三個任務（審核 / 流程圖生成 / 申訴合理性）各自是獨立的 ProphetAI Agent，**各自有自己的金鑰與 agent id，不共用**。

**金鑰絕對不能 commit**。複製 `backend/credentials.env.example` → `backend/credentials.env`（已 gitignore），
填入後存檔即可 — **只需填一次**，之後每次啟動後端（`uvicorn` / `start-lan.bat`）都會自動讀取這個檔案
（`llm.py` 頂部 `load_dotenv()`），不用再手動 `set` 或每次啟動前執行腳本：

```bash
cd backend && copy credentials.env.example credentials.env   # 之後直接編輯 credentials.env
```

六個變數：

| 任務 | API Key | Agent ID |
| --- | --- | --- |
| 文件審核 | `COMPANY_REVIEW_KEY` | `COMPANY_REVIEW_AGENT` |
| 流程圖生成 | `COMPANY_FLOWCHART_KEY` | `COMPANY_FLOWCHART_AGENT` |
| 申訴合理性 | `COMPANY_APPEAL_KEY` | `COMPANY_APPEAL_AGENT` |

（舊版單一 `COMPANY_LLM_API_KEY` / `COMPANY_LLM_AGENT` 仍相容，任務沒填六個新變數時會退回用它）

- 某任務金鑰/agent id 缺 → 該任務退回 `StubLLM`（規則判讀，可離線 demo）
- API 連不上 / 逾時 → `LLMUnavailable` 例外 → 文件標「**無法審核**」+ Capability 紅線記錄
- `/api/health` 的 `llm_tasks` 欄位可查每個任務是否已設定憑證
- 若 host 本機已用環境變數（`set` / `export`）設定同名變數，那組優先，`credentials.env` 內容會被忽略（不衝突）
- 也保留 `credentials.bat.example` / `credentials.sh.example`，給偏好用 host 環境變數而非檔案的部署流程用

ProphetAI 端點預設：`https://10.10.23.120:4231/public/kits/openai/v1/chat/completions`（可用 `APP_LLM_ENDPOINT` 覆寫）。

5 條必要規則（來自 SKILL.md）：
1. 端點用 `/public/kits/openai/v1/chat/completions`
2. `model` 欄位放 agent id
3. `content` 用 block 陣列 `[{"type":"text","text":"..."}]`
4. Authorization: `Bearer {api_key}`
5. SSL 驗證關閉 + 不走對外 proxy

## 「規劃書評估」上傳流程

```
上傳文件 (DOCX/PPTX/TXT/MD)
    ↓
extraction.py → Markdown
    · DOCX: 標題→#, 表格→GFM, 段落依序
    · PPTX: 每頁→## Slide N + 子彈
    ↓
llm.py → AI 評審中心判讀
    · 綠燈  — 涵蓋 ≥4 個必要章節，內容具體可行 → 自動建立專案
    · 紅燈  — 缺章節或計畫不可行
    · 待補件 — 內容過少
    · 無法審核 — LLM API 失效（不捏造結論）
    ↓
flowchart.py → Mermaid 流程圖（前端可展開查看）
    ↓
blueprint.py → 欄位抽取（Agent名稱/提案人/部門/目標等）
    ↓
[僅綠燈 + 有 Agent 名稱] → 建立 Project → 進入 Closed-Loop 監控
```

## 專案儀表板的統計方塊

`Dashboard.tsx` 除了專案列表,還有六個彙總卡片,資料都來自真實 API(不是假資料):

| 卡片 | 資料來源 | 內容 |
| --- | --- | --- |
| 規劃書評估總覽 | `GET /api/uploads`(`listDocuments`) | 已評估總數、綠/紅/待補件/無法審核分佈、已自動建立專案數 |
| 紅線稽核摘要 | `GET /api/guardrail-events`(`listGuardrailEvents`) | 總觸發次數、未解決數、Top 3 紅線類型 |
| 平均治理分數 | `GET /api/projects`(既有欄位 `score`) | 所有專案平均分數、依 ≥80/55–79/<55 分佈 |
| 待處理申訴 | `GET /api/appeals`(`listAllAppeals`,新增) | 尚無 `llm_verdict` 的申訴數、總申訴數、待處理清單 |
| Closed-Loop 巡查狀態 | `GET /api/health`(`getHealth`,新增 `next_scan_at`) | 下次自動巡查時間、巡查頻率、停滯門檻、已強制升級(`ai_auto_approval=false`)專案數 |
| 近期活動時間軸 | 前三者資料在前端合併排序 | 新建立專案 + 規劃書評估 + 紅線事件,取最近 8 筆 |

`GET /api/appeals` 是新的跨專案彙總端點(`backend/app/routers/appeals.py`),沿用跟 `/api/projects/{id}/appeals`
相同的 Information Isolation ACL(主管看全部,一般使用者只看自己專案的申訴)。

`next_scan_at` 來自 `scheduler.py` 新增的 `next_scan_at()`,讀 APScheduler job 的 `next_run_time`;
排程沒啟動(`APP_ENABLE_SCHEDULER=false`)時回傳 `null`,前端顯示「排程未啟動」。

「平均治理分數」目前只顯示當前平均值,不是歷史趨勢線 — 真正的分數走勢需要另外儲存每輪 scan 的分數快照
(現有 `ProgressSnapshot` 只存 `progress_value`,不存 `score`),之後如果要做趨勢圖可以再擴充。

## Closed-Loop 進度監控

APScheduler 每 7 天（`APP_SCAN_INTERVAL_DAYS`）自動巡查所有 NORMAL 專案：

1. 14 天無進度 → 標 STALLED，送通知要求負責人說明
2. 負責人提交申訴 → `llm.py evaluate_appeal()` 判斷合理性
   - LLM 失效時退回 StubLLM（巡查不能因 LLM 掛掉而中斷）
3. 連續 ≥2 輪未解除停滯 → ESCALATED（強制升級）

## Prompt 單一來源慣例

`backend/app/prompts/` 裡的 `.md` 檔同時作為：
1. 後端 `prompts.py` 讀取的程式碼資料
2. 可直接貼進 ProphetAI 後台 agent 設定的文件

格式：
```
=== SYSTEM ===
（system prompt 內容）

=== USER ===
（user prompt 模板，{變數} 由程式 .format() 填入）
```

改 prompt 只需改 `.md` 檔，`lru_cache` 會在下次重啟後刷新。

## 燈號顏色（CSS 變數）

| 燈號 | 文字 | 背景 |
|------|------|------|
| 綠燈 | `--green-text` | `--green-bg` |
| 紅燈 | `--red-text` | `--red-bg` |
| 待補件 | `--amber-text` | `--amber-bg` |
| 無法審核 | `--gray-text` | `--gray-bg` |

定義在 `src/styles/global.css`。

## 環境變數總表

| 變數 | 預設 | 說明 |
|------|------|------|
| `COMPANY_LLM_API_KEY` | （必須在 host 設定） | ProphetAI 金鑰 |
| `COMPANY_LLM_AGENT` | （必須在 host 設定） | ProphetAI agent UUID |
| `APP_LLM_ENDPOINT` | 公司內網 URL | 可覆寫 API 端點 |
| `APP_LLM_TIMEOUT_SECONDS` | 180 | API 逾時（秒） |
| `APP_DATABASE_URL` | sqlite:///./governance.db | 資料庫 |
| `APP_SCAN_INTERVAL_DAYS` | 7 | Closed-Loop 巡查頻率 |
| `APP_STALL_THRESHOLD_DAYS` | 14 | 停滯判定天數 |
| `APP_SEED_ON_STARTUP` | **false** | 啟動時填入 6 個示範 Agent 專案（demo 用，真實部署預設關閉） |
| `VITE_API_BASE` | （空，走同源） | 前端 API base URL（開發時用） |

如果現有 `governance.db` 是舊版（`APP_SEED_ON_STARTUP` 預設還是 true 時）建立的，裡面會有 6 個
示範專案（信用風險評估 Agent 等）。清除方式：

```bash
cd backend && python scripts/remove_demo_seed.py
```

只會刪除 `app/seed.py` 裡定義的示範資料（比對 id + 內容才刪，不會動到你自己建立的真實專案），
保留 `U-mgr` 主管身分供畫面切換使用。清完後不用再手動關閉 `APP_SEED_ON_STARTUP`——這個版本起
預設已經是 `false`。

## 開發注意事項

- `dist/` 已 commit，不在 `.gitignore` — 部署靠它，別意外刪除
- 改前端後必須 `npm run build` 才反映到後端 serving
- 沒有真正的登入系統，側邊欄「目前身分」是暫代切換器
- 不要在任何 commit 的檔案裡寫入 API 金鑰或 agent UUID
- `using_stub_llm()` 回傳 True 時，`/api/health` 的 `stub_llm` 也會是 true — 可用來確認設定是否生效

## 未完成項目（ROADMAP）

- **B8** KANBAN 連接器（`APP_KANBAN_BASE_URL` 空字串 → 用 stub）
- **H2** 真正的登入驗證（目前任何人都能切換身分）
- **E3/E4** 月報 PDF 匯出
- **RAG** 知識庫（目前 `rag_backend=memory`，只有 in-memory stub）

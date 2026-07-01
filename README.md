# Agent 開發進度管控 Agent

內部治理儀表板，用於追蹤 AI Agent 專案的開發進度、Q&A 歷程與紅線（Guardrail）稽核紀錄。

## 功能頁面

- **上傳資料** — 上傳 `.docx` 進度報告，系統自動解析並匯入專案資料
- **專案儀表板** — 所有專案的總覽、狀態篩選與搜尋
- **專案詳情** — Closed Loop（Perception → Reasoning → Action → Feedback）進度時間軸與 Q&A 歷程
- **通知中心** — 紅線觸發、停滯預警與一般提醒通知
- **治理月報** — 月度 KPI 總覽與歷史報告清單
- **紅線稽核紀錄** — Guardrail 觸發事件，依類型篩選並標示嚴重程度

## 開發

前端:

```bash
npm install
npm run dev
```

所有頁面都會呼叫後端 API(預設 `http://localhost:8010`,可用 `VITE_API_BASE` 覆寫)。
要完整使用本系統,請一併啟動後端:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

## 開放給公司內網同事使用(只需要 Python,不需要 Node.js)

repo 內已附上**預先編譯好的前端**(`dist/`),後端啟動時會直接把這份網頁一起送出去,
所以**整個系統用一個 Python 服務、一個埠口(8010)就跑得起來**,主機端不需要安裝 Node.js。

**Windows 一鍵啟動**:在 repo 根目錄雙擊 `start-lan.bat`。它會:

1. 自動偵測你的內網 IP
2. 啟動後端服務(`uvicorn`,綁定 `0.0.0.0:8010`)
3. 印出同事要打開的網址(例如 `http://10.10.51.118:8010`)

視窗會一直開著跑服務,關掉視窗就停止。第一次跑前請先確定後端套件已安裝:
`pip install -r backend\requirements.txt`。

**手動啟動**(等同 bat 做的事):

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010
```

同事直接用瀏覽器打開 `http://<你的內網IP>:8010` 即可,網頁和 API 都從這一個位址出去
(前端打包時用空的 `VITE_API_BASE`,所以一律走同源相對路徑,不管用哪個 IP 都對得上)。

後端的 CORS 設定已允許所有私有網段(`10.x` / `172.16-31.x` / `192.168.x`)的來源連線。

> **開發者注意**:`dist/` 是 `npm run build` 的產物,已 commit 進 repo 方便無 Node 環境部署。
> 改動前端原始碼後要重新 `npm run build` 才會反映到這個單一服務;開發時仍可照常用
> `npm run dev`(見下方技術棧)享有熱更新。

⚠️ 目前沒有真正的登入驗證,只靠前端「目前身分(暫代登入)」切換器模擬身分(見下節)。開放給其他人連線前請注意:任何能連到這個網址的人都能任意切換身分、看到他人專案資料,僅適合可信的內網環境,不要開放到公開網際網路。

## AI 審核(AI 評審中心)— 接公司 ProphetAI API

上傳文件的紅綠燈審核可以由**真實 LLM**(公司線上 ProphetAI,OpenAI 相容)判讀。流程:

1. 上傳檔(DOCX/PPTX/TXT/MD)→ 後端先把內容**轉成乾淨的 Markdown**(保留標題、表格、投影片結構),
   讓 LLM 看到結構良好的文件而不是一坨純文字。
2. 把這份 Markdown 連同審核 prompt 送到 ProphetAI API,模型回傳 `verdict`(綠燈/紅燈/待補件)、
   `summary`、`key_points`、`reasons`。

呼叫法完全照 [`​.claude/skills/prophetai-api`](./.claude/skills/prophetai-api/SKILL.md) 的已驗證範本:
OpenAI 相容端點、`model` 欄位放 **agent id**、`content` 用 **block 陣列**、**Bearer 驗證**、
**關 SSL 驗證**(內網自簽憑證)、**不走對外 proxy**。實作在 `backend/app/services/llm.py` 的 `ProphetAILLM`。

**啟用方式**:三個任務 = 三個獨立的 ProphetAI Agent,各自有自己的金鑰與 agent id(不共用)。
金鑰與 agent id **只在 host 本機**用環境變數帶入(**勿 commit**,填了等於把祕密推上 GitHub):

```bash
# Windows:複製 backend/credentials.bat.example → backend/credentials.bat,
# 填好三組憑證後,啟動後端前先執行它:
cd backend
credentials.bat
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010
```

```bash
# Mac/Linux:複製 backend/credentials.sh.example → backend/credentials.sh
cd backend
source credentials.sh
uvicorn app.main:app --host 0.0.0.0 --port 8010
```

`credentials.bat` / `credentials.sh` 本身已被 `.gitignore` 排除,只有內容留空的 `.example` 範本會進版控。
六個環境變數(可只填其中幾組,其餘任務會退回 `StubLLM`):

| 任務 | API Key 變數 | Agent ID 變數 |
| --- | --- | --- |
| 文件審核(AI 評審中心) | `COMPANY_REVIEW_KEY` | `COMPANY_REVIEW_AGENT` |
| 流程圖生成(AS IS / TO BE) | `COMPANY_FLOWCHART_KEY` | `COMPANY_FLOWCHART_AGENT` |
| 申訴合理性(closed-loop) | `COMPANY_APPEAL_KEY` | `COMPANY_APPEAL_AGENT` |

> 舊版單一 Agent 設定(`COMPANY_LLM_API_KEY` / `COMPANY_LLM_AGENT`)仍相容 — 沒填上面六個變數時,三個任務都會退回用這組舊變數。

- 某任務的金鑰/agent id **沒設** → 該任務自動退回 `StubLLM`(規則判讀,免 GPU,可離線 demo)。
- API **連不上 / 403 / 回傳格式不符** → 文件標示為「**無法審核**」並記一筆 Capability 紅線,
  **不會捏造**綠燈/紅燈結論,也不會自動建立專案(可稍後重試;常見錯誤排查見 skill)。
- 端點預設為 `https://10.10.23.120:4231/...`(可用 `APP_LLM_ENDPOINT` 覆寫);逾時預設 180 秒(`APP_LLM_TIMEOUT_SECONDS`)。
- `/api/health` 的 `llm_tasks` 欄位會顯示三個任務各自是否已設定憑證,方便確認填對了沒有。

**三個 LLM 判讀步驟、三份 prompt**(都在 [`backend/app/prompts/`](./backend/app/prompts/),單一來源:connector 載入切 system/user 後**內嵌**送出,也可直接貼進 ProphetAI 後台對應 agent):

| 用途 | prompt 檔 | 結論 | 時機 |
| --- | --- | --- | --- |
| 文件審核(AI 評審中心) | [`document_review.md`](./backend/app/prompts/document_review.md) | 綠燈 / 紅燈 / 待補件 | 上傳規劃書時 |
| 流程圖生成 | [`flowchart_generation.md`](./backend/app/prompts/flowchart_generation.md) | AS IS + TO BE 兩張 Mermaid 流程圖 | 上傳規劃書時 |
| 申訴合理性(closed-loop) | [`appeal_reasonableness.md`](./backend/app/prompts/appeal_reasonableness.md) | 合理 / 不合理 | 專案停滯、負責人申訴後 |

三者失效行為不同:文件審核失效 → 標「無法審核」;流程圖生成失效 → 退回依章節推斷的簡易流程圖;
申訴判讀失效 → **退回規則 stub**(每週巡查是背景自動流程,不能因 LLM 掛掉而中斷)。

## 技術棧

- 前端:React + TypeScript + Vite + react-router-dom
- 後端:FastAPI + SQLAlchemy(見 [`backend/`](./backend/))— closed-loop 進度治理、紅線稽核、文件上傳解析與 LLM 判讀

## 目前串接狀態

前後端已全面串接(G1–G7):上傳、儀表板、專案詳情(含申訴提交)、通知中心、治理月報、紅線稽核紀錄皆呼叫真實後端 API,不再使用前端內建的 seed 假資料。

真正的登入系統尚未實作(見 `docs/ROADMAP.md` H2)。所有 API 都需要 `X-User-Id` 標頭做 Information Isolation 判斷;在登入功能完成前,前端側邊欄提供一個「目前身分(暫代登入)」切換器,讓你選擇以哪個使用者身分操作,藉此也能實際體驗 ACL 紅線(非主管使用者只能看到自己負責的專案)。

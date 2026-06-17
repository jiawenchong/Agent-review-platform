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

## 技術棧

- 前端:React + TypeScript + Vite + react-router-dom
- 後端:FastAPI + SQLAlchemy(見 [`backend/`](./backend/))— closed-loop 進度治理、紅線稽核、文件上傳解析與 LLM 判讀

## 目前串接狀態

前後端已全面串接(G1–G7):上傳、儀表板、專案詳情(含申訴提交)、通知中心、治理月報、紅線稽核紀錄皆呼叫真實後端 API,不再使用前端內建的 seed 假資料。

真正的登入系統尚未實作(見 `docs/ROADMAP.md` H2)。所有 API 都需要 `X-User-Id` 標頭做 Information Isolation 判斷;在登入功能完成前,前端側邊欄提供一個「目前身分(暫代登入)」切換器,讓你選擇以哪個使用者身分操作,藉此也能實際體驗 ACL 紅線(非主管使用者只能看到自己負責的專案)。

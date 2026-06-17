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

「上傳資料」頁會把檔案送到後端 API(預設 `http://localhost:8010`,可用 `VITE_API_BASE` 覆寫)。
要使用上傳功能,請一併啟動後端:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

## 技術棧

- 前端:React + TypeScript + Vite + react-router-dom
- 後端:FastAPI + SQLAlchemy(見 [`backend/`](./backend/))— closed-loop 進度治理、紅線稽核、文件上傳解析與 LLM 判讀

## 目前串接狀態

「上傳資料」頁已串接後端(上傳 → 後端抽取全文 → LLM 判讀);其餘頁面仍使用前端內建的 seed 假資料,將於後續整批串接。

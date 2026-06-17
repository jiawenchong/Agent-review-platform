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

```bash
npm install
npm run dev
```

## 技術棧

React + TypeScript + Vite + react-router-dom

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

## 開放給公司內網同事使用

預設只在本機(`localhost`)可連線。要讓同辦公室、同網段的同事連進來:

```bash
# 後端:綁定到所有網卡(0.0.0.0),而不只是 localhost
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8010

# 前端:vite.config.ts 已設定 server.host = true,npm run dev 會自動
# 印出可供同網段使用的「Network」網址(例如 http://192.168.1.23:5173)
npm run dev
```

同事連到前端網址後,前端預設仍會打 `http://localhost:8010`(也就是同事自己機器的 8010,不是你的)。要讓他們連到你開的後端,啟動前端時指定:

```bash
VITE_API_BASE=http://<你的內網IP>:8010 npm run dev
```

後端的 CORS 設定已允許所有私有網段(`10.x` / `172.16-31.x` / `192.168.x`)的來源連線,不需要額外調整。

⚠️ 目前沒有真正的登入驗證,只靠前端「目前身分(暫代登入)」切換器模擬身分(見下節)。開放給其他人連線前請注意:任何能連到這個網址的人都能任意切換身分、看到他人專案資料,僅適合可信的內網環境,不要開放到公開網際網路。

## 技術棧

- 前端:React + TypeScript + Vite + react-router-dom
- 後端:FastAPI + SQLAlchemy(見 [`backend/`](./backend/))— closed-loop 進度治理、紅線稽核、文件上傳解析與 LLM 判讀

## 目前串接狀態

前後端已全面串接(G1–G7):上傳、儀表板、專案詳情(含申訴提交)、通知中心、治理月報、紅線稽核紀錄皆呼叫真實後端 API,不再使用前端內建的 seed 假資料。

真正的登入系統尚未實作(見 `docs/ROADMAP.md` H2)。所有 API 都需要 `X-User-Id` 標頭做 Information Isolation 判斷;在登入功能完成前,前端側邊欄提供一個「目前身分(暫代登入)」切換器,讓你選擇以哪個使用者身分操作,藉此也能實際體驗 ACL 紅線(非主管使用者只能看到自己負責的專案)。

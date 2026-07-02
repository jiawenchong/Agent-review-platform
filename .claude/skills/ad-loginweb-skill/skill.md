---
name: ad-loginweb-skill
description: AD Login + RBAC + 使用狀況監視 — 為內部 Flask + React web app 加入 Windows AD 登入（SIMPLE/LDAPS）、角色權限卡控（admin/boss/expert/viewer）、以及 login_logs 使用狀況儀表板的完整實作模式。當使用者需要在新的 Flask web app 中加入 AD 認證、建立角色白名單、或想監視使用者活躍度時使用此 skill。
---

# AD Login + RBAC + 使用狀況監視

為 Flask + React 內部 web app 加入 Windows AD 登入、角色權限卡控、使用狀況監視的完整模式。
這份 skill 提取自 AI Agent 預算審核平台（BudgetAgent）的實際實作，可作為其他內部 web 系統的起點。

---

## 架構速覽

```
前端登入表單（empno + 密碼）
    ↓ POST /api/auth/login
後端：LDAPS SIMPLE bind（10.10.10.2:636）
    ↓ 成功 → 查 budget.users 白名單 → 取得 role
    ↓ 失敗 / AD 不可達 → fallback 本機 password hash
    ↓ 登入成功 → 寫 login_logs → 回傳 session cookie
前端：依 role 顯示/隱藏功能模組
後端：@require_auth decorator → current_user() → RBAC 檢查
後端：APScheduler 或 cron → 定期統計 login_logs
前端：使用狀況儀表板（KPI + 趨勢圖）
```

---

## Part 1 — AD 登入（SIMPLE / LDAPS）

### 1-1 為何用 SIMPLE bind 而不用 NTLM

OpenSSL 3.0（現代 Linux 預設）**停用 MD4**，NTLM 的 NTLMv1 依賴 MD4，因此在現代環境跑 NTLM 會直接失敗。
改用 SIMPLE bind over LDAPS（port 636）：用 UPN 格式（`empno@domain.com`）當帳號、Windows 密碼當憑據，
讓 AD 本身驗密碼——不需要自行算 hash、也不受 OpenSSL MD4 限制。

### 1-2 Config（`backend/config.py`）

```python
# AD 設定
LDAP_SERVER      = "10.10.10.2"          # AD 主機 IP（或 hostname）
LDAP_PORT        = 636                   # LDAPS port（不是 389）
LDAP_USE_SSL     = True
LDAP_DOMAIN      = "KH"                  # NetBIOS domain（備用/diagnostic 用，實際登入不用）
LDAP_UPN_SUFFIX  = "kh.asegroup.com"    # UPN 後綴：empno@<UPN_SUFFIX>
LDAP_BASE_DN     = "DC=kh,DC=asegroup,DC=com"

# 若需要從 HR DB 同步 name/email（可選）
HR_DB_HOST       = "..."
HR_DB_NAME       = "..."
HR_DB_TABLE      = "base.kh_ad_employees"  # 欄位：empno, name, email
```

### 1-3 LDAP auth 工具（`backend/utils/ldap_auth.py`）

```python
from ldap3 import Server, Connection, SIMPLE, ALL
from backend.config import LDAP_SERVER, LDAP_PORT, LDAP_USE_SSL, LDAP_UPN_SUFFIX

def verify_ad_password(empno: str, password: str) -> bool:
    """
    嘗試用 empno@UPN_SUFFIX SIMPLE bind 至 LDAPS。
    回傳 True = 密碼正確；False = 密碼錯誤 / 帳號不存在。
    拋出 exception = AD 不可達（呼叫方決定是否 fallback）。
    """
    upn = f"{empno}@{LDAP_UPN_SUFFIX}"
    server = Server(LDAP_SERVER, port=LDAP_PORT, use_ssl=LDAP_USE_SSL, get_info=ALL)
    try:
        conn = Connection(server, user=upn, password=password,
                          authentication=SIMPLE, auto_bind=True)
        conn.unbind()
        return True
    except Exception as e:
        msg = str(e).lower()
        # invalidCredentials = 密碼錯（不是 AD 掛掉）
        if "invalidcredentials" in msg or "52e" in msg:
            return False
        raise  # AD 不可達 → 呼叫方決定 fallback
```

### 1-4 HR DB 同步 name/email（可選，`backend/utils/hr_lookup.py`）

```python
import psycopg2
from backend.config import HR_DB_HOST, HR_DB_NAME, HR_DB_TABLE

def fetch_hr_info(empno: str) -> dict | None:
    """從 HR DB 查 name, email。找不到回 None。"""
    try:
        conn = psycopg2.connect(host=HR_DB_HOST, dbname=HR_DB_NAME, ...)
        with conn.cursor() as cur:
            cur.execute(f"SELECT name, email FROM {HR_DB_TABLE} WHERE empno = %s", (empno,))
            row = cur.fetchone()
        conn.close()
        if row:
            return {"name": row[0], "email": row[1]}
    except Exception:
        pass
    return None
```

### 1-5 Login route（`backend/routes/auth.py`）

```python
import hashlib, json, datetime
from flask import Blueprint, request, session, jsonify
from backend.db import cursor
from backend.utils.ldap_auth import verify_ad_password
from backend.utils.hr_lookup import fetch_hr_info  # 可選

auth_bp = Blueprint("auth", __name__)

def _hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

@auth_bp.post("/auth/login")
def login():
    body   = request.json or {}
    empno  = (body.get("empno") or "").strip()
    pw     = body.get("password") or ""
    if not empno or not pw:
        return jsonify({"error": "請輸入員工編號和密碼"}), 400

    # ── 查白名單 ──────────────────────────────────────────
    with cursor() as cur:
        cur.execute("SELECT id, name, role, password_hash, email FROM budget.users WHERE ad_account = %s", (empno,))
        user = cur.fetchone()
    if not user:
        return jsonify({"error": "帳號尚未開通，請聯繫管理員"}), 403

    # ── AD 驗證 → fallback 本機 hash ──────────────────────
    ad_ok = False
    try:
        ad_ok = verify_ad_password(empno, pw)
    except Exception:
        # AD 不可達：fallback 比對本機 password_hash
        if user.get("password_hash") and user["password_hash"] == _hash_pw(pw):
            ad_ok = True

    if ad_ok and not user.get("password_hash"):
        # AD 可達時才用 verify_ad_password，若本機 hash 是 None 且 AD 驗過，繼續
        pass
    elif not ad_ok:
        return jsonify({"error": "密碼錯誤"}), 401

    # ── 選擇性：從 HR DB 同步 name/email ─────────────────
    hr = fetch_hr_info(empno)
    if hr:
        with cursor() as cur:
            cur.execute(
                "UPDATE budget.users SET name = %s, email = %s WHERE ad_account = %s",
                (hr["name"], hr["email"], empno)
            )

    # ── 寫 login_logs ────────────────────────────────────
    _write_login_log(user["id"], empno, request.remote_addr)

    # ── 設 session ────────────────────────────────────────
    session["user_id"]   = user["id"]
    session["user_name"] = hr["name"] if hr else user["name"]
    session["role"]      = user["role"]
    session["empno"]     = empno
    return jsonify({"id": user["id"], "name": session["user_name"], "role": user["role"]})

@auth_bp.post("/auth/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})

@auth_bp.get("/auth/me")
def me():
    uid = session.get("user_id")
    if not uid:
        return jsonify({"error": "未登入"}), 401
    with cursor() as cur:
        cur.execute("SELECT id, name, role, email FROM budget.users WHERE id = %s", (uid,))
        u = cur.fetchone()
    if not u:
        return jsonify({"error": "未登入"}), 401
    return jsonify(dict(u))

def _write_login_log(user_id, empno, ip):
    try:
        with cursor() as cur:
            cur.execute("""
                INSERT INTO budget.login_logs (user_id, empno, ip, logged_in_at)
                VALUES (%s, %s, %s, NOW())
            """, (user_id, empno, ip))
    except Exception:
        pass  # login_logs 不影響登入流程
```

---

## Part 2 — RBAC（角色權限卡控）

### 2-1 角色模型

| role    | 說明                                    |
|---------|----------------------------------------|
| admin   | 系統管理員：所有功能 + 使用者管理 + 使用狀況 |
| boss    | 主管：可簽核（approve/reject）           |
| expert  | 專家：可撰寫審核意見                     |
| viewer  | 唯讀：只能看列表和詳情                   |

設計原則：**白名單制**——使用者必須先由 admin 在 `budget.users` 建立帳號並指派 role，
才能登入。不支援自助註冊。

### 2-2 @require_auth decorator（`backend/utils/auth_utils.py`）

```python
from functools import wraps
from flask import session, jsonify
from backend.db import cursor

def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    with cursor() as cur:
        cur.execute("SELECT id, name, role, email, ad_account FROM budget.users WHERE id = %s", (uid,))
        return cur.fetchone()

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "未登入"}), 401
        return f(*args, **kwargs)
    return decorated

def require_role(*roles):
    """用法：@require_role("admin", "boss")"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = current_user()
            if not user:
                return jsonify({"error": "未登入"}), 401
            if user["role"] not in roles:
                return jsonify({"error": "權限不足"}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator
```

### 2-3 在 route 中使用

```python
from backend.utils.auth_utils import require_auth, require_role, current_user

@bp.get("/budgets")
@require_auth
def list_budgets():
    user = current_user()
    # 根據 role 決定 filter
    ...

@bp.post("/users")
@require_role("admin")
def create_user():
    ...

@bp.post("/budgets/<int:bid>/approve")
@require_role("admin", "boss")
def approve(bid):
    ...
```

### 2-4 `budget.users` 表結構

```sql
CREATE TABLE IF NOT EXISTS budget.users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR NOT NULL,
    department    VARCHAR,
    ad_account    VARCHAR UNIQUE NOT NULL,  -- = empno = Windows sAMAccountName
    role          VARCHAR NOT NULL DEFAULT 'viewer',
    email         VARCHAR,
    password_hash VARCHAR    -- 本機 fallback hash（AD 不可達時用）
);
```

### 2-5 前端 RBAC

```jsx
// 在 App 層級取得 user 資訊（含 role）
const [user, setUser] = React.useState(null);
React.useEffect(() => {
    API.me().then(u => setUser(u)).catch(() => {});
}, []);

// 條件渲染：只對 admin 顯示使用狀況連結
{user?.role === "admin" && (
    <SidebarItem icon="chart" label="使用狀況" onClick={() => setRoute("activity")} />
)}

// 按鈕禁用：只有 boss/admin 可以點「簽核」
<button
    disabled={!["admin", "boss"].includes(user?.role)}
    onClick={handleApprove}
>
    簽核通過
</button>
```

---

## Part 3 — 使用狀況監視（login_logs + 儀表板）

### 3-1 `budget.login_logs` 表結構

```sql
CREATE TABLE IF NOT EXISTS budget.login_logs (
    id           SERIAL PRIMARY KEY,
    user_id      INT REFERENCES budget.users(id),
    empno        VARCHAR,
    ip           VARCHAR,
    logged_in_at TIMESTAMP DEFAULT NOW()
);
```

在 `app.py` 啟動時自動建立（`CREATE TABLE IF NOT EXISTS`），不需要手動執行 migration。

```python
# app.py 或 routes/auth.py 的 init 函式
def init_login_logs_schema():
    with cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS budget.login_logs (
                id           SERIAL PRIMARY KEY,
                user_id      INT REFERENCES budget.users(id),
                empno        VARCHAR,
                ip           VARCHAR,
                logged_in_at TIMESTAMP DEFAULT NOW()
            )
        """)
```

### 3-2 活躍度 API（`backend/routes/activity.py`）

```python
from flask import jsonify
from backend.db import cursor
from backend.utils.auth_utils import require_role

activity_bp = Blueprint("activity", __name__)

@activity_bp.get("/activity/summary")
@require_role("admin")
def activity_summary():
    with cursor() as cur:
        # 總使用者數
        cur.execute("SELECT COUNT(*) AS cnt FROM budget.users")
        total_users = cur.fetchone()["cnt"]

        # 近 7 天活躍使用者（有登入過的 distinct user）
        cur.execute("""
            SELECT COUNT(DISTINCT user_id) AS cnt
            FROM budget.login_logs
            WHERE logged_in_at >= NOW() - INTERVAL '7 days'
        """)
        active_7d = cur.fetchone()["cnt"]

        # 近 30 天活躍使用者
        cur.execute("""
            SELECT COUNT(DISTINCT user_id) AS cnt
            FROM budget.login_logs
            WHERE logged_in_at >= NOW() - INTERVAL '30 days'
        """)
        active_30d = cur.fetchone()["cnt"]

        # 今天登入次數
        cur.execute("""
            SELECT COUNT(*) AS cnt
            FROM budget.login_logs
            WHERE logged_in_at::date = CURRENT_DATE
        """)
        logins_today = cur.fetchone()["cnt"]

        # 過去 30 天每日登入次數（趨勢圖用）
        cur.execute("""
            SELECT logged_in_at::date AS day, COUNT(*) AS cnt
            FROM budget.login_logs
            WHERE logged_in_at >= NOW() - INTERVAL '30 days'
            GROUP BY day ORDER BY day
        """)
        daily_trend = [{"day": str(r["day"]), "cnt": r["cnt"]} for r in cur.fetchall()]

        # 最近 50 筆登入記錄
        cur.execute("""
            SELECT l.empno, u.name, u.role, l.ip, l.logged_in_at
            FROM budget.login_logs l
            LEFT JOIN budget.users u ON u.id = l.user_id
            ORDER BY l.logged_in_at DESC LIMIT 50
        """)
        recent = [dict(r) for r in cur.fetchall()]

    return jsonify({
        "totalUsers":   total_users,
        "active7d":     active_7d,
        "active30d":    active_30d,
        "loginsToday":  logins_today,
        "dailyTrend":   daily_trend,
        "recentLogins": recent,
    })
```

### 3-3 前端使用狀況頁（React 元件骨架）

```jsx
function ActivityPage() {
    const [data, setData] = React.useState(null);

    React.useEffect(() => {
        API.fetchActivitySummary().then(setData).catch(() => {});
    }, []);

    if (!data) return <div>載入中…</div>;

    return (
        <div className="main">
            {/* KPI 卡片列 */}
            <div style={{ display: "flex", gap: 16 }}>
                <KpiCard label="總使用者"     value={data.totalUsers}  />
                <KpiCard label="近 7 天活躍"  value={data.active7d}    />
                <KpiCard label="近 30 天活躍" value={data.active30d}   />
                <KpiCard label="今日登入"     value={data.loginsToday} />
            </div>

            {/* 30 天趨勢折線圖（可用 SVG 自繪或 recharts） */}
            <DailyTrendChart data={data.dailyTrend} />

            {/* 最近登入記錄表格 */}
            <table className="dt">
                <thead>
                    <tr>
                        <th>員工編號</th><th>姓名</th><th>角色</th>
                        <th>IP</th><th>登入時間</th>
                    </tr>
                </thead>
                <tbody>
                    {data.recentLogins.map((r, i) => (
                        <tr key={i}>
                            <td>{r.empno}</td>
                            <td>{r.name}</td>
                            <td>{r.role}</td>
                            <td>{r.ip}</td>
                            <td>{r.logged_in_at}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
```

### 3-4 前端 API 橋接（`budget/api.js`）

```javascript
async function fetchActivitySummary() {
    const res = await fetch(`${BASE}/api/activity/summary`, { credentials: "include" });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
// 記得加進 window.API = { ..., fetchActivitySummary }
```

---

## Part 4 — Flask app.py 接線

```python
# app.py
from flask import Flask
from flask_cors import CORS
from backend.routes.auth import auth_bp, init_login_logs_schema
from backend.routes.activity import activity_bp

app = Flask(__name__)
app.secret_key = "your-secret-key-here"   # 改成夠長的隨機字串
CORS(app, supports_credentials=True, origins=["http://localhost:5000"])

app.register_blueprint(auth_bp,      url_prefix="/api")
app.register_blueprint(activity_bp,  url_prefix="/api")

# 啟動時自動建 extension 表
init_login_logs_schema()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
```

---

## 常見根本原因對照表

| 症狀 | 原因 | 排除方法 |
|------|------|----------|
| AD 登入回 "invalid credentials" 但密碼確定正確 | port 636 不通，AD server 沒有 LDAPS 憑證 | `openssl s_client -connect <AD_IP>:636` 測試連線；確認 AD 有啟用 LDAPS |
| AD 登入回 "connection timeout" | 防火牆擋住 port 636 | 確認主機到 AD 的 port 636 TCP 可達；試 port 389（不加密）先排除 routing 問題 |
| 登入成功但 role 拿不到 | user 不在白名單（budget.users 沒有這個 empno） | admin 先在 權限管理中心 建帳號 / 或直接 INSERT INTO budget.users |
| login_logs 沒有寫入資料 | `budget.login_logs` 表還沒建 | 確認 `init_login_logs_schema()` 有在 app.py 啟動時呼叫 |
| @require_auth 每次都回 401 | session 沒有跨請求保持（前端沒帶 `credentials: "include"`） | fetch 加上 `{ credentials: "include" }`；確認 Flask session secret_key 已設定 |
| 改了 config.py 的 LDAP 設定，登入行為沒變 | Flask process 沒重啟，舊設定還在記憶體 | 重啟 Flask process（config 是 import-time 讀入，不會動態重讀） |
| AD 可達但 `ldap3` import 失敗 | ldap3 裝在 system Python，不在 venv 裡 | `<venv>/Scripts/pip install ldap3`（Windows）或 `<venv>/bin/pip install ldap3`（Linux） |
| 使用狀況頁 403 | 登入者 role 不是 admin | 確認 budget.users 裡該帳號的 role 欄位是 "admin" |

---

## 快速清單（新專案移植）

1. `pip install flask flask-cors psycopg2-binary ldap3`
2. 建 `budget.users` 表（見 2-4）
3. 在 `config.py` 填入 `LDAP_SERVER`、`LDAP_PORT=636`、`LDAP_UPN_SUFFIX`
4. 加 `utils/ldap_auth.py`（見 1-3）
5. 加 `routes/auth.py`（見 1-5，含 `init_login_logs_schema`）
6. 加 `utils/auth_utils.py`（見 2-2）
7. 加 `routes/activity.py`（見 3-2）
8. `app.py` 註冊 blueprint + 呼叫 `init_login_logs_schema()`（見 Part 4）
9. 前端：`LoginPage` 元件 POST `/api/auth/login`，成功後存 user state
10. 前端：所有 fetch 加 `{ credentials: "include" }`
11. 前端：依 `user.role` 顯示/隱藏功能（見 2-5）
12. 前端：ActivityPage 元件 + API bridge（見 3-3、3-4）

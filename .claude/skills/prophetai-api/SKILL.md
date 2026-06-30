---
name: prophetai-api
description: >
  呼叫公司線上 ProphetAI（OpenAI 相容 /v1/chat/completions）API 的標準方法與可用範本。
  觸發情境：使用者說「我要用 API 的方式」「用 ProphetAI / 線上 LLM API」「幫我接公司的 API」
  「把這支改成走 API」「給我呼叫 API 的 format」等。核心能力：直接產出已驗證可用的呼叫
  程式碼（block 陣列 content + Bearer 驗證 + 關 SSL 驗證 + 不走對外 proxy），key/agent id
  留空待 host 本機填，並附上 assistant_disabled 等常見 403/錯誤的排查對照表。
---

# ProphetAI 線上 API 呼叫法（已驗證可用）

公司內部 ProphetAI 提供 **OpenAI 相容** 的 `/v1/chat/completions` 端點。
這份 skill 是「已實際跑通」的呼叫範本與規則，要接 API 時直接照這個出。
參考實作：`pensieve/pipeline1_new.py` 的 `_llm_call_online()`（分類）、`pensieve/pipeline_audit.py` 的
`call_audit_llm()`（審核）、`analysis/llm_client.py`（RAG 知識庫建置用，獨立於上述審核 pipeline 之外）。

## 五個必守規則（少一個就會失敗）

1. **endpoint**：`https://10.10.23.120:4231/public/kits/openai/v1/chat/completions`
2. **`model` 欄位 = agent id**（不是模型名稱）。例：`ac120035-9eed-119a-819f-11efe37356f2`，**不含 `{{ }}`**。
3. **`messages[].content` 是 block 陣列**（多模態格式），不是純字串：
   `"content": [{"type": "text", "text": "...."}]`
4. **驗證**：header `Authorization: Bearer <API_KEY>`，key 形如 `ask_xxxx`，**不含 `{{ }}`**。
5. **內網自簽憑證 → 關 SSL 驗證**，且**不要走公司對外 proxy**（否則 proxy 擋 CONNECT，回 403）。

> ⚠ Postman「Generate Code」匯出的範例常有兩個雷：`payload` 是一段 curl 字串（不是 JSON）、
> key/model 被 `{{ }}` 包住。那兩個都別照抄——`{{ }}` 不是真實字元，要用裸值。
> 範例裡的 `Cookie: JSESSIONID=...` 是 Postman session 殘留，正式呼叫不需要。

## 標準範本（urllib，無第三方相依，與 pipeline1_new 一致）

```python
import os, json, ssl, urllib.request, urllib.error

ENDPOINT = "https://10.10.23.120:4231/public/kits/openai/v1/chat/completions"
API_KEY  = os.environ.get("COMPANY_LLM_API_KEY", "") or ""   # ← host 本機填 ask_xxxx（不含 {{ }}），勿 commit
AGENT_ID = os.environ.get("COMPANY_LLM_AGENT", "")   or ""   # ← host 本機填 agent id（不含 {{ }}），勿 commit

def call_prophetai(prompt: str, *, temperature: float = 0, timeout: int = 180) -> str:
    """送單一 user prompt，回模型純文字。失敗回 ''（或自行改成丟例外）。"""
    if not API_KEY or not AGENT_ID:
        raise RuntimeError("API_KEY / AGENT_ID 未設定（只在 host 本機填，勿 commit）")

    payload = json.dumps({
        "model": AGENT_ID,                                              # 規則 2
        "messages": [{"role": "user",
                      "content": [{"type": "text", "text": prompt}]}],  # 規則 3：block 陣列
        "temperature": temperature,
    }, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(ENDPOINT, data=payload, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",                          # 規則 4
    })

    ctx = ssl.create_default_context()                                 # 規則 5：關 SSL 驗證
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    opener = urllib.request.build_opener(                              # 規則 5：不走對外 proxy
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=ctx),
    )

    try:
        with opener.open(req, timeout=timeout) as resp:
            result = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"⚠️ API 回應錯誤 {e.code}：{e.read().decode(errors='replace')[:200]}")
        return ""
    except urllib.error.URLError as e:
        print(f"⚠️ 無法連線 API：{e}")
        return ""

    content = result["choices"][0]["message"]["content"]
    if isinstance(content, list):              # 回應也可能是 block 陣列，串回純文字
        content = "".join(b.get("text", "") for b in content if isinstance(b, dict))
    return (content or "").strip()
```

## key / agent id 怎麼填

- **host 機器(無 git)的本機檔案**才填真值；進版控的 repo 檔案這兩格**永遠留空**，
  填了就是把祕密推上 GitHub，等於外洩，得馬上換 key。
- 兩種填法（並存時環境變數優先）：
  - 程式內：`API_KEY_HARDCODED = "ask_xxxx"` / `AGENT_ID_HARDCODED = "..."`
  - 環境變數：`set COMPANY_LLM_API_KEY=ask_xxxx`、`set COMPANY_LLM_AGENT=...`
- 自動化啟動、不想設環境變數 → 直接填 host 本機那份檔最省事。

## prompt 放哪

- **內嵌送出（自包含）**：把系統/分類 prompt 與使用者內容併進同一個 user block 的 text，
  這樣平台 agent 即使沒設 prompt 也能用（pipeline1_new 的 `SEND_PROMPT_INLINE=True` 即此）。
- **放平台 agent 側**：程式只送內容，prompt 由該 agent id 在 ProphetAI 後台持有
  （審核 agent `analysis/llm_client.py` 即此）。兩種都行，看要在哪裡管 prompt。

## 錯誤排查對照表

| 回應 | 意思 | 修法 |
|---|---|---|
| `403 assistant_disabled：Assistant is disabled.` | **agent 被停用**（程式/連線其實正常） | 到 ProphetAI 後台把該 agent 啟用/發布；或確認 agent id 正確 |
| `403 Forbidden`（HTML/proxy 樣式） | 走到對外 proxy 被擋 | 確認用了 `ProxyHandler({})`，不要繼承系統 proxy |
| SSL `CERTIFICATE_VERIFY_FAILED` | 內網自簽憑證沒關驗證 | `ctx.verify_mode = ssl.CERT_NONE` + `check_hostname=False` |
| `model not found` / `invalid model` | `model` 沒放 agent id，或 id 錯/含 `{{ }}` | 用裸 agent id |
| `401 / invalid api key` | key 沒帶、錯、或含 `{{ }}` | header 帶 `Bearer ask_xxxx` 裸值 |
| 連線逾時 / URLError | endpoint 不通或防火牆 | 確認 host 連得到 `10.10.23.120:4231` |
| 回應解析 KeyError | 平台回了錯誤物件而非 choices | 先印 `result` 全文看 error 內容 |

## 失敗時的保底

接在批次流程裡時，呼叫失敗應回 `''` / 丟例外讓上層走兜底（例如 pipeline1_new 的
重試 → 標題判定兜底），不要讓單筆 API 失敗炸掉整批。

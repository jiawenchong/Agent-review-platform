---
name: agent-validation-report
description: >
  產生標準化的「AI Agent 驗證報告」簡報(深色科技風格,黑藍漸層背景,10 頁固定結構)。
  觸發情境:使用者說「幫我做驗證報告」「產生 Agent 驗證簡報」「做一份 validation report」
  「Offline/Online 驗證報告 PPT」等。核心能力:依 reference/template_structure.json 定義的
  版面規則,用 scripts/generate_ppt.py 把使用者提供的內容(或留白佔位符)套進固定的 10 頁
  結構,產出 .pptx。
---

# AI Agent 驗證報告模板生成器

用於產生「AI Agent 開發驗證報告」簡報 — 內部跟主管/專家報告 Agent 上線前後驗證結果的標準格式。
視覺風格與頁面結構是固定的(深色科技感),每次產生時只換內容,不換版面,確保多個 Agent 專案的
驗證報告看起來一致、專業。

## 檔案結構

```
reference/template_structure.json      版面結構與配色規則(single source of truth)
reference/input_data.example.json      範例輸入資料,對照 10 頁各自需要哪些欄位
reference/prompt.md                    LLM prompt:原始資料 → 結構化 JSON
reference/test_source_material.example.txt   測試用原始資料(會議記錄格式),拿去餵 prompt.md 用
scripts/generate_ppt.py                產生器,讀 template_structure.json + 輸入 JSON → .pptx
```

## 完整流程

```
原始資料(會議記錄/測試結果/Guardrail設計/Q&A)
    ↓
ProphetAI LLM(reference/prompt.md)→ 結構化 JSON(對照 input_data.example.json)
    ↓
scripts/generate_ppt.py → .pptx
```

`reference/prompt.md` **目前尚未接進網頁後端**,先當獨立 skill 用:把 prompt 貼進 ProphetAI
後台設定一個新 agent(專門做「驗證報告資料整理」這件事),測試沒問題、agent id 跟 API key
都拿到之後,才會進一步討論要不要在網頁做一個獨立頁面把這串流程接起來。

## 視覺風格規範

- **背景**:深藍黑(`#0B1026`)。表格儲存格另外填深藍(`#141B33`,標題列 `#1A2E4A`)避免
  python-pptx 預設白底蓋掉深色主題文字。
- **字體**:標題 `Arial Black` 白色 32–44pt;內文 `Arial` 淺灰(`#E0E0E0`)14–18pt。
- **強調色**:亮綠 `#00FF9D`(成功/指標)、亮黃 `#FFD700`(警告)、亮藍 `#00BFFF`(資訊)。
- **版面**:16:9,左對齊為主,邊距 24pt 上下。

實際色碼/字級都定義在 `reference/template_structure.json` 的 `template_metadata`,
`generate_ppt.py` 從那份檔案讀取,不要在腳本裡另外寫死一份配色 — 改風格只改 JSON。

## 10 頁固定結構

1. **Cover** — 主標題 / 副標題 / 報告人 / 單位 / 日期 / 保密聲明
2. **Agent Goal Definition** — 專案說明表格 + 指標區塊 + 五階段流程(Trigger→Perception→Reasoning→Action→Feedback)
3. **Data Sources & Tools** — Data / Model / Knowledge 三欄 + Skills/Tools/Data/Source 對照表
4. **Decision Logic & Flow** — 任務與思考邏輯表格 + 決策流程圖 + 派發時效註解
5. **Guardrails & Red Lines** — 5 項紅線(Output/Capability/Grounding/Hallucination/Goal)
6. **Golden Test Cases** — 4 種典型情境(問題狀況 / 專家決策 / Agent 驗證檢查點)
7. **Task Completion Capability** — 任務成功率 / 結果準確率 + 驗證截圖說明
8. **Offline Validation** — 驗證天數/期間 + 郵件清單 + 產出正確率
9. **Online Validation** — 持續運行天數 + 郵件清單 + 效能對比(人工 vs Agent)
10. **Q&A / Closing**

## 使用方式

1. 準備輸入 JSON(對照 `reference/input_data.example.json` 的欄位;沒有的欄位留空即可,
   腳本會自動填方括號佔位符,例如 `[專案說明]`)
2. 執行:
   ```bash
   python .claude/skills/agent-validation-report/scripts/generate_ppt.py my_input.json output.pptx
   ```
   兩個參數都選填:不給輸入檔 → 全部留白模板;不給輸出檔名 → 預設
   `AI_Agent_Validation_Report.pptx`。
3. 需要 `python-pptx`(repo 的 `backend/requirements.txt` 已含)。

## 輸入資料怎麼給

跟使用者對話收集下列類別的內容(對應 10 頁),沒問到的欄位就讓腳本填佔位符,
不要自己編造數據:

- 專案基本資訊(標題、報告人、單位、日期)
- 目標定義(專案說明、Agent 角色、核心使命、觸發時機、成功門檻、指標)
- 資料/模型/知識庫來源
- 決策邏輯(任務、Sub-Agent、思考邏輯、工具)
- 5 項 Guardrail 的具體描述
- 4 個黃金測試情境
- 任務成功率 / 結果準確率實測數字
- Offline / Online 驗證的天數、期間、效能對比數字

## 已知限制

- 截圖類頁面(第 7–9 頁)目前只放文字佔位符,不會自動嵌入真實截圖 — 如果使用者提供圖片檔,
  需要另外用 `slide.shapes.add_picture()` 補上,腳本目前沒做這塊。
- 流程圖頁面(第 2、4 頁)是文字描述,不是真的 Mermaid/SmartArt 流程圖圖形。

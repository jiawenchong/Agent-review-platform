// Field schema for the AI Agent Validation Report form.
// Keys match the flat JSON the PPTX generator consumes (see
// .claude/skills/agent-validation-report/reference/prompt.md). `info.*` is
// nested in the payload but flattened to info_reporter / info_department /
// info_date in the form state for a flat editing surface.

export type FieldType = 'text' | 'textarea' | 'number';

export interface FormField {
  key: string;
  label: string;
  help?: string;
  type?: FieldType;
}

export interface FormGroup {
  title: string;
  note?: string;
  fields: FormField[];
}

export const FORM_GROUPS: FormGroup[] = [
  {
    title: '封面資訊',
    fields: [
      { key: 'title', label: '報告主標題', help: '通常是「{Agent 名稱} 驗證報告」' },
      { key: 'subtitle', label: '副標題', help: '一句話說明這個 Agent 做什麼' },
      { key: 'info_reporter', label: '報告人姓名' },
      { key: 'info_department', label: '單位／部門' },
      { key: 'info_date', label: '報告日期', help: 'YYYY-MM-DD' },
    ],
  },
  {
    title: '目標定義',
    fields: [
      { key: 'project_desc', label: '專案說明', help: '這個 Agent 解決什麼問題', type: 'textarea' },
      { key: 'agent_role', label: 'Agent 角色定位', type: 'textarea' },
      { key: 'mission', label: '核心使命', help: '一句話' },
      { key: 'trigger', label: '觸發時機', help: '什麼事件會啟動這個 Agent' },
      { key: 'success_threshold', label: '成功門檻', help: '量化，例如「一致率 ≥85%」' },
      { key: 'project_metrics', label: '專案指標', help: '量化效益，例如「cycle time 降低 >50%」' },
    ],
  },
  {
    title: '資料來源 / 模型 / 知識庫',
    fields: [
      { key: 'data_sources', label: '資料來源說明', type: 'textarea' },
      { key: 'model_usage', label: '使用的模型／Agent 說明', type: 'textarea' },
      { key: 'knowledge_base', label: '知識庫／RAG 內容說明', type: 'textarea' },
      { key: 'skills', label: 'Skills', help: '表格用，簡短' },
      { key: 'tools', label: 'Tools', help: '表格用，簡短（資料來源頁）' },
      { key: 'data', label: 'Data', help: '表格用，簡短' },
      { key: 'source', label: 'Source', help: '表格用，簡短' },
    ],
  },
  {
    title: '決策邏輯',
    fields: [
      { key: 'tasks', label: 'Tasks', help: '任務分類，如「初審／派發／複審回饋」' },
      { key: 'sub_agent', label: 'Sub-Agent' },
      { key: 'logic', label: '思考邏輯', type: 'textarea' },
      { key: 'logic_tools', label: 'Tools & Skills', help: '決策邏輯頁用（與上面 Tools 不同）' },
    ],
  },
  {
    title: 'Guardrails 紅線',
    note: '依實際設計的紅線數量填寫，沒有的留空即可（不用硬湊 5 條）。',
    fields: [
      { key: 'g1_output', label: 'Output', help: '輸出格式紅線', type: 'textarea' },
      { key: 'g2_capability', label: 'Capability', help: '能力邊界紅線', type: 'textarea' },
      { key: 'g3_grounding', label: 'Grounding', help: '有所本紅線', type: 'textarea' },
      { key: 'g4_hallucination', label: 'Hallucination', help: '幻覺防護紅線', type: 'textarea' },
      { key: 'g5_goal', label: 'Goal', help: '目標對齊紅線', type: 'textarea' },
    ],
  },
  {
    title: '黃金測試情境',
    note: '每個情境三欄：問題狀況 / 專家標準決策 / Agent 驗證檢查點。用不到的情境整列留空。',
    fields: [
      { key: 't1_problem', label: '情境 1 · 問題狀況' },
      { key: 't1_expert', label: '情境 1 · 專家標準決策' },
      { key: 't1_check', label: '情境 1 · Agent 檢查點' },
      { key: 't2_problem', label: '情境 2 · 問題狀況' },
      { key: 't2_expert', label: '情境 2 · 專家標準決策' },
      { key: 't2_check', label: '情境 2 · Agent 檢查點' },
      { key: 't3_problem', label: '情境 3 · 問題狀況' },
      { key: 't3_expert', label: '情境 3 · 專家標準決策' },
      { key: 't3_check', label: '情境 3 · Agent 檢查點' },
      { key: 't4_problem', label: '情境 4 · 問題狀況' },
      { key: 't4_expert', label: '情境 4 · 專家標準決策' },
      { key: 't4_check', label: '情境 4 · Agent 檢查點' },
    ],
  },
  {
    title: '任務能力驗證',
    fields: [
      { key: 'task_rate', label: '任務成功率', help: '量化，附樣本數更好，例如「100%(N=356)」' },
      { key: 'accuracy_rate', label: '結果準確率', help: '量化數字' },
    ],
  },
  {
    title: 'Offline 驗證',
    fields: [
      { key: 'days', label: 'Offline 驗證天數', type: 'number' },
      { key: 'period', label: 'Offline 驗證期間', help: '例如「2026/07/01 - 2026/07/20」' },
    ],
  },
  {
    title: 'Online 驗證',
    fields: [
      { key: 'run_days', label: 'Online 持續運行天數', type: 'number' },
    ],
  },
];

// All flat field keys (used to seed empty form state).
export const ALL_FIELD_KEYS: string[] = FORM_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

export function emptyForm(): Record<string, string> {
  return Object.fromEntries(ALL_FIELD_KEYS.map((k) => [k, '']));
}

/** Flatten the nested JSON returned by /compile into flat form state. */
export function flattenToForm(data: Record<string, unknown>): Record<string, string> {
  const form = emptyForm();
  for (const key of ALL_FIELD_KEYS) {
    if (key.startsWith('info_')) continue; // handled below
    const val = data[key];
    if (val !== undefined && val !== null) form[key] = String(val);
  }
  const info = (data.info ?? {}) as Record<string, unknown>;
  if (info.reporter != null) form.info_reporter = String(info.reporter);
  if (info.department != null) form.info_department = String(info.department);
  if (info.date != null) form.info_date = String(info.date);
  return form;
}

/** Build the nested JSON payload the PPTX generator expects from flat form state. */
export function formToPayload(form: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(form)) {
    if (key.startsWith('info_')) continue;
    if (key === 'days' || key === 'run_days') {
      // keep numeric when possible; the generator str()s it, "" → [待補]
      payload[key] = /^\d+$/.test(value.trim()) ? Number(value.trim()) : value.trim();
    } else {
      payload[key] = value;
    }
  }
  payload.info = {
    reporter: form.info_reporter ?? '',
    department: form.info_department ?? '',
    date: form.info_date ?? '',
  };
  return payload;
}

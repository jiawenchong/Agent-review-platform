import type { Project, Notification, AuditEntry, ReportHistoryEntry } from './types';

export const PROJECTS: Project[] = [
  {
    id: 'PROJ-001', name: '信用風險評估 Agent', dept: '金融科技部', owner: '林子晴', status: 'normal', score: 94, lastUpdated: '2026-06-15',
    description: '自動評估信用申請人風險等級，輸出「拒絕 / 通過 / 人工複核」三類決策，並記錄每次決策依據供後續審計追溯。', hasAuditTrigger: false,
    phases: [
      { stepNum: 1, name: 'Perception', subname: '掃描', state: 'done', ts: '2026-06-10 09:23', summary: '掃描 12,847 筆申請資料，異常樣本率 0.3%，資料品質良好。' },
      { stepNum: 2, name: 'Reasoning', subname: 'AI 判斷', state: 'done', ts: '2026-06-11 14:05', summary: '模型信心值平均 0.91，高風險判定 384 件，無異常偏移。' },
      { stepNum: 3, name: 'Action', subname: '分級', state: 'done', ts: '2026-06-12 11:30', summary: '通過 11,822／人工複核 641／拒絕 384，比例符合預期。' },
      { stepNum: 4, name: 'Feedback', subname: '驗證', state: 'active', ts: '2026-06-15 09:00', summary: '人工複核完成率 76%，無 Guardrail 觸發，持續監控中。' },
    ],
    qa: [
      { id: 'QA-2026-087', date: '2026-06-13', type: '申訴', tstate: 'normal', status: '已結案', sstate: 'normal', content: '申請人 #CU-8841 申訴拒絕決定，複核後確認維持拒絕，模型信心值 0.94，決策正確。', reviewer: '李明宗' },
      { id: 'QA-2026-091', date: '2026-06-14', type: '檢討', tstate: 'review', status: '進行中', sstate: 'watch', content: '季度模型漂移分析，PSI 指數 0.08，尚在可接受範圍但需持續關注，下季複查。', reviewer: '林子晴' },
    ],
  },
  {
    id: 'PROJ-002', name: '客服自動化 Agent', dept: '客戶服務部', owner: '陳維倫', status: 'watch', score: 71, lastUpdated: '2026-06-14',
    description: '處理第一線客服詢問，判斷可自動回覆或需轉介人工客服，目標將人工轉介率降至 15% 以下。', hasAuditTrigger: true,
    phases: [
      { stepNum: 1, name: 'Perception', subname: '掃描', state: 'done', ts: '2026-06-08 10:00', summary: '掃描 8,321 筆對話紀錄，完成輸入驗證與意圖分類前處理。' },
      { stepNum: 2, name: 'Reasoning', subname: 'AI 判斷', state: 'done', ts: '2026-06-09 15:20', summary: '模型信心值平均 0.78 偏低，已觸發觀察中狀態。' },
      { stepNum: 3, name: 'Action', subname: '分級', state: 'active', ts: '2026-06-14 08:45', summary: '人工轉介率 32%，超過基準上限 15%，連續 3 日偏高。' },
      { stepNum: 4, name: 'Feedback', subname: '驗證', state: 'pending', ts: '—', summary: '待動作階段改善後執行驗證。' },
    ],
    qa: [
      { id: 'QA-2026-095', date: '2026-06-14', type: '預警', tstate: 'watch', status: '待處理', sstate: 'watch', content: '人工轉介率連續 3 日超過 30%，系統自動升級通知部門主管，建議檢視意圖分類模型是否需更新。', reviewer: '張美華（主管）' },
    ],
  },
  {
    id: 'PROJ-003', name: '反洗錢偵測 Agent', dept: '法規遵循部', owner: '王建志', status: 'red', score: 38, lastUpdated: '2026-06-16',
    description: '即時偵測可疑交易行為，依 AML 法規觸發 STR 申報流程，須確保 100% 合規不得有任何漏報。', hasAuditTrigger: true,
    phases: [
      { stepNum: 1, name: 'Perception', subname: '掃描', state: 'done', ts: '2026-06-14 07:00', summary: '掃描 156,332 筆交易，可疑候選 2,871 筆，資料完整性 99.8%。' },
      { stepNum: 2, name: 'Reasoning', subname: 'AI 判斷', state: 'red', ts: '2026-06-16 02:17', summary: 'Guardrail 觸發：決策邏輯與白名單規則衝突，8 件高風險交易被錯誤清除，已暫停處理。' },
      { stepNum: 3, name: 'Action', subname: '分級', state: 'blocked', ts: '—', summary: '因 Guardrail 觸發，本階段已暫停，待人工審查完成後恢復。' },
      { stepNum: 4, name: 'Feedback', subname: '驗證', state: 'pending', ts: '—', summary: '待人工審查結果確認後執行。' },
    ],
    qa: [
      { id: 'GL-2026-003', date: '2026-06-16', type: 'Guardrail', tstate: 'red', status: '處理中', sstate: 'red', content: '白名單規則 WL-089 與模型輸出不一致，8 件 STR 遭錯誤清除，系統自動暫停輸出，已即時通知法遵長啟動應急程序。', reviewer: '王建志、林副總（法遵長）' },
      { id: 'QA-2026-102', date: '2026-06-15', type: '檢討', tstate: 'review', status: '已結案', sstate: 'normal', content: '模型 v2.3.1 部署後例行檢核，發現訓練資料時間窗口偏移，當時評估風險低，後續驗證此為本次 Guardrail 觸發根因之一。', reviewer: '王建志' },
    ],
  },
  {
    id: 'PROJ-004', name: '供應鏈優化 Agent', dept: '採購管理部', owner: '吳雅婷', status: 'normal', score: 89, lastUpdated: '2026-06-13',
    description: '自動分析供應商績效、交期達成率與價格趨勢，產出優先採購建議清單供採購團隊決策參考。', hasAuditTrigger: false,
    phases: [
      { stepNum: 1, name: 'Perception', subname: '掃描', state: 'done', ts: '2026-06-09 08:10', summary: '供應商資料掃描完成，共 342 家，資料完整率 97%。' },
      { stepNum: 2, name: 'Reasoning', subname: 'AI 判斷', state: 'done', ts: '2026-06-10 13:40', summary: '績效評分計算完成，識別高風險供應商 3 家。' },
      { stepNum: 3, name: 'Action', subname: '分級', state: 'done', ts: '2026-06-11 10:05', summary: '採購建議已分級輸出，優先級 A/B/C 各 12/28/302 家。' },
      { stepNum: 4, name: 'Feedback', subname: '驗證', state: 'active', ts: '2026-06-13 16:30', summary: '採購部門確認中，完成率 88%，3 件異議待複核。' },
    ],
    qa: [],
  },
  {
    id: 'PROJ-005', name: '員工流動預測 Agent', dept: '人力資源部', owner: '劉仲謙', status: 'watch', score: 66, lastUpdated: '2026-06-12',
    description: '量化分析員工出勤、績效與滿意度指標，預測高離職風險族群並提供主管預警與留任建議。', hasAuditTrigger: false,
    phases: [
      { stepNum: 1, name: 'Perception', subname: '掃描', state: 'done', ts: '2026-06-07 09:00', summary: '掃描 1,204 名員工指標資料，缺漏率 4%，已補值。' },
      { stepNum: 2, name: 'Reasoning', subname: 'AI 判斷', state: 'active', ts: '2026-06-12 11:20', summary: '模型公平性檢核中，部門別預測差異偏高，觸發觀察。' },
      { stepNum: 3, name: 'Action', subname: '分級', state: 'pending', ts: '—', summary: '待公平性複核通過後輸出風險分級。' },
      { stepNum: 4, name: 'Feedback', subname: '驗證', state: 'pending', ts: '—', summary: '待動作階段完成後執行。' },
    ],
    qa: [{ id: 'QA-2026-099', date: '2026-06-12', type: '檢討', tstate: 'review', status: '進行中', sstate: 'watch', content: 'HR 倫理委員會要求補做模型公平性評估，確認不同部門間預測差異是否構成歧視風險。', reviewer: '劉仲謙' }],
  },
  {
    id: 'PROJ-006', name: '合約風險審閱 Agent', dept: '法務部', owner: '黃詩涵', status: 'normal', score: 91, lastUpdated: '2026-06-11',
    description: '自動審閱供應商與客戶合約，標記高風險條款並比對標準合約範本，輸出風險等級與建議修改點。', hasAuditTrigger: false,
    phases: [
      { stepNum: 1, name: 'Perception', subname: '掃描', state: 'done', ts: '2026-06-05 14:00', summary: '掃描 87 份合約，OCR 與條款切分完成，準確率 98.5%。' },
      { stepNum: 2, name: 'Reasoning', subname: 'AI 判斷', state: 'done', ts: '2026-06-06 10:30', summary: '高風險條款標記 53 處，與範本偏離度計算完成。' },
      { stepNum: 3, name: 'Action', subname: '分級', state: 'done', ts: '2026-06-08 09:15', summary: '合約風險分級輸出，高/中/低各 9/24/54 份。' },
      { stepNum: 4, name: 'Feedback', subname: '驗證', state: 'active', ts: '2026-06-11 15:45', summary: '律師複核完成率 92%，標記準確率回饋良好。' },
    ],
    qa: [],
  },
];

export const NOTIFICATIONS: Notification[] = [
  { id: 'N1', projId: 'PROJ-003', kind: 'red', title: 'Guardrail 觸發 · 已升級法遵長', ts: '06-16 02:18', body: '反洗錢偵測 Agent 於 Reasoning 階段觸發紅線，8 件 STR 遭錯誤清除，系統已自動暫停輸出並升級至法遵長。' },
  { id: 'N2', projId: 'PROJ-002', kind: 'watch', title: '停滯預警 · 動作階段超時', ts: '06-14 08:46', body: '客服自動化 Agent 人工轉介率連續 3 日超過 30%，動作階段停滯，已升級通知部門主管張美華。' },
  { id: 'N3', projId: 'PROJ-005', kind: 'watch', title: '公平性複核待處理', ts: '06-12 11:25', body: '員工流動預測 Agent 推理階段觸發公平性觀察，HR 倫理委員會要求補做評估，目前停留在推理階段待人工複核。' },
  { id: 'N4', projId: 'PROJ-004', kind: 'info', title: '驗證階段提醒', ts: '06-13 16:32', body: '供應鏈優化 Agent 已進入回饋驗證階段，採購部門尚有 3 件異議待複核，請相關人員於本週內完成確認。' },
];

export const AUDIT: AuditEntry[] = [
  { id: 'GL-2026-003', guardrailType: 'Grounding', project: '反洗錢偵測 Agent', sev: 'critical', ts: '2026-06-16 02:17', reason: '模型輸出與白名單規則 WL-089 衝突，8 件高風險 STR 交易遭錯誤清除，超出零漏報紅線，系統自動暫停輸出。', action: '即時暫停 Agent 輸出 · 升級法遵長', result: '人工審查中', operator: 'SYSTEM' },
  { id: 'GL-2026-002', guardrailType: 'Escalation', project: '客服自動化 Agent', sev: 'warning', ts: '2026-06-14 08:45', reason: '人工轉介率連續 3 日超過基準上限 15%（實測 32%），達到升級閾值。', action: '升級通知部門主管', result: '已派工改善', operator: 'SYSTEM' },
  { id: 'GL-2026-001', guardrailType: 'Capability', project: '詐欺偵測 Agent（已下線）', sev: 'critical', ts: '2026-05-28 19:03', reason: '模型對特定族群誤判率超過公平性紅線 2.4 倍，違反反歧視治理原則。', action: '緊急下線 · 全面重訓', result: '已結案 · 重新部署', operator: '陳俊宏' },
  { id: 'GL-2026-000', guardrailType: 'Goal', project: '信用風險評估 Agent', sev: 'info', ts: '2026-05-15 10:22', reason: '風控主管手動覆寫 2 件模型拒絕決定，依規須登錄稽核軌跡備查。', action: '記錄覆寫理由 · 雙人覆核', result: '已結案', operator: '李明宗' },
  { id: 'GL-2025-018', guardrailType: 'Information Isolation', project: '人資分析 Agent（已下線）', sev: 'critical', ts: '2025-11-03 16:22', reason: 'Agent 嘗試存取非授權資料庫（財務薪資系統），違反資訊隔離原則。', action: '立即中止執行 · 安全審查', result: '已結案 · 權限重設', operator: '林資安長' },
];

export const REPORT_HISTORY: ReportHistoryEntry[] = [
  { id: 'RPT-2026-05', title: '2026 年 5 月 Agent 治理月報', date: '2026-06-01', status: '已發布' },
  { id: 'RPT-2026-04', title: '2026 年 4 月 Agent 治理月報', date: '2026-05-01', status: '已發布' },
  { id: 'RPT-2026-03', title: '2026 年 3 月 Agent 治理月報', date: '2026-04-01', status: '已發布' },
  { id: 'RPT-2026-02', title: '2026 年 2 月 Agent 治理月報', date: '2026-03-01', status: '已發布' },
];

export type ProjectStatus = 'normal' | 'watch' | 'red';

export type PhaseState = 'done' | 'active' | 'red' | 'blocked' | 'pending';

export interface Phase {
  stepNum: number;
  name: string;
  subname: string;
  state: PhaseState;
  ts: string;
  summary: string;
}

export type QAType = 'normal' | 'watch' | 'red' | 'review';

export interface QAEntry {
  id: string;
  date: string;
  type: string;
  tstate: QAType;
  status: string;
  sstate: ProjectStatus;
  content: string;
  reviewer: string;
}

export interface Project {
  id: string;
  name: string;
  dept: string;
  owner: string;
  status: ProjectStatus;
  score: number;
  lastUpdated: string;
  description: string;
  hasAuditTrigger: boolean;
  phases: Phase[];
  qa: QAEntry[];
}

export type NotifKind = 'red' | 'watch' | 'info';

export interface Notification {
  id: string;
  projId: string;
  kind: NotifKind;
  title: string;
  ts: string;
  body: string;
}

export type Severity = 'critical' | 'warning' | 'info';

export type GuardrailType =
  | 'Capability'
  | 'Grounding'
  | 'Goal'
  | 'Information Isolation'
  | 'Escalation';

export interface AuditEntry {
  id: string;
  guardrailType: GuardrailType;
  project: string;
  sev: Severity;
  ts: string;
  reason: string;
  action: string;
  result: string;
  operator: string;
}

export interface ReportHistoryEntry {
  id: string;
  title: string;
  date: string;
  status: string;
}

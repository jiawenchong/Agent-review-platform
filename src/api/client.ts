// API client for the FastAPI backend. Override the base URL with
// VITE_API_BASE at build/dev time.
//
// Every endpoint except /api/uploads and /api/users requires an
// `X-User-Id` header (Information Isolation ACL). Real login (P1 on the
// roadmap) isn't built yet, so we keep a "current user" id in
// localStorage and let the user switch identities from the sidebar to
// exercise the ACL — this is an interim stand-in, not a real auth system.
import type { GuardrailType, ProjectStatus } from '../data/types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8010';

const CURRENT_USER_KEY = 'governance.currentUserId';
const DEFAULT_USER_ID = 'U-mgr';

export function getCurrentUserId(): string {
  return localStorage.getItem(CURRENT_USER_KEY) || DEFAULT_USER_ID;
}

export function setCurrentUserId(id: string): void {
  localStorage.setItem(CURRENT_USER_KEY, id);
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-User-Id', getCurrentUserId());
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = `請求失敗(HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── uploads ────────────────────────────────────────────────────────────

export type DocumentStatus = 'parsing' | 'done' | 'failed';

export interface UploadedDocument {
  document_id: number;
  filename: string;
  kind: string | null;
  size_bytes: number;
  uploaded_at: string;
  status: DocumentStatus;
  char_count: number;
  extracted_text: string | null;
  error: string | null;
  llm_verdict: string | null;
  llm_summary: string | null;
  llm_key_points: string[] | null;
  llm_reasons: string[] | null;
  flowchart_mermaid: string | null;
  flowchart_mode: string | null;
  extracted_fields: Record<string, string> | null;
  created_project_id: string | null;
}

export async function uploadDocuments(files: File[]): Promise<UploadedDocument[]> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  return apiFetch<UploadedDocument[]>('/api/uploads', { method: 'POST', body: form });
}

// ── users ──────────────────────────────────────────────────────────────

export interface ApiUser {
  user_id: string;
  name: string;
  is_manager: boolean;
  project_ids: string[];
}

export function listUsers(): Promise<ApiUser[]> {
  return apiFetch<ApiUser[]>('/api/users');
}

// ── projects ───────────────────────────────────────────────────────────

export type ApiProjectStatus = '正常' | '觀察中' | '紅線觸發';

export interface ApiProject {
  project_id: string;
  name: string;
  owner_id: string;
  department: string;
  status: ApiProjectStatus;
  kanban_ref: string | null;
  created_at: string;
  last_update_timestamp: string;
  score: number;
  ai_auto_approval: boolean;
  consecutive_unresolved: number;
  priority_band: string | null;
}

const STATUS_FROM_API: Record<ApiProjectStatus, ProjectStatus> = {
  正常: 'normal',
  觀察中: 'watch',
  紅線觸發: 'red',
};

export function projectStatus(status: ApiProjectStatus): ProjectStatus {
  return STATUS_FROM_API[status];
}

export function listProjects(): Promise<ApiProject[]> {
  return apiFetch<ApiProject[]>('/api/projects');
}

export function getProject(projectId: string): Promise<ApiProject> {
  return apiFetch<ApiProject>(`/api/projects/${projectId}`);
}

export interface ApiSnapshot {
  snapshot_id: number;
  project_id: string;
  scan_time: string;
  progress_value: number;
  is_stalled: boolean;
  days_stalled: number;
}

export function listSnapshots(projectId: string): Promise<ApiSnapshot[]> {
  return apiFetch<ApiSnapshot[]>(`/api/projects/${projectId}/snapshots`);
}

export type ApiLLMVerdict = '合理' | '不合理';

export interface ApiAppeal {
  appeal_id: number;
  project_id: string;
  owner_id: string;
  submitted_at: string;
  content: string;
  llm_verdict: ApiLLMVerdict | null;
  llm_reason: string | null;
  rag_refs: string[] | null;
}

export function listAppeals(projectId: string): Promise<ApiAppeal[]> {
  return apiFetch<ApiAppeal[]>(`/api/projects/${projectId}/appeals`);
}

export function submitAppeal(projectId: string, content: string, ownerId: string): Promise<ApiAppeal> {
  return apiFetch<ApiAppeal>(`/api/projects/${projectId}/appeals`, {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, owner_id: ownerId, content }),
  });
}

// ── notifications ──────────────────────────────────────────────────────

export type ApiNotificationType = '停滯預警' | '升級通知';

export interface ApiNotification {
  notification_id: number;
  project_id: string;
  recipient_id: string;
  type: ApiNotificationType;
  title: string;
  body: string;
  sent_at: string;
  read_at: string | null;
  action_url: string | null;
}

export function listNotifications(unreadOnly = false): Promise<ApiNotification[]> {
  return apiFetch<ApiNotification[]>(`/api/notifications?unread_only=${unreadOnly}`);
}

export function markNotificationRead(notificationId: number): Promise<ApiNotification> {
  return apiFetch<ApiNotification>(`/api/notifications/${notificationId}/read`, { method: 'POST' });
}

// ── guardrail events ───────────────────────────────────────────────────

export interface ApiGuardrailEvent {
  event_id: number;
  project_id: string;
  guardrail_type: GuardrailType | 'Hallucination';
  triggered_at: string;
  detail: string;
  resolution: string | null;
}

export function listGuardrailEvents(guardrailType?: string): Promise<ApiGuardrailEvent[]> {
  const qs = guardrailType ? `?guardrail_type=${encodeURIComponent(guardrailType)}` : '';
  return apiFetch<ApiGuardrailEvent[]>(`/api/guardrail-events${qs}`);
}

// ── reports ────────────────────────────────────────────────────────────

export interface ApiReport {
  report_id: string;
  period: string;
  generated_at: string;
  file_url: string | null;
  generated_by: 'system' | 'manual';
  summary: string | null;
}

export function listReports(): Promise<ApiReport[]> {
  return apiFetch<ApiReport[]>('/api/reports');
}

export function createReport(period?: string): Promise<ApiReport> {
  const qs = period ? `?period=${encodeURIComponent(period)}` : '';
  return apiFetch<ApiReport>(`/api/reports${qs}`, { method: 'POST' });
}

export { API_BASE };

// API client for the Validation Report feature.
// Sessions are ephemeral (in-memory on the backend); all calls are stateless
// from the browser's perspective — session_id is passed on each call.

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
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

export interface CreateSessionResponse {
  session_id: string;
}

export interface ChatResponse {
  response: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface GenerateResponse {
  ready: boolean;
  has_pdf: boolean;
}

/** Structured report data — flat keys matching the PPTX template (see prompt.md). */
export type ReportForm = Record<string, unknown>;

export interface UploadResponse {
  filename: string;
  kind: string;
  char_count: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  document_count: number;
}

export interface CompileResponse {
  data: ReportForm;
}

/** Create a new interview session. Returns the session_id. */
export async function createSession(): Promise<CreateSessionResponse> {
  return apiFetch<CreateSessionResponse>('/api/validation-report/session', {
    method: 'POST',
  });
}

/** Send a user message to the session; returns the assistant reply + full history. */
export async function sendMessage(
  session_id: string,
  message: string,
): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/api/validation-report/chat', {
    method: 'POST',
    body: JSON.stringify({ session_id, message }),
  });
}

/** Upload a source document; the assistant reads + analyses it in the chat. */
export async function uploadDocument(
  session_id: string,
  file: File,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('session_id', session_id);
  form.append('file', file);
  return apiFetch<UploadResponse>('/api/validation-report/upload', {
    method: 'POST',
    body: form,
  });
}

/** Ask the AI to read the conversation + uploaded docs and pre-fill the form. */
export async function compileForm(session_id: string): Promise<CompileResponse> {
  return apiFetch<CompileResponse>('/api/validation-report/compile', {
    method: 'POST',
    body: JSON.stringify({ session_id }),
  });
}

/** Trigger PPTX (and optional PDF) generation.
 *  Pass `form` to generate deterministically from the filled form; omit it to
 *  compile from the conversation + uploaded documents. */
export async function generateReport(
  session_id: string,
  form?: ReportForm,
): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>('/api/validation-report/generate', {
    method: 'POST',
    body: JSON.stringify(form ? { session_id, form } : { session_id }),
  });
}

/** Delete the session and clean up temp files. */
export async function clearSession(session_id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/validation-report/session/${session_id}`, {
    method: 'DELETE',
  });
}

/** URL for the generated PDF preview (used as <iframe src>). */
export function previewUrl(session_id: string): string {
  return `${API_BASE}/api/validation-report/preview/${session_id}`;
}

/** URL for the PPTX download (used as <a href>). */
export function downloadUrl(session_id: string): string {
  return `${API_BASE}/api/validation-report/download/${session_id}`;
}

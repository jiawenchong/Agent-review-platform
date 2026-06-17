// Minimal API client. The base URL points at the FastAPI backend; override
// with VITE_API_BASE at build/dev time. Only the upload feature talks to the
// backend for now — the rest of the app still uses local seed data.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8010';

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
}

export async function uploadDocuments(files: File[]): Promise<UploadedDocument[]> {
  const form = new FormData();
  for (const file of files) form.append('files', file);

  const res = await fetch(`${API_BASE}/api/uploads`, { method: 'POST', body: form });
  if (!res.ok) {
    let detail = `上傳失敗(HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(detail);
  }
  return res.json();
}

export { API_BASE };

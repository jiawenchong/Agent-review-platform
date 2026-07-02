import { useEffect, useRef, useState } from 'react';
import {
  clearSession,
  compileForm,
  createSession,
  downloadUrl,
  generateReport,
  previewUrl,
  uploadDocument,
} from '../api/validationReportClient';
import {
  FORM_GROUPS,
  emptyForm,
  flattenToForm,
  formToPayload,
  type FormField,
} from '../data/validationReportFields';

interface UploadedDoc {
  filename: string;
  char_count: number;
}

// ── Form field renderer ────────────────────────────────────────────────────

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  const isWide = field.type === 'textarea';
  return (
    <div className={`vr-field ${isWide ? 'vr-field--wide' : ''}`}>
      <label className="vr-field-label">
        {field.label}
        {field.help && <span className="vr-field-help">{field.help}</span>}
      </label>
      {field.type === 'textarea' ? (
        <textarea
          className="vr-field-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
        />
      ) : (
        <input
          className="vr-field-input"
          type={field.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export function ValidationReport() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [note, setNote] = useState('');
  const [form, setForm] = useState<Record<string, string>>(emptyForm());

  const [isUploading, setIsUploading] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [hasPdf, setHasPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pdfKey, setPdfKey] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create a session on mount so upload / AI-fill / generate all work.
  useEffect(() => {
    let cancelled = false;
    createSession()
      .then(({ session_id }) => {
        if (!cancelled) setSessionId(session_id);
      })
      .catch(() => {
        if (!cancelled) setError('無法建立工作階段，請重新整理頁面。');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFilePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !sessionId) return;
    setError(null);
    setIsUploading(true);
    try {
      const res = await uploadDocument(sessionId, file);
      setDocs((prev) => [...prev, { filename: res.filename, char_count: res.char_count }]);
      setNotice(`已上傳「${res.filename}」（${res.char_count} 字）。按下方「AI 解讀 → 自動填入表單」讓 AI 擷取內容。`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '文件上傳失敗，請確認格式為 DOCX/PPTX/TXT/MD。');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!sessionId || isCompiling) return;
    setError(null);
    setIsCompiling(true);
    try {
      const { data, llm_available, has_source } = await compileForm(sessionId, note);
      const filled = flattenToForm(data);
      setForm((prev) => {
        const merged = { ...prev };
        for (const [k, v] of Object.entries(filled)) {
          if (v && !merged[k]?.trim()) merged[k] = v;
        }
        return merged;
      });
      const filledCount = Object.values(filled).filter((v) => v.trim()).length;
      if (filledCount > 0) {
        setNotice(
          `AI 已擷取 ${filledCount} 個欄位並填入下方表單（只填空白欄位，不覆蓋你已改的）。請檢查、補齊後生成。`,
        );
      } else if (!has_source) {
        setNotice('還沒有可解讀的內容 — 請先上傳文件，或在上方補充說明欄位輸入資訊，再按此按鈕。');
      } else if (!llm_available) {
        setError(
          'AI 解讀服務未設定（credentials.env 的 COMPANY_VALIDATION_KEY / COMPANY_VALIDATION_AGENT 未填）。' +
            '你仍可手動填寫下方表單後直接生成報告。',
        );
      } else {
        setNotice('AI 這次沒能擷取到可對應的欄位，請在補充說明加上更多細節，或直接手動填寫下方表單。');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI 解讀失敗，請稍後再試。');
    } finally {
      setIsCompiling(false);
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerate = async () => {
    if (!sessionId || isGenerating) return;
    setError(null);
    setIsGenerating(true);
    try {
      const result = await generateReport(sessionId, formToPayload(form));
      if (result.ready) {
        setGenerated(true);
        setHasPdf(result.has_pdf);
        setPdfKey((k) => k + 1);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '報告生成失敗，請稍後再試。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClear = async () => {
    if (sessionId) {
      try {
        await clearSession(sessionId);
      } catch {
        /* ignore */
      }
    }
    setDocs([]);
    setNote('');
    setForm(emptyForm());
    setGenerated(false);
    setHasPdf(false);
    setError(null);
    setNotice(null);
    setIsGenerating(false);
    try {
      const { session_id } = await createSession();
      setSessionId(session_id);
    } catch {
      setSessionId(null);
    }
  };

  const filledCount = Object.values(form).filter((v) => v.trim()).length;

  return (
    <div className="vr-page">
      {/* ── Page Header ── */}
      <div className="page-header vr-page-header">
        <div className="vr-header-left">
          <div className="eyebrow">07 · Validation Report</div>
          <div className="page-title">AI Agent 驗證報告</div>
        </div>
        <div className="vr-header-actions">
          {generated && sessionId && (
            <a
              href={downloadUrl(sessionId)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
              style={{ textDecoration: 'none' }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 12l-4-4h2.5V3h3v5H12L8 12z" />
                <rect x="2" y="13" width="12" height="1.5" rx="0.75" />
              </svg>
              下載 PPTX
            </a>
          )}
          <button className="btn btn-secondary" onClick={handleClear} disabled={isGenerating}>
            清除重來
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={isGenerating || !sessionId}
            title="以下方表單內容生成 PPTX"
          >
            {isGenerating ? (
              <>
                <span className="vr-spinner" />
                生成中…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.5 2h-11A1.5 1.5 0 001 3.5v9A1.5 1.5 0 002.5 14h11a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0013.5 2zM5 11V5l7 3-7 3z" />
                </svg>
                生成報告
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="vr-error-bar">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4h1.5v4.5h-1.5V5zm0 5.5h1.5V12h-1.5v-1.5z" />
          </svg>
          {error}
          <button onClick={() => setError(null)} className="vr-error-dismiss">✕</button>
        </div>
      )}
      {notice && !error && (
        <div className="vr-notice-bar">
          {notice}
          <button onClick={() => setNotice(null)} className="vr-error-dismiss">✕</button>
        </div>
      )}

      {/* ── Two-panel layout: [source + form] | [preview] ── */}
      <div className="vr-body">
        {/* Left: unified source + form */}
        <div className="vr-chat-panel card">
          <div className="vr-form-scroll">
            {/* Step 1 — source (upload + AI note) */}
            <div className="vr-source-box">
              <div className="vr-source-head">
                <span className="vr-step-num">1</span>
                <span className="vr-source-title">上傳報告／來源，讓 AI 幫你填</span>
              </div>
              <div className="vr-source-hint">
                上傳規劃書 / 測試結果 / 會議記錄（DOCX、PPTX、TXT、MD），或在下方補充說明，
                再按「AI 解讀」把內容擷取到表單。這一步可跳過，直接手動填表單也行。
              </div>

              {docs.length > 0 && (
                <div className="vr-doc-chips">
                  {docs.map((d, i) => (
                    <span className="vr-doc-chip" key={i} title={`${d.char_count} 字`}>
                      📄 {d.filename}
                    </span>
                  ))}
                </div>
              )}

              <textarea
                className="vr-field-input vr-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="補充說明（選填）：文件裡沒有、但想讓 AI 一起參考的資訊…"
              />

              <div className="vr-source-actions">
                <button
                  className="btn btn-secondary"
                  onClick={handleFilePick}
                  disabled={isUploading || !sessionId}
                >
                  {isUploading ? <><span className="vr-spinner" /> 上傳中…</> : '📎 上傳文件'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleAnalyze}
                  disabled={isCompiling || !sessionId}
                  title="讓 AI 讀取上傳文件 + 補充說明，自動填入下方表單"
                >
                  {isCompiling ? <><span className="vr-spinner" /> 解讀中…</> : '✨ AI 解讀 → 自動填入表單'}
                </button>
              </div>
            </div>

            {/* Step 2 — the form */}
            <div className="vr-form-head">
              <span className="vr-step-num">2</span>
              <span className="vr-source-title">
                報告內容（可編輯）{filledCount > 0 ? ` · 已填 ${filledCount} 欄` : ''}
              </span>
            </div>
            <div className="vr-form-hint vr-form-hint--block">
              以下就是簡報會用到的內容。AI 填完後在這裡檢查／修改，空欄位在報告中顯示 <code>[待補]</code>。
            </div>

            {FORM_GROUPS.map((group) => (
              <div className="vr-form-group" key={group.title}>
                <div className="vr-form-group-title">{group.title}</div>
                {group.note && <div className="vr-form-group-note">{group.note}</div>}
                <div className="vr-form-grid">
                  {group.fields.map((f) => (
                    <FieldInput
                      key={f.key}
                      field={f}
                      value={form[f.key] ?? ''}
                      onChange={(v) => handleFieldChange(f.key, v)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.pptx,.txt,.md"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {/* Right: Preview */}
        <div className="vr-preview-panel card">
          <div className="vr-chat-header">
            <span className="vr-chat-title">報告預覽</span>
            {generated && <span className="vr-status-badge vr-status-badge--green">已生成</span>}
          </div>

          <div className="vr-preview-body">
            {!generated ? (
              <div className="vr-preview-placeholder">
                <div className="vr-preview-icon">📊</div>
                <div className="vr-preview-text">
                  {isGenerating ? '正在生成驗證報告，請稍候…' : '填寫左側表單後按「生成報告」查看預覽'}
                </div>
                {isGenerating && (
                  <div className="vr-progress-bar">
                    <div className="vr-progress-fill" />
                  </div>
                )}
              </div>
            ) : hasPdf && sessionId ? (
              <iframe
                key={pdfKey}
                src={previewUrl(sessionId)}
                className="vr-pdf-iframe"
                title="驗證報告 PDF 預覽"
              />
            ) : (
              <div className="vr-preview-placeholder">
                <div className="vr-preview-icon">✅</div>
                <div className="vr-preview-text">
                  PPTX 已生成！PDF 預覽不可用（需安裝 LibreOffice）。
                  <br />請使用上方「下載 PPTX」按鈕取得檔案。
                </div>
                {sessionId && (
                  <a
                    href={downloadUrl(sessionId)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary"
                    style={{ marginTop: '16px', textDecoration: 'none' }}
                  >
                    下載 PPTX
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

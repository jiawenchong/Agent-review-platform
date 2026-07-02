import { useEffect, useRef, useState } from 'react';
import {
  clearSession,
  compileForm,
  createSession,
  downloadUrl,
  generateReport,
  previewUrl,
  sendMessage,
  uploadDocument,
} from '../api/validationReportClient';
import {
  FORM_GROUPS,
  emptyForm,
  flattenToForm,
  formToPayload,
  type FormField,
} from '../data/validationReportFields';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface UploadedDoc {
  filename: string;
  char_count: number;
}

type Tab = 'interview' | 'form';

// ── Typing Indicator ──────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="vr-message vr-message--assistant">
      <div className="vr-avatar">AI</div>
      <div className="vr-bubble vr-bubble--assistant vr-typing">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`vr-message ${isUser ? 'vr-message--user' : 'vr-message--assistant'}`}>
      {!isUser && <div className="vr-avatar">AI</div>}
      <div className={`vr-bubble ${isUser ? 'vr-bubble--user' : 'vr-bubble--assistant'}`}>
        {msg.content}
      </div>
      {isUser && <div className="vr-avatar vr-avatar--user">你</div>}
    </div>
  );
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
  const [tab, setTab] = useState<Tab>('form');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [form, setForm] = useState<Record<string, string>>(emptyForm());

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [hasPdf, setHasPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pdfKey, setPdfKey] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create a session on mount so the form + upload work without needing to
  // start a chat first.
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleStartInterview = async () => {
    if (!sessionId) return;
    setError(null);
    setIsLoading(true);
    try {
      const { messages: updated } = await sendMessage(sessionId, '開始');
      setMessages(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '啟動訪談失敗，請稍後再試。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!sessionId || !input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');
    setError(null);
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    try {
      const { messages: updated } = await sendMessage(sessionId, text);
      setMessages(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '傳送失敗，請稍後再試。');
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFilePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file || !sessionId) return;
    setError(null);
    setIsUploading(true);
    setIsLoading(true);
    try {
      const res = await uploadDocument(sessionId, file);
      setDocs((prev) => [...prev, { filename: res.filename, char_count: res.char_count }]);
      setMessages(res.messages);
      setNotice(`已上傳並解讀「${res.filename}」，可在下方對話查看分析，或到「報告表單」按「AI 解讀並填入」。`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '文件上傳失敗，請確認格式為 DOCX/PPTX/TXT/MD。');
    } finally {
      setIsUploading(false);
      setIsLoading(false);
    }
  };

  const handleCompile = async () => {
    if (!sessionId || isCompiling) return;
    setError(null);
    setIsCompiling(true);
    try {
      const { data, llm_available, has_source } = await compileForm(sessionId);
      const filled = flattenToForm(data);
      // Merge: keep anything the user already typed, fill blanks from AI.
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
          `AI 已從對話／文件中擷取 ${filledCount} 個欄位並填入（僅填空白欄位，不覆蓋你已填的）。請檢查後再生成。`,
        );
      } else if (!has_source) {
        setNotice('目前沒有可解讀的來源 — 請先到「訪談 & 上傳文件」上傳文件或進行對話，再回來按此按鈕。');
      } else if (!llm_available) {
        setError(
          'AI 解讀服務未設定（COMPANY_VALIDATION_KEY / COMPANY_VALIDATION_AGENT 未填），' +
            '無法自動擷取欄位。你仍可手動填寫表單後直接生成報告。',
        );
      } else {
        setNotice('AI 這次沒能從內容中擷取到可填入的欄位，請補充更多細節或手動填寫。');
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
    setMessages([]);
    setInput('');
    setDocs([]);
    setForm(emptyForm());
    setGenerated(false);
    setHasPdf(false);
    setError(null);
    setNotice(null);
    setIsLoading(false);
    setIsGenerating(false);
    // fresh session
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
            title="以「報告表單」內容生成 PPTX"
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

      {/* ── Two-panel layout ── */}
      <div className="vr-body">
        {/* Left: Tabs (form / interview) */}
        <div className="vr-chat-panel card">
          <div className="vr-tabs">
            <button
              className={`vr-tab ${tab === 'form' ? 'vr-tab--active' : ''}`}
              onClick={() => setTab('form')}
            >
              報告表單{filledCount > 0 ? ` (${filledCount})` : ''}
            </button>
            <button
              className={`vr-tab ${tab === 'interview' ? 'vr-tab--active' : ''}`}
              onClick={() => setTab('interview')}
            >
              訪談 &amp; 上傳文件{docs.length > 0 ? ` (${docs.length})` : ''}
            </button>
          </div>

          {tab === 'form' ? (
            <>
              <div className="vr-form-toolbar">
                <div className="vr-form-hint">
                  填寫以下欄位後按右上角「生成報告」。空欄位在報告中會顯示 <code>[待補]</code>。
                </div>
                <button
                  className="btn btn-secondary vr-compile-btn"
                  onClick={handleCompile}
                  disabled={isCompiling || !sessionId}
                  title="讓 AI 讀取你上傳的文件 / 訪談內容，自動填入下方表單"
                >
                  {isCompiling ? (
                    <>
                      <span className="vr-spinner" /> 解讀中…
                    </>
                  ) : (
                    '✨ AI 解讀並填入'
                  )}
                </button>
              </div>

              <div className="vr-form-scroll">
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
            </>
          ) : (
            <>
              <div className="vr-messages">
                {messages.length === 0 && !isLoading && (
                  <div className="vr-empty-state">
                    <div className="vr-empty-icon">🎙️</div>
                    <div className="vr-empty-title">上傳文件或開始訪談</div>
                    <div className="vr-empty-desc">
                      上傳規劃書 / 測試結果 / 會議記錄（DOCX、PPTX、TXT、MD），
                      AI 會讀取內容並協助整理；也可以直接對話。完成後到「報告表單」
                      按「AI 解讀並填入」自動帶入欄位。
                    </div>
                    <div className="vr-empty-actions">
                      <button className="btn btn-secondary" onClick={handleFilePick} disabled={isUploading || !sessionId}>
                        📎 上傳文件
                      </button>
                      <button className="btn btn-primary" onClick={handleStartInterview} disabled={isLoading || !sessionId}>
                        開始訪談
                      </button>
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <MessageBubble key={i} msg={msg} />
                ))}
                {isLoading && <TypingIndicator />}
                <div ref={messagesEndRef} />
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

              <div className="vr-input-row">
                <button
                  className="vr-attach-btn"
                  onClick={handleFilePick}
                  disabled={isUploading || !sessionId}
                  title="上傳文件 (DOCX/PPTX/TXT/MD)"
                >
                  {isUploading ? <span className="vr-spinner" /> : '📎'}
                </button>
                <textarea
                  ref={inputRef}
                  className="vr-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="輸入回覆… (Enter 送出, Shift+Enter 換行)"
                  rows={2}
                  disabled={isLoading}
                />
                <button
                  className="btn btn-primary vr-send-btn"
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                >
                  送出
                </button>
              </div>
            </>
          )}

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
                  {isGenerating ? '正在生成驗證報告，請稍候…' : '填寫報告表單後按「生成報告」查看預覽'}
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

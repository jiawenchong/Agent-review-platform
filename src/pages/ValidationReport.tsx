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
  emptyFieldLabels,
  formToPayload,
  mergeCompiled,
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

type RightTab = 'assistant' | 'preview';

// ── Typing indicator + message bubble ──────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="vr-message vr-message--assistant">
      <div className="vr-avatar">AI</div>
      <div className="vr-bubble vr-bubble--assistant vr-typing">
        <span /><span /><span />
      </div>
    </div>
  );
}

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
        <textarea className="vr-field-input" value={value} onChange={(e) => onChange(e.target.value)} rows={2} />
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

// ── Main Component ──────────────────────────────────────────────────────────

export function ValidationReport() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tab, setTab] = useState<RightTab>('assistant');
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
  // Keep a ref to the latest form so async handlers read fresh empty-field labels.
  const formRef = useRef(form);
  formRef.current = form;

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

  const applyCompiled = (data: Record<string, unknown>): number => {
    let filled = 0;
    setForm((prev) => {
      const [merged, count] = mergeCompiled(prev, data);
      filled = count;
      return merged;
    });
    return filled;
  };

  const handleStartInterview = async () => {
    if (!sessionId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await sendMessage(sessionId, '開始', emptyFieldLabels(formRef.current));
      setMessages(res.messages);
      applyCompiled(res.data);
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
      const res = await sendMessage(sessionId, text, emptyFieldLabels(formRef.current));
      setMessages(res.messages);
      const filled = applyCompiled(res.data);
      if (filled > 0) setNotice(`AI 依你的回覆更新了左側表單的 ${filled} 個欄位。`);
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
    e.target.value = '';
    if (!file || !sessionId) return;
    setError(null);
    setIsUploading(true);
    setIsLoading(true);
    try {
      const res = await uploadDocument(sessionId, file);
      setDocs((prev) => [...prev, { filename: res.filename, char_count: res.char_count }]);
      setMessages(res.messages);
      const filled = applyCompiled(res.data);
      setNotice(
        filled > 0
          ? `已讀取「${res.filename}」，AI 自動填入左側表單 ${filled} 個欄位。缺的欄位我會在對話中問你。`
          : `已上傳「${res.filename}」。可在對話中繼續補充，AI 會邊問邊幫你填表單。`,
      );
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
      const filled = applyCompiled(data);
      if (filled > 0) {
        setNotice(`AI 已擷取並填入 ${filled} 個欄位（只填空白，不覆蓋你已改的）。`);
      } else if (!has_source) {
        setNotice('還沒有可解讀的內容 — 請先上傳文件或在對話中提供資訊。');
      } else if (!llm_available) {
        setError('AI 解讀服務未設定（COMPANY_VALIDATION_KEY / COMPANY_VALIDATION_AGENT 未填）。你仍可手動填表單後生成。');
      } else {
        setNotice('AI 這次沒能擷取到新欄位，請在對話中補充更多細節。');
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
        setTab('preview');
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
    setTab('assistant');
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
      {/* ── Header ── */}
      <div className="page-header vr-page-header">
        <div className="vr-header-left">
          <div className="eyebrow">07 · Validation Report</div>
          <div className="page-title">AI Agent 驗證報告</div>
        </div>
        <div className="vr-header-actions">
          {generated && sessionId && (
            <a href={downloadUrl(sessionId)} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
              下載 PPTX
            </a>
          )}
          <button className="btn btn-secondary" onClick={handleClear} disabled={isGenerating}>清除重來</button>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={isGenerating || !sessionId} title="以左側表單內容生成 PPTX">
            {isGenerating ? <><span className="vr-spinner" />生成中…</> : '生成報告'}
          </button>
        </div>
      </div>

      {error && (
        <div className="vr-error-bar">
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

      {/* ── Two-panel: [live form] | [assistant / preview] ── */}
      <div className="vr-body">
        {/* Left: the form (the deliverable), fills live as the AI works */}
        <div className="vr-chat-panel card">
          <div className="vr-chat-header">
            <span className="vr-chat-title">報告內容（可編輯）{filledCount > 0 ? ` · 已填 ${filledCount} 欄` : ''}</span>
          </div>
          <div className="vr-form-hint vr-form-hint--block" style={{ padding: '10px 16px 0' }}>
            右側可上傳文件或跟 AI 對話，AI 會邊問邊把內容填到這裡。空欄位在報告中顯示 <code>[待補]</code>。
          </div>
          <div className="vr-form-scroll">
            {FORM_GROUPS.map((group) => (
              <div className="vr-form-group" key={group.title}>
                <div className="vr-form-group-title">{group.title}</div>
                {group.note && <div className="vr-form-group-note">{group.note}</div>}
                <div className="vr-form-grid">
                  {group.fields.map((f) => (
                    <FieldInput key={f.key} field={f} value={form[f.key] ?? ''} onChange={(v) => handleFieldChange(f.key, v)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: assistant (chat + upload) / preview */}
        <div className="vr-preview-panel card">
          <div className="vr-tabs">
            <button className={`vr-tab ${tab === 'assistant' ? 'vr-tab--active' : ''}`} onClick={() => setTab('assistant')}>
              🎙️ AI 助手{docs.length > 0 ? ` (${docs.length})` : ''}
            </button>
            <button className={`vr-tab ${tab === 'preview' ? 'vr-tab--active' : ''}`} onClick={() => setTab('preview')}>
              📊 報告預覽{generated ? ' ✓' : ''}
            </button>
          </div>

          {tab === 'assistant' ? (
            <>
              <div className="vr-messages">
                {messages.length === 0 && !isLoading && (
                  <div className="vr-empty-state">
                    <div className="vr-empty-icon">🎙️</div>
                    <div className="vr-empty-title">上傳文件或開始訪談</div>
                    <div className="vr-empty-desc">
                      上傳規劃書 / 測試結果（DOCX、PPTX、TXT、MD），AI 會讀取並幫你把內容填進左側表單，
                      再針對還缺的欄位訪談你。防護欄、黃金測試情境你沒提供時 AI 會依 Agent 用途幫你草擬。
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
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {isLoading && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>

              {docs.length > 0 && (
                <div className="vr-doc-chips">
                  {docs.map((d, i) => (
                    <span className="vr-doc-chip" key={i} title={`${d.char_count} 字`}>📄 {d.filename}</span>
                  ))}
                </div>
              )}

              {messages.length > 0 && (
                <div className="vr-assistant-actions">
                  <button className="vr-compile-link" onClick={handleCompile} disabled={isCompiling || !sessionId}>
                    {isCompiling ? '解讀中…' : '↻ 重新整理表單（AI 依目前對話/文件填入）'}
                  </button>
                </div>
              )}

              <div className="vr-input-row">
                <button className="vr-attach-btn" onClick={handleFilePick} disabled={isUploading || !sessionId} title="上傳文件">
                  {isUploading ? <span className="vr-spinner" /> : '📎'}
                </button>
                <textarea
                  ref={inputRef}
                  className="vr-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="回答 AI 的提問，或補充資訊… (Enter 送出)"
                  rows={2}
                  disabled={isLoading}
                />
                <button className="btn btn-primary vr-send-btn" onClick={handleSend} disabled={!input.trim() || isLoading}>
                  送出
                </button>
              </div>
            </>
          ) : (
            <div className="vr-preview-body">
              {!generated ? (
                <div className="vr-preview-placeholder">
                  <div className="vr-preview-icon">📊</div>
                  <div className="vr-preview-text">
                    {isGenerating ? '正在生成驗證報告，請稍候…' : '填好左側表單後按「生成報告」查看預覽'}
                  </div>
                  {isGenerating && <div className="vr-progress-bar"><div className="vr-progress-fill" /></div>}
                </div>
              ) : hasPdf && sessionId ? (
                <iframe key={pdfKey} src={previewUrl(sessionId)} className="vr-pdf-iframe" title="驗證報告 PDF 預覽" />
              ) : (
                <div className="vr-preview-placeholder">
                  <div className="vr-preview-icon">✅</div>
                  <div className="vr-preview-text">
                    PPTX 已生成！PDF 預覽不可用（需安裝 LibreOffice）。<br />請用上方「下載 PPTX」取得檔案。
                  </div>
                  {sessionId && (
                    <a href={downloadUrl(sessionId)} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ marginTop: 16, textDecoration: 'none' }}>
                      下載 PPTX
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept=".docx,.pptx,.txt,.md" style={{ display: 'none' }} onChange={handleFileChange} />
        </div>
      </div>
    </div>
  );
}

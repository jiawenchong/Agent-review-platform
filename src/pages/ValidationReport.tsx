import { useEffect, useRef, useState } from 'react';
import {
  clearSession,
  createSession,
  downloadUrl,
  generateReport,
  previewUrl,
  sendMessage,
} from '../api/validationReportClient';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

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

// ── Main Component ────────────────────────────────────────────────────────

export function ValidationReport() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [hasPdf, setHasPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfKey, setPdfKey] = useState(0); // force iframe reload

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleStartInterview = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { session_id } = await createSession();
      setSessionId(session_id);
      // Kick off conversation with a greeting
      const { messages: updatedMessages } = await sendMessage(session_id, '開始');
      setMessages(updatedMessages);
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

    // Optimistically add user message
    const optimistic: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { messages: updatedMessages } = await sendMessage(sessionId, text);
      setMessages(updatedMessages);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '傳送失敗，請稍後再試。');
      // Remove the optimistic message on error
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

  const handleGenerate = async () => {
    if (!sessionId || isGenerating) return;

    setError(null);
    setIsGenerating(true);
    try {
      const result = await generateReport(sessionId);
      if (result.ready) {
        setGenerated(true);
        setHasPdf(result.has_pdf);
        setPdfKey((k) => k + 1); // force iframe to reload
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
        /* ignore cleanup errors */
      }
    }
    setSessionId(null);
    setMessages([]);
    setInput('');
    setGenerated(false);
    setHasPdf(false);
    setError(null);
    setIsLoading(false);
    setIsGenerating(false);
  };

  const canGenerate = messages.length >= 3 && !isGenerating;
  const hasSession = sessionId !== null;

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
          <button
            className="btn btn-secondary"
            onClick={handleClear}
            disabled={isGenerating}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 3h12v1.5H2V3zm2.5 2.5h7l-.7 8H5.2l-.7-8zm2.75-4V.75h1.5V1.5h3.5V3h-8.5V1.5H7.25z" />
            </svg>
            清除重來
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={!canGenerate || !hasSession}
            title={messages.length < 3 ? '請先進行訪談（至少 3 則訊息）' : ''}
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

      {/* ── Two-panel layout ── */}
      <div className="vr-body">
        {/* Left: Chat */}
        <div className="vr-chat-panel card">
          <div className="vr-chat-header">
            <span className="vr-chat-title">訪談對話</span>
            {hasSession && (
              <span className="vr-session-badge">
                Session {sessionId!.slice(0, 8)}
              </span>
            )}
          </div>

          <div className="vr-messages">
            {!hasSession && !isLoading && (
              <div className="vr-empty-state">
                <div className="vr-empty-icon">🎙️</div>
                <div className="vr-empty-title">開始 AI 驗證報告訪談</div>
                <div className="vr-empty-desc">
                  訪談助手將引導您逐步收集驗證報告所需的資訊，
                  完成後按「生成報告」自動產出 PPTX。
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleStartInterview}
                  disabled={isLoading}
                >
                  開始訪談
                </button>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {hasSession && (
            <div className="vr-input-row">
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
          )}
        </div>

        {/* Right: Preview */}
        <div className="vr-preview-panel card">
          <div className="vr-chat-header">
            <span className="vr-chat-title">報告預覽</span>
            {generated && (
              <span className="vr-status-badge vr-status-badge--green">已生成</span>
            )}
          </div>

          <div className="vr-preview-body">
            {!generated ? (
              <div className="vr-preview-placeholder">
                <div className="vr-preview-icon">📊</div>
                <div className="vr-preview-text">
                  {isGenerating
                    ? '正在生成驗證報告，請稍候…'
                    : '完成訪談後按「生成報告」查看預覽'}
                </div>
                {isGenerating && <div className="vr-progress-bar"><div className="vr-progress-fill" /></div>}
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

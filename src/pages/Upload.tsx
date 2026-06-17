import { useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { uploadDocuments, type UploadedDocument } from '../api/client';

const ACCEPT = '.pdf,.pptx,.docx,.txt,.md';
const ACCEPT_LABEL = 'PDF · PPTX · DOCX';

const VERDICT_STYLE: Record<string, { color: string; bg: string }> = {
  綠燈: { color: 'var(--green-text)', bg: 'var(--green-bg)' },
  紅燈: { color: 'var(--red-text)', bg: 'var(--red-bg)' },
  待補件: { color: 'var(--amber-text)', bg: 'var(--amber-bg)' },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Upload() {
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadedDocument[]>([]);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploading(true);
    setError('');
    try {
      const docs = await uploadDocuments(files);
      // Newest batch on top, keep previous results below.
      setResults((prev) => [...docs, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上傳失敗,請確認後端服務是否啟動。');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 01" title="上傳資料" />
      <div className="page-body">
        <div
          className="upload-dropzone"
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!uploading) void handleFiles(e.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            style={{ display: 'none' }}
            onChange={(e) => void handleFiles(e.target.files)}
          />

          {uploading ? (
            <>
              <div
                style={{
                  width: 32, height: 32, margin: '0 auto 14px',
                  border: '3px solid var(--border-subtle)', borderTopColor: 'var(--text-mid)',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }}
              />
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-heading)', marginBottom: 6 }}>
                正在解析並交由 AI 評審中心判讀…
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>後端正在擷取文字內容</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-heading)', marginBottom: 6 }}>
                拖放或點擊上傳文件(可多選)
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                支援 {ACCEPT_LABEL};不論類型,系統會擷取全文並交由 LLM 判讀
              </div>
            </>
          )}
        </div>

        {error && (
          <div
            className="card"
            style={{ marginTop: 16, padding: '14px 18px', color: 'var(--red-text)', borderColor: 'var(--red-border)' }}
          >
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-heading)', marginBottom: 14 }}>
              解析結果({results.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {results.map((doc) => {
                const failed = doc.status === 'failed';
                const verdictStyle = doc.llm_verdict ? VERDICT_STYLE[doc.llm_verdict] : undefined;
                const isOpen = expanded === doc.document_id;
                return (
                  <div className="card" key={doc.document_id} style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 18 }}>{failed ? '✕' : '✓'}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{doc.filename}</span>
                      {doc.kind && (
                        <span className="chip" style={{ cursor: 'default', textTransform: 'uppercase' }}>
                          {doc.kind}
                        </span>
                      )}
                      <span className="mono-id" style={{ fontSize: 12 }}>{formatSize(doc.size_bytes)}</span>
                      {!failed && (
                        <span className="mono-id" style={{ fontSize: 12 }}>{doc.char_count.toLocaleString()} 字</span>
                      )}
                      {verdictStyle && (
                        <span
                          className="chip"
                          style={{ cursor: 'default', border: 'none', background: verdictStyle.bg, color: verdictStyle.color, marginLeft: 'auto' }}
                        >
                          {doc.llm_verdict}
                        </span>
                      )}
                    </div>

                    {failed ? (
                      <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--red-text)' }}>{doc.error}</p>
                    ) : (
                      <>
                        <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
                          {doc.llm_summary}
                        </p>
                        {doc.llm_reasons && doc.llm_reasons.length > 0 && (
                          <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-dim)' }}>
                            {doc.llm_reasons.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        )}
                        <button
                          className="btn btn-outline"
                          style={{ marginTop: 12 }}
                          onClick={() => setExpanded(isOpen ? null : doc.document_id)}
                        >
                          {isOpen ? '收合擷取全文' : '查看擷取全文'}
                        </button>
                        {isOpen && (
                          <pre
                            style={{
                              marginTop: 12, maxHeight: 280, overflow: 'auto', whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word', fontFamily: 'var(--font-mono)', fontSize: 12,
                              background: 'var(--surface-alt)', border: '1px solid var(--border-subtle)',
                              borderRadius: 10, padding: '12px 14px', color: 'var(--text)',
                            }}
                          >
                            {doc.extracted_text}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Mermaid } from '../components/Mermaid';
import { uploadDocuments } from '../api/client';
import { useUploadResults } from '../context/UploadResultsContext';
import { exportFlowchartToPptx } from '../utils/flowchartExport';

const FIELD_LABELS: Record<string, string> = {
  agent_name: 'Agent 名稱',
  proposer: '提案人',
  department: '部門',
  goal: '目標',
  scope: '範圍',
  timeline: '時程 / 里程碑',
  risk: '風險',
  resource: '資源',
  architecture: '系統架構',
};

const ACCEPT = '.pptx,.docx,.txt,.md';
const ACCEPT_LABEL = 'PPTX · DOCX · TXT';

const VERDICT_STYLE: Record<string, { color: string; bg: string }> = {
  綠燈: { color: 'var(--green-text)', bg: 'var(--green-bg)' },
  紅燈: { color: 'var(--red-text)', bg: 'var(--red-bg)' },
  待補件: { color: 'var(--amber-text)', bg: 'var(--amber-bg)' },
  無法審核: { color: 'var(--gray-text)', bg: 'var(--gray-bg)' },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type FlowTab = 'as_is' | 'to_be';

function parseFlowchart(raw: string | null): { asIs: string | null; toBe: string | null } {
  if (!raw) return { asIs: null, toBe: null };
  try {
    const obj = JSON.parse(raw) as { as_is?: string; to_be?: string };
    if (obj.as_is || obj.to_be) return { asIs: obj.as_is ?? null, toBe: obj.to_be ?? null };
  } catch { /* plain Mermaid string */ }
  return { asIs: null, toBe: raw };
}

export function Upload() {
  const navigate = useNavigate();
  const { results, addResults, clearResults } = useUploadResults();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [flowOpen, setFlowOpen] = useState<number | null>(null);
  const [flowTab, setFlowTab] = useState<Record<number, FlowTab>>({});
  const [exportingFlow, setExportingFlow] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploading(true);
    setError('');
    try {
      const docs = await uploadDocuments(files);
      addResults(docs);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上傳失敗,請確認後端服務是否啟動。');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 01" title="規劃書評估" />
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

        <div
          className="card"
          style={{
            marginTop: 16, padding: '14px 18px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--text-heading)', marginBottom: 2 }}>
              沒有規劃書?先下載範本給提案人填寫
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
              PPT 範本已含必要章節(目標 / 範圍 / 時程 / 風險 / 資源 / 里程碑),填完上傳即可評估。
            </div>
          </div>
          <a
            className="chip"
            href="/agent-blueprint-template.pptx"
            download="AI_Agent_規劃書範本.pptx"
            style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            ⬇ 下載規劃書範本(PPT)
          </a>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-heading)', margin: 0 }}>
                解析結果({results.length})
              </h2>
              <button className="btn btn-outline" onClick={clearResults}>
                清除結果
              </button>
            </div>
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

                        {doc.extracted_fields && Object.keys(doc.extracted_fields).length > 0 && (
                          <div
                            style={{
                              marginTop: 12, padding: '14px 16px', background: 'var(--surface-alt)',
                              border: '1px solid var(--border-subtle)', borderRadius: 10,
                            }}
                          >
                            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
                              擷取的結構化欄位
                            </div>
                            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', margin: 0 }}>
                              {Object.entries(doc.extracted_fields).map(([key, value]) => (
                                <div key={key} style={{ display: 'contents' }}>
                                  <dt style={{ fontSize: 12, color: 'var(--text-mid)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {FIELD_LABELS[key] ?? key}
                                  </dt>
                                  <dd style={{ fontSize: 12.5, color: 'var(--text)', margin: 0 }}>{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        )}

                        {doc.created_project_id && (
                          <div
                            style={{
                              marginTop: 12, padding: '14px 16px', display: 'flex', alignItems: 'center',
                              gap: 12, flexWrap: 'wrap', background: 'var(--green-bg)',
                              border: '1px solid var(--green-border)', borderRadius: 10,
                            }}
                          >
                            <span style={{ color: 'var(--green-text)', fontWeight: 600 }}>
                              ✓ 已自動建立專案
                            </span>
                            <span className="mono-id">{doc.created_project_id}</span>
                            <button
                              className="btn btn-primary"
                              style={{ marginLeft: 'auto', padding: '6px 16px' }}
                              onClick={() => navigate(`/?highlight=${doc.created_project_id}`)}
                            >
                              前往儀表板
                            </button>
                          </div>
                        )}

                        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-outline"
                            onClick={() => setExpanded(isOpen ? null : doc.document_id)}
                          >
                            {isOpen ? '收合擷取全文' : '查看擷取全文'}
                          </button>
                          {doc.flowchart_mermaid && (
                            <button
                              className="btn btn-outline"
                              onClick={() => setFlowOpen(flowOpen === doc.document_id ? null : doc.document_id)}
                            >
                              {flowOpen === doc.document_id ? '收合流程圖' : '查看自動生成流程圖'}
                            </button>
                          )}
                        </div>
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
                        {flowOpen === doc.document_id && doc.flowchart_mermaid && (() => {
                          const { asIs, toBe } = parseFlowchart(doc.flowchart_mermaid);
                          const hasTwoCharts = asIs !== null && toBe !== null;
                          const tab = flowTab[doc.document_id] ?? 'to_be';
                          const activeChart = hasTwoCharts ? (tab === 'as_is' ? asIs : toBe) : (toBe ?? asIs ?? '');
                          const modeLabel =
                            doc.flowchart_mode === 'structured+llm' ? '結構化 TO BE + AI 推斷 AS IS'
                            : doc.flowchart_mode === 'llm' ? 'AI 自動推斷'
                            : doc.flowchart_mode === 'structured' ? '結構化解析'
                            : '依章節推斷';
                          const exportKey = doc.document_id;
                          const isExporting = exportingFlow === exportKey;
                          const handleExport = async () => {
                            setExportingFlow(exportKey);
                            try {
                              await exportFlowchartToPptx({
                                chart: activeChart,
                                title: hasTwoCharts ? (tab === 'as_is' ? 'AS IS 現況流程' : 'TO BE 目標流程') : '自動生成流程圖',
                                subtitle: doc.filename,
                                fileName: `${doc.filename.replace(/\.[^.]+$/, '')}_${hasTwoCharts ? (tab === 'as_is' ? 'ASIS' : 'TOBE') : 'flowchart'}.pptx`,
                              });
                            } catch (e) {
                              setError(e instanceof Error ? e.message : '流程圖匯出失敗');
                            } finally {
                              setExportingFlow(null);
                            }
                          };
                          return (
                            <div style={{ marginTop: 12, padding: '16px', background: '#000000', border: '1px solid #333333', borderRadius: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, color: '#888888', fontFamily: 'var(--font-mono)' }}>
                                  生成模式:{modeLabel}
                                </span>
                                <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
                                  {hasTwoCharts && (
                                    <>
                                      <button
                                        style={{
                                          padding: '4px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                                          border: '1px solid #d4a017',
                                          background: tab === 'as_is' ? '#d4a017' : 'transparent',
                                          color: tab === 'as_is' ? '#000' : '#d4a017',
                                          fontFamily: '"Microsoft YaHei", "Noto Sans TC", sans-serif',
                                          fontWeight: 700,
                                        }}
                                        onClick={() => setFlowTab(prev => ({ ...prev, [doc.document_id]: 'as_is' }))}
                                      >
                                        AS IS 現況
                                      </button>
                                      <button
                                        style={{
                                          padding: '4px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                                          border: '1px solid #d4a017',
                                          background: tab === 'to_be' ? '#d4a017' : 'transparent',
                                          color: tab === 'to_be' ? '#000' : '#d4a017',
                                          fontFamily: '"Microsoft YaHei", "Noto Sans TC", sans-serif',
                                          fontWeight: 700,
                                        }}
                                        onClick={() => setFlowTab(prev => ({ ...prev, [doc.document_id]: 'to_be' }))}
                                      >
                                        TO BE 目標
                                      </button>
                                    </>
                                  )}
                                  <button
                                    style={{
                                      padding: '4px 14px', fontSize: 12, borderRadius: 6, cursor: isExporting ? 'default' : 'pointer',
                                      border: '1px solid #666666', background: 'transparent', color: '#cccccc',
                                      fontFamily: '"Microsoft YaHei", "Noto Sans TC", sans-serif', fontWeight: 700,
                                      opacity: isExporting ? 0.6 : 1,
                                    }}
                                    disabled={isExporting}
                                    onClick={() => void handleExport()}
                                  >
                                    {isExporting ? '匯出中…' : '⬇ 下載 PPT'}
                                  </button>
                                </div>
                              </div>
                              <Mermaid chart={activeChart} />
                            </div>
                          );
                        })()}
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

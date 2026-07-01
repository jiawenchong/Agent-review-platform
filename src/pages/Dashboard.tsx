import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { scoreColor, VERDICT_STYLE } from '../data/styleMaps';
import type { ProjectStatus } from '../data/types';
import {
  getHealth,
  listAllAppeals,
  listDocuments,
  listGuardrailEvents,
  listProjects,
  listUsers,
  projectStatus,
  type ApiAppeal,
  type ApiDocumentSummary,
  type ApiGuardrailEvent,
  type ApiHealth,
  type ApiProject,
  type ApiUser,
} from '../api/client';

const STATUS_FILTERS: { key: ProjectStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'normal', label: '正常' },
  { key: 'watch', label: '觀察中' },
  { key: 'red', label: '紅線觸發' },
];

const VERDICT_ORDER = ['綠燈', '紅燈', '待補件', '無法審核'];

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface TimelineItem {
  time: string;
  icon: string;
  label: string;
  detail: string;
  onClick?: () => void;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get('highlight');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [documents, setDocuments] = useState<ApiDocumentSummary[]>([]);
  const [guardrailEvents, setGuardrailEvents] = useState<ApiGuardrailEvent[]>([]);
  const [appeals, setAppeals] = useState<ApiAppeal[]>([]);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listProjects(),
      listUsers(),
      listDocuments(),
      listGuardrailEvents(),
      listAllAppeals(),
      getHealth(),
    ])
      .then(([projs, us, docs, events, appealList, healthInfo]) => {
        if (cancelled) return;
        setProjects(projs);
        setUsers(us);
        setDocuments(docs);
        setGuardrailEvents(events);
        setAppeals(appealList);
        setHealth(healthInfo);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '讀取專案列表失敗,請確認後端服務是否啟動。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ownerName = useMemo(() => {
    const map = new Map(users.map((u) => [u.user_id, u.name]));
    return (id: string) => map.get(id) ?? id;
  }, [users]);

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.project_id, p.name]));
    return (id: string) => map.get(id) ?? id;
  }, [projects]);

  const kpis = useMemo(() => {
    const total = projects.length;
    const normal = projects.filter((p) => projectStatus(p.status) === 'normal').length;
    const watch = projects.filter((p) => projectStatus(p.status) === 'watch').length;
    const red = projects.filter((p) => projectStatus(p.status) === 'red').length;
    return { total, normal, watch, red };
  }, [projects]);

  const evalStats = useMemo(() => {
    const total = documents.length;
    const byVerdict: Record<string, number> = {};
    for (const d of documents) {
      if (!d.llm_verdict) continue;
      byVerdict[d.llm_verdict] = (byVerdict[d.llm_verdict] ?? 0) + 1;
    }
    const createdProjects = documents.filter((d) => d.created_project_id).length;
    return { total, byVerdict, createdProjects };
  }, [documents]);

  const guardrailStats = useMemo(() => {
    const total = guardrailEvents.length;
    const unresolved = guardrailEvents.filter((e) => !e.resolution).length;
    const byType: Record<string, number> = {};
    for (const e of guardrailEvents) {
      byType[e.guardrail_type] = (byType[e.guardrail_type] ?? 0) + 1;
    }
    const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { total, unresolved, topTypes };
  }, [guardrailEvents]);

  const scoreStats = useMemo(() => {
    if (projects.length === 0) return { avg: 0, high: 0, mid: 0, low: 0 };
    const avg = Math.round(projects.reduce((sum, p) => sum + p.score, 0) / projects.length);
    const high = projects.filter((p) => p.score >= 80).length;
    const mid = projects.filter((p) => p.score >= 55 && p.score < 80).length;
    const low = projects.filter((p) => p.score < 55).length;
    return { avg, high, mid, low };
  }, [projects]);

  const appealStats = useMemo(() => {
    const total = appeals.length;
    const pending = appeals.filter((a) => !a.llm_verdict);
    return { total, pending };
  }, [appeals]);

  const escalatedCount = useMemo(
    () => projects.filter((p) => !p.ai_auto_approval).length,
    [projects],
  );

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];
    for (const p of projects) {
      items.push({
        time: p.created_at,
        icon: '📁',
        label: `建立專案「${p.name}」`,
        detail: p.department,
        onClick: () => navigate(`/projects/${p.project_id}`),
      });
    }
    for (const d of documents) {
      if (!d.llm_verdict) continue;
      items.push({
        time: d.uploaded_at,
        icon: '📄',
        label: `規劃書評估:${d.filename}`,
        detail: d.llm_verdict,
      });
    }
    for (const e of guardrailEvents) {
      items.push({
        time: e.triggered_at,
        icon: '🚩',
        label: `${e.guardrail_type} 紅線觸發`,
        detail: e.detail.length > 60 ? `${e.detail.slice(0, 60)}…` : e.detail,
        onClick: () => navigate('/audit'),
      });
    }
    return items.sort((a, b) => (a.time < b.time ? 1 : -1)).slice(0, 8);
  }, [projects, documents, guardrailEvents, navigate]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const status = projectStatus(p.status);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      const owner = ownerName(p.owner_id);
      if (query && !p.name.includes(query) && !p.department.includes(query) && !owner.includes(query)) return false;
      return true;
    });
  }, [projects, query, statusFilter, ownerName]);

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 02" title="專案儀表板" />
      <div className="page-body">
        {error && (
          <div className="card" style={{ marginBottom: 16, padding: '14px 18px', color: 'var(--red-text)', borderColor: 'var(--red-border)' }}>
            {error}
          </div>
        )}

        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">總專案數</div>
            <div className="kpi-value">{kpis.total}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">正常</div>
            <div className="kpi-value" style={{ color: 'var(--green-text)' }}>{kpis.normal}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">觀察中</div>
            <div className="kpi-value" style={{ color: 'var(--amber-text)' }}>{kpis.watch}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">紅線觸發</div>
            <div className="kpi-value" style={{ color: 'var(--red-text)' }}>{kpis.red}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 16, marginBottom: 16 }}>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--text-heading)' }}>
                規劃書評估總覽
              </div>
              <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 12.5 }} onClick={() => navigate('/upload')}>
                前往規劃書評估
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-heading)' }}>{evalStats.total}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>份規劃書已評估</span>
            </div>
            {evalStats.total === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>尚無任何評估紀錄。</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {VERDICT_ORDER.filter((v) => evalStats.byVerdict[v]).map((verdict) => (
                  <span
                    key={verdict}
                    className="chip"
                    style={{ cursor: 'default', border: 'none', background: VERDICT_STYLE[verdict].bg, color: VERDICT_STYLE[verdict].color }}
                  >
                    {verdict} {evalStats.byVerdict[verdict]}
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
              已自動建立專案:<strong style={{ color: 'var(--text-heading)' }}>{evalStats.createdProjects}</strong> 份(綠燈且含 Agent 名稱)
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--text-heading)' }}>
                紅線稽核摘要
              </div>
              <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 12.5 }} onClick={() => navigate('/audit')}>
                前往稽核紀錄
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 12 }}>
              <div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-heading)' }}>{guardrailStats.total}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-dim)', marginLeft: 6 }}>總觸發次數</span>
              </div>
              <div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: guardrailStats.unresolved > 0 ? 'var(--red-text)' : 'var(--green-text)' }}>
                  {guardrailStats.unresolved}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--text-dim)', marginLeft: 6 }}>未解決</span>
              </div>
            </div>
            {guardrailStats.total === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>尚無紅線事件觸發紀錄。</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {guardrailStats.topTypes.map(([type, count]) => (
                  <span key={type} className="chip" style={{ cursor: 'default' }}>
                    {type} {count}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--text-heading)', marginBottom: 12 }}>
              平均治理分數
            </div>
            {projects.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>尚無專案可計算分數。</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: scoreColor(scoreStats.avg) }}>{scoreStats.avg}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>/ 100(所有專案平均)</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="chip" style={{ cursor: 'default', border: 'none', background: 'var(--green-bg)', color: 'var(--green-text)' }}>
                    ≥80 分 {scoreStats.high}
                  </span>
                  <span className="chip" style={{ cursor: 'default', border: 'none', background: 'var(--amber-bg)', color: 'var(--amber-text)' }}>
                    55–79 分 {scoreStats.mid}
                  </span>
                  <span className="chip" style={{ cursor: 'default', border: 'none', background: 'var(--red-bg)', color: 'var(--red-text)' }}>
                    &lt;55 分 {scoreStats.low}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--text-heading)' }}>
                待處理申訴
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 12 }}>
              <div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: appealStats.pending.length > 0 ? 'var(--amber-text)' : 'var(--green-text)' }}>
                  {appealStats.pending.length}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--text-dim)', marginLeft: 6 }}>筆待 LLM 判讀</span>
              </div>
              <div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-heading)' }}>{appealStats.total}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-dim)', marginLeft: 6 }}>總申訴數</span>
              </div>
            </div>
            {appealStats.pending.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>沒有待處理的申訴。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {appealStats.pending.slice(0, 3).map((a) => (
                  <div
                    key={a.appeal_id}
                    style={{ fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}
                    onClick={() => navigate(`/projects/${a.project_id}`)}
                  >
                    <span className="mono-id" style={{ marginRight: 6 }}>{a.project_id}</span>
                    {projectName(a.project_id)}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--text-heading)', marginBottom: 12 }}>
              Closed-Loop 巡查狀態
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', margin: 0, fontSize: 12.5 }}>
              <dt style={{ color: 'var(--text-dim)' }}>下次自動巡查</dt>
              <dd style={{ margin: 0, color: 'var(--text-heading)', fontWeight: 600 }}>
                {health?.next_scan_at ? formatDateTime(health.next_scan_at) : '排程未啟動'}
              </dd>
              <dt style={{ color: 'var(--text-dim)' }}>巡查頻率</dt>
              <dd style={{ margin: 0 }}>每 {health?.scan_interval_days ?? '—'} 天</dd>
              <dt style={{ color: 'var(--text-dim)' }}>停滯判定門檻</dt>
              <dd style={{ margin: 0 }}>{health?.stall_threshold_days ?? '—'} 天無進度</dd>
              <dt style={{ color: 'var(--text-dim)' }}>已強制升級</dt>
              <dd style={{ margin: 0, color: escalatedCount > 0 ? 'var(--red-text)' : 'var(--text)', fontWeight: escalatedCount > 0 ? 600 : 400 }}>
                {escalatedCount} 個專案(已停用 AI 自動核准)
              </dd>
            </dl>
          </div>

          <div className="card" style={{ padding: '16px 20px', gridColumn: '1 / -1' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--text-heading)', marginBottom: 12 }}>
              近期活動時間軸
            </div>
            {timeline.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>尚無活動紀錄。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {timeline.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5,
                      cursor: item.onClick ? 'pointer' : 'default',
                    }}
                    onClick={item.onClick}
                  >
                    <span style={{ fontSize: 14 }}>{item.icon}</span>
                    <span className="mono-id" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(item.time)}</span>
                    <span style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{item.label}</span>
                    <span style={{ color: 'var(--text-dim)' }}>{item.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="toolbar">
          <div className="toolbar-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="search-input"
              placeholder="搜尋專案名稱、部門或負責人"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip${statusFilter === f.key ? ' active' : ''}`}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>編號</th>
                <th>專案名稱</th>
                <th>部門</th>
                <th>負責人</th>
                <th>狀態</th>
                <th>評分</th>
                <th>最後更新</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.project_id}
                  className="table-row"
                  onClick={() => navigate(`/projects/${p.project_id}`)}
                  style={p.project_id === highlight ? { background: 'var(--green-bg)' } : undefined}
                >
                  <td><span className="mono-id">{p.project_id}</span></td>
                  <td>{p.name}</td>
                  <td>{p.department}</td>
                  <td>{ownerName(p.owner_id)}</td>
                  <td><StatusPill status={projectStatus(p.status)} /></td>
                  <td style={{ color: scoreColor(p.score), fontWeight: 600 }}>{p.score}</td>
                  <td><span className="mono-id">{formatDate(p.last_update_timestamp)}</span></td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">沒有符合條件的專案</div>
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">載入中…</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

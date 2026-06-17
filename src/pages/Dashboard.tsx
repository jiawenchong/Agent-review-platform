import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { scoreColor } from '../data/styleMaps';
import type { ProjectStatus } from '../data/types';
import { listProjects, listUsers, projectStatus, type ApiProject, type ApiUser } from '../api/client';

const STATUS_FILTERS: { key: ProjectStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'normal', label: '正常' },
  { key: 'watch', label: '觀察中' },
  { key: 'red', label: '紅線觸發' },
];

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get('highlight');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([listProjects(), listUsers()])
      .then(([projs, us]) => {
        if (cancelled) return;
        setProjects(projs);
        setUsers(us);
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

  const kpis = useMemo(() => {
    const total = projects.length;
    const normal = projects.filter((p) => projectStatus(p.status) === 'normal').length;
    const watch = projects.filter((p) => projectStatus(p.status) === 'watch').length;
    const red = projects.filter((p) => projectStatus(p.status) === 'red').length;
    return { total, normal, watch, red };
  }, [projects]);

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

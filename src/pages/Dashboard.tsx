import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { PROJECTS } from '../data/seed';
import { scoreColor } from '../data/styleMaps';
import type { ProjectStatus } from '../data/types';

const STATUS_FILTERS: { key: ProjectStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'normal', label: '正常' },
  { key: 'watch', label: '觀察中' },
  { key: 'red', label: '紅線觸發' },
];

export function Dashboard() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');

  const kpis = useMemo(() => {
    const total = PROJECTS.length;
    const normal = PROJECTS.filter((p) => p.status === 'normal').length;
    const watch = PROJECTS.filter((p) => p.status === 'watch').length;
    const red = PROJECTS.filter((p) => p.status === 'red').length;
    return { total, normal, watch, red };
  }, []);

  const filtered = useMemo(() => {
    return PROJECTS.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (query && !p.name.includes(query) && !p.dept.includes(query) && !p.owner.includes(query)) return false;
      return true;
    });
  }, [query, statusFilter]);

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 02" title="專案儀表板" />
      <div className="page-body">
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
                <tr key={p.id} className="table-row" onClick={() => navigate(`/projects/${p.id}`)}>
                  <td><span className="mono-id">{p.id}</span></td>
                  <td>{p.name}</td>
                  <td>{p.dept}</td>
                  <td>{p.owner}</td>
                  <td><StatusPill status={p.status} /></td>
                  <td style={{ color: scoreColor(p.score), fontWeight: 600 }}>{p.score}</td>
                  <td><span className="mono-id">{p.lastUpdated}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">沒有符合條件的專案</div>
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

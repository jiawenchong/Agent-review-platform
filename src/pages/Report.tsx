import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { createReport, listProjects, listReports, projectStatus, type ApiProject, type ApiReport } from '../api/client';

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export function Report() {
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([listProjects(), listReports()])
      .then(([projs, reps]) => {
        if (cancelled) return;
        setProjects(projs);
        setReports(reps);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '讀取報告失敗');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const kpis = useMemo(() => {
    const total = projects.length;
    const normal = projects.filter((p) => projectStatus(p.status) === 'normal').length;
    const watch = projects.filter((p) => projectStatus(p.status) === 'watch').length;
    const red = projects.filter((p) => projectStatus(p.status) === 'red').length;
    const avgScore = total === 0 ? 0 : Math.round(projects.reduce((sum, p) => sum + p.score, 0) / total);
    return { total, normal, watch, red, avgScore };
  }, [projects]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const report = await createReport();
      setReports((prev) => [report, ...prev.filter((r) => r.report_id !== report.report_id)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '產出報告失敗');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 05" title="治理月報">
        <button className="btn btn-primary" disabled={generating} onClick={handleGenerate}>
          {generating ? '產出中…' : '產出本月報告'}
        </button>
      </PageHeader>
      <div className="page-body">
        {error && (
          <div className="card" style={{ marginBottom: 16, padding: '14px 18px', color: 'var(--red-text)', borderColor: 'var(--red-border)' }}>
            {error}
          </div>
        )}

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-heading)', marginBottom: 14 }}>
          本期概況
        </h2>
        <div className="kpi-grid" style={{ marginBottom: 28 }}>
          <div className="kpi-card">
            <div className="kpi-label">追蹤專案數</div>
            <div className="kpi-value">{kpis.total}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">平均治理評分</div>
            <div className="kpi-value">{kpis.avgScore}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">觀察中專案</div>
            <div className="kpi-value" style={{ color: 'var(--amber-text)' }}>{kpis.watch}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">紅線觸發專案</div>
            <div className="kpi-value" style={{ color: 'var(--red-text)' }}>{kpis.red}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px 24px', marginBottom: 28 }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 14.5, color: 'var(--text-heading)', marginBottom: 10 }}>
            摘要
          </h3>
          <p style={{ lineHeight: 1.7, color: 'var(--text)' }}>
            {loading
              ? '載入中…'
              : `目前共追蹤 ${kpis.total} 個 Agent 專案,${kpis.normal} 項維持正常運作,${kpis.watch} 項進入觀察狀態,` +
                `${kpis.red} 項觸發紅線並已依程序升級處理。整體治理評分平均為 ${kpis.avgScore} 分,建議持續關注觀察中專案的指標變化。`}
          </p>
        </div>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-heading)', marginBottom: 14 }}>
          歷史報告
        </h2>
        <div className="card" style={{ overflow: 'hidden' }}>
          {reports.map((r) => (
            <div
              key={r.report_id}
              className="report-row"
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px',
                borderBottom: '1px solid var(--border-soft)',
              }}
            >
              <span className="mono-id">{r.report_id}</span>
              <span style={{ flex: 1 }}>{r.summary ?? `${r.period} Agent 治理月報`}</span>
              <span className="mono-id">{formatDate(r.generated_at)}</span>
              <span className="chip" style={{ cursor: 'default' }}>{r.generated_by === 'manual' ? '手動產生' : '系統產生'}</span>
            </div>
          ))}
          {!loading && reports.length === 0 && <div className="empty-state">尚無歷史報告</div>}
        </div>
      </div>
    </>
  );
}

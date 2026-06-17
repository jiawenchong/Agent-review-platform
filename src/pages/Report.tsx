import { PageHeader } from '../components/PageHeader';
import { PROJECTS, REPORT_HISTORY } from '../data/seed';

export function Report() {
  const total = PROJECTS.length;
  const normal = PROJECTS.filter((p) => p.status === 'normal').length;
  const watch = PROJECTS.filter((p) => p.status === 'watch').length;
  const red = PROJECTS.filter((p) => p.status === 'red').length;
  const avgScore = Math.round(PROJECTS.reduce((sum, p) => sum + p.score, 0) / total);

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 05" title="治理月報">
        <button className="btn btn-primary">產出本月報告</button>
      </PageHeader>
      <div className="page-body">
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-heading)', marginBottom: 14 }}>
          2026 年 6 月 概況
        </h2>
        <div className="kpi-grid" style={{ marginBottom: 28 }}>
          <div className="kpi-card">
            <div className="kpi-label">追蹤專案數</div>
            <div className="kpi-value">{total}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">平均治理評分</div>
            <div className="kpi-value">{avgScore}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">觀察中專案</div>
            <div className="kpi-value" style={{ color: 'var(--amber-text)' }}>{watch}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">紅線觸發專案</div>
            <div className="kpi-value" style={{ color: 'var(--red-text)' }}>{red}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px 24px', marginBottom: 28 }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 14.5, color: 'var(--text-heading)', marginBottom: 10 }}>
            摘要
          </h3>
          <p style={{ lineHeight: 1.7, color: 'var(--text)' }}>
            本月共追蹤 {total} 個 Agent 專案，{normal} 項維持正常運作，{watch} 項進入觀察狀態，
            {red} 項觸發紅線並已依程序升級處理。整體治理評分平均為 {avgScore} 分，建議持續關注觀察中專案的指標變化。
          </p>
        </div>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-heading)', marginBottom: 14 }}>
          歷史報告
        </h2>
        <div className="card" style={{ overflow: 'hidden' }}>
          {REPORT_HISTORY.map((r) => (
            <div
              key={r.id}
              className="report-row"
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px',
                borderBottom: '1px solid var(--border-soft)',
              }}
            >
              <span className="mono-id">{r.id}</span>
              <span style={{ flex: 1 }}>{r.title}</span>
              <span className="mono-id">{r.date}</span>
              <span className="chip" style={{ cursor: 'default' }}>{r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

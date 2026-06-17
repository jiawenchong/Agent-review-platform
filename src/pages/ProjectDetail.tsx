import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { scoreColor } from '../data/styleMaps';
import {
  getCurrentUserId,
  getProject,
  listAppeals,
  listSnapshots,
  listUsers,
  projectStatus,
  submitAppeal,
  type ApiAppeal,
  type ApiProject,
  type ApiSnapshot,
  type ApiUser,
} from '../api/client';

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false });
}

const VERDICT_STYLE: Record<string, { color: string; bg: string }> = {
  合理: { color: 'var(--green-text)', bg: 'var(--green-bg)' },
  不合理: { color: 'var(--red-text)', bg: 'var(--red-bg)' },
};

const SECTION_TITLE_STYLE = {
  fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-heading)', marginBottom: 14,
} as const;

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ApiProject | null>(null);
  const [snapshots, setSnapshots] = useState<ApiSnapshot[]>([]);
  const [appeals, setAppeals] = useState<ApiAppeal[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appealText, setAppealText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([getProject(id), listSnapshots(id), listAppeals(id), listUsers()])
      .then(([proj, snaps, apps, us]) => {
        if (cancelled) return;
        setProject(proj);
        setSnapshots(snaps);
        setAppeals(apps);
        setUsers(us);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '讀取專案詳情失敗');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const ownerName = (uid: string) => users.find((u) => u.user_id === uid)?.name ?? uid;

  const handleSubmitAppeal = async () => {
    if (!id || !appealText.trim()) return;
    setSubmitting(true);
    try {
      const appeal = await submitAppeal(id, appealText.trim(), getCurrentUserId());
      setAppeals((prev) => [appeal, ...prev]);
      setAppealText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交申訴失敗');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Governance Platform · 03" title="專案詳情" />
        <div className="page-body"><div className="empty-state">載入中…</div></div>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <PageHeader eyebrow="Governance Platform · 03" title="專案詳情" />
        <div className="page-body">
          <div className="empty-state">{error || `找不到專案 ${id}`}</div>
        </div>
      </>
    );
  }

  const status = projectStatus(project.status);

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 03" title={project.name}>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>返回儀表板</button>
      </PageHeader>
      <div className="page-body">
        {error && (
          <div className="card" style={{ marginBottom: 16, padding: '14px 18px', color: 'var(--red-text)', borderColor: 'var(--red-border)' }}>
            {error}
          </div>
        )}

        <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="mono-id">{project.project_id}</span>
              <StatusPill status={status} />
              {project.priority_band && <span className="chip" style={{ cursor: 'default' }}>優先級 {project.priority_band}</span>}
              {!project.ai_auto_approval && <span className="chip-red">AI 自動核准已停用</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 700, color: scoreColor(project.score) }}>
              {project.score}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 12.5, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
            <span>部門：{project.department}</span>
            <span>負責人：{ownerName(project.owner_id)}</span>
            <span>最後更新：<span className="mono-id">{formatTs(project.last_update_timestamp)}</span></span>
            {project.kanban_ref && <span>KANBAN：<span className="mono-id">{project.kanban_ref}</span></span>}
            {project.consecutive_unresolved > 0 && <span>連續未解決輪數：{project.consecutive_unresolved}</span>}
          </div>
          {status === 'red' && (
            <div style={{ marginTop: 16 }}>
              <button className="chip-red" onClick={() => navigate('/audit')}>查看紅線稽核紀錄</button>
            </div>
          )}
        </div>

        <h2 style={SECTION_TITLE_STYLE}>Closed Loop 進度快照</h2>
        <div className="card" style={{ padding: '24px 28px', marginBottom: 28 }}>
          {snapshots.length === 0 ? (
            <div className="empty-state">尚無掃描紀錄</div>
          ) : (
            <div className="timeline">
              {snapshots.slice().reverse().map((snap, i, arr) => (
                <Fragment key={snap.snapshot_id}>
                  <div className="timeline-step">
                    <div
                      className="timeline-icon"
                      style={{
                        background: snap.is_stalled ? 'var(--red-bg)' : 'var(--green-bg)',
                        color: snap.is_stalled ? 'var(--red-text)' : 'var(--green-text)',
                      }}
                    >
                      {snap.is_stalled ? '!' : '✓'}
                    </div>
                    <div className="timeline-num">SCAN #{snap.snapshot_id}</div>
                    <div className="timeline-name">{snap.is_stalled ? '停滯' : '正常推進'}</div>
                    <div className="timeline-subname">進度 {snap.progress_value.toFixed(0)}%</div>
                    <div className="timeline-summary">{snap.is_stalled ? `已停滯 ${snap.days_stalled} 天` : '無停滯'}</div>
                    <div className="timeline-ts">{formatTs(snap.scan_time)}</div>
                  </div>
                  {i < arr.length - 1 && <div className="timeline-connector" />}
                </Fragment>
              ))}
            </div>
          )}
        </div>

        <h2 style={SECTION_TITLE_STYLE}>Q&amp;A / 申訴歷程</h2>
        <div className="card" style={{ padding: '18px 22px', marginBottom: 20 }}>
          <textarea
            className="search-input"
            style={{ width: '100%', minHeight: 80, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 13, padding: 10 }}
            placeholder="輸入申訴內容…"
            value={appealText}
            onChange={(e) => setAppealText(e.target.value)}
          />
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={!appealText.trim() || submitting} onClick={handleSubmitAppeal}>
              {submitting ? '提交中…' : '提交申訴'}
            </button>
          </div>
        </div>

        {appeals.length === 0 ? (
          <div className="card"><div className="empty-state">尚無 Q&amp;A 紀錄</div></div>
        ) : (
          appeals.map((qa) => {
            const vstyle = qa.llm_verdict ? VERDICT_STYLE[qa.llm_verdict] : undefined;
            return (
              <div className="qa-card" key={qa.appeal_id}>
                <div className="qa-card-head">
                  <span className="mono-id">APPEAL-{qa.appeal_id}</span>
                  {vstyle && qa.llm_verdict ? (
                    <span className="chip" style={{ background: vstyle.bg, color: vstyle.color, cursor: 'default', border: 'none' }}>
                      {qa.llm_verdict}
                    </span>
                  ) : (
                    <span className="chip" style={{ cursor: 'default' }}>待評估</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>{ownerName(qa.owner_id)}</span>
                </div>
                <p style={{ lineHeight: 1.65, marginBottom: 8 }}>{qa.content}</p>
                {qa.llm_reason && (
                  <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>LLM 評估：{qa.llm_reason}</p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 12, color: 'var(--text-dim)' }}>
                  <span className="mono-id">{formatTs(qa.submitted_at)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

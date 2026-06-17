import { Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { PROJECTS } from '../data/seed';
import { PHASE, QA_TYPE, scoreColor } from '../data/styleMaps';

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = PROJECTS.find((p) => p.id === id);

  if (!project) {
    return (
      <>
        <PageHeader eyebrow="Governance Platform · 03" title="專案詳情" />
        <div className="page-body">
          <div className="empty-state">找不到專案 {id}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 03" title={project.name}>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>返回儀表板</button>
      </PageHeader>
      <div className="page-body">
        <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="mono-id">{project.id}</span>
              <StatusPill status={project.status} />
            </div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 700, color: scoreColor(project.score) }}>
              {project.score}
            </div>
          </div>
          <p style={{ color: 'var(--text)', lineHeight: 1.7, marginBottom: 14 }}>{project.description}</p>
          <div style={{ display: 'flex', gap: 24, fontSize: 12.5, color: 'var(--text-dim)' }}>
            <span>部門：{project.dept}</span>
            <span>負責人：{project.owner}</span>
            <span>最後更新：<span className="mono-id">{project.lastUpdated}</span></span>
          </div>
          {project.hasAuditTrigger && (
            <div style={{ marginTop: 16 }}>
              <button className="chip-red" onClick={() => navigate('/audit')}>查看紅線稽核紀錄</button>
            </div>
          )}
        </div>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-heading)', marginBottom: 14 }}>
          Closed Loop 進度
        </h2>
        <div className="card" style={{ padding: '24px 28px', marginBottom: 28 }}>
          <div className="timeline">
            {project.phases.map((phase, i) => {
              const style = PHASE[phase.state];
              return (
                <Fragment key={phase.stepNum}>
                  <div className="timeline-step">
                    <div className="timeline-icon" style={{ background: style.bg, color: style.color }}>
                      {style.icon}
                    </div>
                    <div className="timeline-num">STEP {phase.stepNum}</div>
                    <div className="timeline-name">{phase.name}</div>
                    <div className="timeline-subname">{phase.subname}</div>
                    <div className="timeline-summary">{phase.summary}</div>
                    <div className="timeline-ts">{phase.ts}</div>
                  </div>
                  {i < project.phases.length - 1 && <div className="timeline-connector" />}
                </Fragment>
              );
            })}
          </div>
        </div>

        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-heading)', marginBottom: 14 }}>
          Q&A 歷程
        </h2>
        {project.qa.length === 0 ? (
          <div className="card"><div className="empty-state">尚無 Q&A 紀錄</div></div>
        ) : (
          project.qa.map((qa) => {
            const tstyle = QA_TYPE[qa.tstate];
            return (
              <div className="qa-card" key={qa.id}>
                <div className="qa-card-head">
                  <span className="mono-id">{qa.id}</span>
                  <span className="chip" style={{ background: tstyle.bg, color: tstyle.color, cursor: 'default', border: 'none' }}>
                    {qa.type}
                  </span>
                  <StatusPill status={qa.sstate} />
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>{qa.status}</span>
                </div>
                <p style={{ lineHeight: 1.65, marginBottom: 8 }}>{qa.content}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)' }}>
                  <span>複核人：{qa.reviewer}</span>
                  <span className="mono-id">{qa.date}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

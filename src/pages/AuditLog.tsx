import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { GUARDRAIL_STRIP } from '../data/styleMaps';
import type { GuardrailType } from '../data/types';
import { listGuardrailEvents, listProjects, type ApiGuardrailEvent, type ApiProject } from '../api/client';

const TYPES = Object.keys(GUARDRAIL_STRIP) as GuardrailType[];

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false });
}

export function AuditLog() {
  const [typeFilter, setTypeFilter] = useState<GuardrailType | 'all'>('all');
  const [events, setEvents] = useState<ApiGuardrailEvent[]>([]);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([listGuardrailEvents(typeFilter === 'all' ? undefined : typeFilter), listProjects()])
      .then(([ev, projs]) => {
        if (cancelled) return;
        setEvents(ev);
        setProjects(projs);
        setError('');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '讀取稽核紀錄失敗');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [typeFilter]);

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.project_id, p.name]));
    return (id: string) => map.get(id) ?? id;
  }, [projects]);

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 06" title="紅線稽核紀錄" />
      <div className="page-body">
        <div className="toolbar">
          <button className={`chip${typeFilter === 'all' ? ' active' : ''}`} onClick={() => setTypeFilter('all')}>
            全部
          </button>
          {TYPES.map((t) => (
            <button
              key={t}
              className={`chip${typeFilter === t ? ' active' : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {GUARDRAIL_STRIP[t].label}
            </button>
          ))}
        </div>

        {error && (
          <div className="card" style={{ marginBottom: 16, padding: '14px 18px', color: 'var(--red-text)', borderColor: 'var(--red-border)' }}>
            {error}
          </div>
        )}

        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div className="empty-state">載入中…</div>
          ) : (
            <>
              {events.map((e) => {
                const style = GUARDRAIL_STRIP[e.guardrail_type as GuardrailType] ?? { label: e.guardrail_type, color: 'var(--text-dim)' };
                return (
                  <div className="audit-row" key={e.event_id}>
                    <div className="audit-strip" style={{ background: style.color }} />
                    <div className="audit-row-body">
                      <div className="audit-row-head">
                        <span className="mono-id">GL-{e.event_id}</span>
                        <span className="chip" style={{ cursor: 'default', color: style.color, border: 'none' }}>
                          {style.label}
                        </span>
                        <span style={{ fontWeight: 600 }}>{projectName(e.project_id)}</span>
                        <span className="mono-id" style={{ marginLeft: 'auto' }}>{formatTs(e.triggered_at)}</span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{e.detail}</p>
                      <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                        <span>處置結果：{e.resolution ?? '尚未處理'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {events.length === 0 && <div className="empty-state">沒有符合條件的稽核紀錄</div>}
            </>
          )}
        </div>
      </div>
    </>
  );
}

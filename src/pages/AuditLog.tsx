import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { AUDIT } from '../data/seed';
import { GUARDRAIL_STRIP, SEV_MAP } from '../data/styleMaps';
import type { GuardrailType } from '../data/types';

const TYPES = Object.keys(GUARDRAIL_STRIP) as GuardrailType[];

export function AuditLog() {
  const [typeFilter, setTypeFilter] = useState<GuardrailType | 'all'>('all');

  const filtered = useMemo(
    () => AUDIT.filter((a) => typeFilter === 'all' || a.guardrailType === typeFilter),
    [typeFilter],
  );

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

        <div className="card" style={{ overflow: 'hidden' }}>
          {filtered.map((a) => {
            const sev = SEV_MAP[a.sev];
            return (
              <div className="audit-row" key={a.id}>
                <div className="audit-strip" style={{ background: sev.color }} />
                <div className="audit-row-body">
                  <div className="audit-row-head">
                    <span className="mono-id">{a.id}</span>
                    <span className="chip" style={{ background: sev.bg, color: sev.color, cursor: 'default', border: 'none' }}>
                      {sev.label}
                    </span>
                    <span
                      className="chip"
                      style={{ cursor: 'default', color: GUARDRAIL_STRIP[a.guardrailType].color, border: 'none' }}
                    >
                      {a.guardrailType}
                    </span>
                    <span style={{ fontWeight: 600 }}>{a.project}</span>
                    <span className="mono-id" style={{ marginLeft: 'auto' }}>{a.ts}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{a.reason}</p>
                  <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                    <span>處置動作：{a.action}</span>
                    <span>結果：{a.result}</span>
                    <span>操作人：{a.operator}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="empty-state">沒有符合條件的稽核紀錄</div>}
        </div>
      </div>
    </>
  );
}

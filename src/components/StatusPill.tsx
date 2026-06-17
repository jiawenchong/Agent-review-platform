import { STATUS } from '../data/styleMaps';
import type { ProjectStatus } from '../data/types';

export function StatusPill({ status }: { status: ProjectStatus }) {
  const s = STATUS[status];
  return (
    <span className="status-pill" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      <span className="dot" style={{ background: s.color }} />
      <span className="label">{s.label}</span>
    </span>
  );
}

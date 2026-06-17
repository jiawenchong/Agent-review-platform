import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { NOTIFICATIONS } from '../data/seed';
import { useNotifications } from '../context/NotificationContext';
import type { NotifKind } from '../data/types';

const KIND_STYLE: Record<NotifKind, { color: string; bg: string; label: string }> = {
  red: { color: 'var(--red-text)', bg: 'var(--red-bg)', label: '紅線' },
  watch: { color: 'var(--amber-text)', bg: 'var(--amber-bg)', label: '預警' },
  info: { color: 'var(--olive)', bg: 'var(--olive-bg)', label: '提醒' },
};

export function Notifications() {
  const navigate = useNavigate();
  const { unreadIds, markRead } = useNotifications();

  return (
    <>
      <PageHeader eyebrow="Governance Platform · 04" title="通知中心" />
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {NOTIFICATIONS.map((n) => {
          const unread = unreadIds.has(n.id);
          const style = KIND_STYLE[n.kind];
          return (
            <div
              key={n.id}
              className="notif-row"
              style={unread ? { borderLeft: `3px solid ${style.color}` } : undefined}
              onClick={() => navigate(`/projects/${n.projId}`)}
            >
              <span
                className="chip"
                style={{ background: style.bg, color: style.color, cursor: 'default', border: 'none', flexShrink: 0 }}
              >
                {style.label}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{n.title}</span>
                  <span className="mono-id" style={{ marginLeft: 'auto' }}>{n.ts}</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6 }}>{n.body}</p>
              </div>
              {unread && (
                <button
                  className="mark-read-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    markRead(n.id);
                  }}
                >
                  標記已讀
                </button>
              )}
            </div>
          );
        })}
        {NOTIFICATIONS.length === 0 && <div className="empty-state">目前沒有通知</div>}
      </div>
    </>
  );
}
